import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import type { DbRunResult, DbTransactionContext, DbTransactionOptions, DbTransactionWork } from "../types/dataLayer.js";
import type { DbPoolSnapshot } from "../types/observability.js";
import { observeDbQuery, registerDbPoolSnapshotProvider } from "../observability/metricsRegistry.js";
import { runWithDbSpan } from "../observability/tracing.js";
import { resolveDefaultBackupDir, resolveDefaultSqliteDbPath, resolveRepoDataDir } from "../utils/projectPaths.js";

const dbClient = "sqlite";
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const defaultDataDir = resolveRepoDataDir(currentDir);
const configuredDbPath = String(process.env.DB_PATH || "").trim();
const dbPath = configuredDbPath || resolveDefaultSqliteDbPath(currentDir);
const isInMemoryDb = dbPath === ":memory:";
const defaultBackupDir = resolveDefaultBackupDir(currentDir);
const backupFileExtension = ".backup.sqlite";
const migrationsDirectory = path.join(currentDir, "..", "migrations");
const supportsNativeBackup = true;

if (!isInMemoryDb && !fs.existsSync(defaultDataDir)) {
  fs.mkdirSync(defaultDataDir, { recursive: true });
}

const db = new Database(dbPath);
const defaultBusyTimeoutMs = 5000;
// The application intentionally uses one process-wide synchronous SQLite connection.
// Promise-returning helpers below keep a consistent async interface but do not offload work from the event loop.
db.pragma("foreign_keys = ON");
if (!isInMemoryDb) {
  db.pragma("journal_mode = WAL");
}
db.pragma(`busy_timeout = ${defaultBusyTimeoutMs}`);

type SqliteTransactionStore = {
  depth: number;
  savepointCounter: number;
  context: DbTransactionContext;
};

const transactionStorage = new AsyncLocalStorage<SqliteTransactionStore>();
let sqliteTransactionQueue: Promise<void> = Promise.resolve();
const sqlitePoolSnapshot: DbPoolSnapshot = {
  maxConnections: 1,
  totalConnections: 1,
  activeConnections: 0,
  idleConnections: 1,
  waitingClients: 0,
  acquires: 0,
  averageAcquireWaitMs: 0,
  maxAcquireWaitMs: 0,
  lastAcquireWaitMs: 0,
  acquireTimeouts: 0,
  alerts: {
    highAcquireWait: false,
    poolExhausted: false,
  },
};

registerDbPoolSnapshotProvider("sqlite", () => ({
  sqlite: { ...sqlitePoolSnapshot },
}));

async function runQueuedSqliteTransaction<T>(work: () => Promise<T>): Promise<T> {
  const previous = sqliteTransactionQueue;
  let releaseQueue: (() => void) | undefined;
  sqliteTransactionQueue = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });

  await previous;
  try {
    return await work();
  } finally {
    if (typeof releaseQueue === "function") {
      releaseQueue();
    }
  }
}

/**
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {DbRunResult}
 */
function observeSqliteQuery<T>(work: () => T): T {
  const startedAtMs = Date.now();
  sqlitePoolSnapshot.acquires += 1;
  sqlitePoolSnapshot.activeConnections = 1;
  sqlitePoolSnapshot.idleConnections = 0;
  try {
    return work();
  } finally {
    observeDbQuery(Date.now() - startedAtMs);
    sqlitePoolSnapshot.activeConnections = 0;
    sqlitePoolSnapshot.idleConnections = 1;
  }
}

/**
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {DbRunResult}
 */
function runSync(sql: string, params: unknown[] = []): DbRunResult {
  return runWithDbSpan({ databaseSystem: "sqlite", poolName: "sqlite", sql }, () => observeSqliteQuery(() => {
    const statement = db.prepare(sql);
    const info = statement.run(params);
    return {
      lastID: Number(info.lastInsertRowid),
      changes: info.changes,
    };
  }));
}

/**
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {Record<string, any> | null | undefined}
 */
function getSync(sql: string, params: unknown[] = []): Record<string, any> | null | undefined {
  return runWithDbSpan({ databaseSystem: "sqlite", poolName: "sqlite", sql }, () => observeSqliteQuery(() => {
    const statement = db.prepare(sql);
    return statement.get(params) as Record<string, any> | null | undefined;
  }));
}

/**
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {Array<Record<string, any>>}
 */
function allSync(sql: string, params: unknown[] = []): Array<Record<string, any>> {
  return runWithDbSpan({ databaseSystem: "sqlite", poolName: "sqlite", sql }, () => observeSqliteQuery(() => {
    const statement = db.prepare(sql);
    return statement.all(params) as Array<Record<string, any>>;
  }));
}

/**
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {Promise<DbRunResult>}
 */
async function run(sql: string, params: unknown[] = []): Promise<DbRunResult> {
  return runSync(sql, params);
}

/**
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {Promise<Record<string, any> | null | undefined>}
 */
async function get(sql: string, params: unknown[] = []): Promise<Record<string, any> | null | undefined> {
  return getSync(sql, params);
}

/**
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {Promise<Array<Record<string, any>>>}
 */
async function all(sql: string, params: unknown[] = []): Promise<Array<Record<string, any>>> {
  return allSync(sql, params);
}

/**
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {Promise<Record<string, any> | null | undefined>}
 */
async function readGet(sql: string, params: unknown[] = []): Promise<Record<string, any> | null | undefined> {
  return getSync(sql, params);
}

/**
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {Promise<Array<Record<string, any>>>}
 */
async function readAll(sql: string, params: unknown[] = []): Promise<Array<Record<string, any>>> {
  return allSync(sql, params);
}

/**
 * @param {DbTransactionWork} work
 * @param {DbTransactionOptions} [options]
 * @returns {Promise<unknown>}
 */
async function executeTransaction<T = unknown>(
  work: DbTransactionWork<T>,
  options: DbTransactionOptions = {},
): Promise<T> {
  if (typeof work !== "function") {
    throw new TypeError("executeTransaction requires a callback function");
  }

  const activeStore = transactionStorage.getStore();
  if (activeStore) {
    activeStore.savepointCounter += 1;
    const savepointName = `sp_${activeStore.savepointCounter}`;
    db.exec(`SAVEPOINT ${savepointName}`);
    activeStore.depth += 1;
    try {
      const result = await Promise.resolve(work(activeStore.context));
      db.exec(`RELEASE SAVEPOINT ${savepointName}`);
      return result;
    } catch (error) {
      db.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`);
      db.exec(`RELEASE SAVEPOINT ${savepointName}`);
      throw error;
    } finally {
      activeStore.depth -= 1;
    }
  }

  return runQueuedSqliteTransaction(async () => {
    const requestedBusyTimeoutMs = Number(options.busyTimeoutMs);
    const busyTimeoutMs = Number.isFinite(requestedBusyTimeoutMs) && requestedBusyTimeoutMs >= 0
      ? Math.floor(requestedBusyTimeoutMs)
      : defaultBusyTimeoutMs;
    const previousBusyTimeoutMs = Number(
      db.pragma("busy_timeout", { simple: true }) || defaultBusyTimeoutMs,
    );

    if (busyTimeoutMs !== previousBusyTimeoutMs) {
      db.pragma(`busy_timeout = ${busyTimeoutMs}`);
    }

    db.exec("BEGIN IMMEDIATE");
    try {
      const txContext: DbTransactionContext = {
        run: async (sql: string, params: unknown[] = []) => runSync(sql, params),
        get: async (sql: string, params: unknown[] = []) => getSync(sql, params),
        all: async (sql: string, params: unknown[] = []) => allSync(sql, params),
      };
      const store: SqliteTransactionStore = {
        depth: 1,
        savepointCounter: 0,
        context: txContext,
      };
      const result = await transactionStorage.run(store, async () => Promise.resolve(work(txContext)));
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    } finally {
      if (busyTimeoutMs !== previousBusyTimeoutMs) {
        db.pragma(`busy_timeout = ${previousBusyTimeoutMs}`);
      }
    }
  });
}

function getDatabaseInfo() {
  return {
    client: dbClient,
    path: dbPath,
    isInMemory: isInMemoryDb,
  };
}

function closeDb() {
  db.close();
}

export {
  dbClient,
  db,
  dbPath,
  isInMemoryDb,
  defaultBackupDir,
  backupFileExtension,
  migrationsDirectory,
  supportsNativeBackup,
  runSync,
  getSync,
  allSync,
  run,
  get,
  all,
  readGet,
  readAll,
  executeTransaction,
  getDatabaseInfo,
  closeDb,
};


