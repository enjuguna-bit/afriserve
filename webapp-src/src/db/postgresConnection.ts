import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import type { DbRunResult, DbTransactionContext, DbTransactionWork } from "../types/dataLayer.js";

const dbClient = "postgres";
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.join(currentDir, "..", "migrations");
const defaultBackupDir = "";
const backupFileExtension = "";
const supportsNativeBackup = false;
const isInMemoryDb = false;
const dbPath = String(process.env.DATABASE_URL || "").trim();
const db = null;
const runSync = null;
const getSync = null;
const allSync = null;

let pool: import("pg").Pool | null = null;
let readPool: import("pg").Pool | null = null;

type PostgresTransactionStore = {
  client: import("pg").PoolClient;
  depth: number;
  savepointCounter: number;
  context: DbTransactionContext;
};

const transactionStorage = new AsyncLocalStorage<PostgresTransactionStore>();

/**
 * @returns {import("pg").Pool}
 */
function getPool(): import("pg").Pool {
  if (pool) {
    return pool;
  }

  const connectionString = String(process.env.DATABASE_URL || "").trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required when DB_CLIENT=postgres");
  }

  const configuredMax = Number(process.env.PG_POOL_MAX);
  const configuredIdleTimeoutMs = Number(process.env.PG_IDLE_TIMEOUT_MS);
  const configuredConnectionTimeoutMs = Number(process.env.PG_CONNECTION_TIMEOUT_MS);

  pool = new Pool({
    connectionString,
    max: Number.isFinite(configuredMax) && configuredMax >= 1 ? Math.floor(configuredMax) : 20,
    idleTimeoutMillis: Number.isFinite(configuredIdleTimeoutMs) && configuredIdleTimeoutMs >= 0
      ? Math.floor(configuredIdleTimeoutMs)
      : 30000,
    connectionTimeoutMillis: Number.isFinite(configuredConnectionTimeoutMs) && configuredConnectionTimeoutMs >= 0
      ? Math.floor(configuredConnectionTimeoutMs)
      : 5000,
  });

  return pool;
}

/**
 * @returns {import("pg").Pool}
 */
function getReadPool(): import("pg").Pool {
  if (readPool) {
    return readPool;
  }

  const readConnectionString = String(process.env.DATABASE_READ_URL || "").trim();
  if (!readConnectionString) {
    // CQRS fallback: use primary when a replica is not configured.
    return getPool();
  }

  const configuredMax = Number(process.env.PG_READ_POOL_MAX || process.env.PG_POOL_MAX);
  const configuredIdleTimeoutMs = Number(process.env.PG_READ_IDLE_TIMEOUT_MS || process.env.PG_IDLE_TIMEOUT_MS);
  const configuredConnectionTimeoutMs = Number(
    process.env.PG_READ_CONNECTION_TIMEOUT_MS || process.env.PG_CONNECTION_TIMEOUT_MS,
  );

  readPool = new Pool({
    connectionString: readConnectionString,
    max: Number.isFinite(configuredMax) && configuredMax >= 1 ? Math.floor(configuredMax) : 20,
    idleTimeoutMillis: Number.isFinite(configuredIdleTimeoutMs) && configuredIdleTimeoutMs >= 0
      ? Math.floor(configuredIdleTimeoutMs)
      : 30000,
    connectionTimeoutMillis: Number.isFinite(configuredConnectionTimeoutMs) && configuredConnectionTimeoutMs >= 0
      ? Math.floor(configuredConnectionTimeoutMs)
      : 5000,
  });

  return readPool;
}

/**
 * @param {string} sql
 * @returns {string}
 */
function translateSql(sql: string): string {
  let translated = String(sql || "");

  translated = translated.replace(/datetime\(\s*'now'\s*\)/gi, "CURRENT_TIMESTAMP");
  translated = translated.replace(/datetime\(\s*\?\s*\)/gi, "CAST(? AS timestamp)");
  translated = translated.replace(/datetime\(\s*([a-zA-Z0-9_."`]+)\s*\)/gi, "CAST($1 AS timestamp)");
  translated = translated.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, "INSERT INTO");
  translated = translated.replace(/\bAUTOINCREMENT\b/gi, "");

  return translated;
}

/**
 * @param {string} sql
 * @returns {string}
 */
function convertPlaceholders(sql: string): string {
  let index = 0;
  let out = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (char === "'" && !inDoubleQuote) {
      if (inSingleQuote && next === "'") {
        out += "''";
        i += 1;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      out += char;
      continue;
    }

    if (char === "\"" && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      out += char;
      continue;
    }

    if (char === "?" && !inSingleQuote && !inDoubleQuote) {
      index += 1;
      out += `$${index}`;
      continue;
    }

    out += char;
  }

  return out;
}

/**
 * @param {import("pg").PoolClient | import("pg").Pool} executor
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {Promise<DbRunResult>}
 */
async function runWithExecutor(
  executor: import("pg").PoolClient | import("pg").Pool,
  sql: string,
  params: unknown[] = [],
): Promise<DbRunResult> {
  let translatedSql = convertPlaceholders(translateSql(sql));
  const isInsert = /^\s*insert\s+into\s+/i.test(translatedSql);
  const hasReturning = /\breturning\b/i.test(translatedSql);
  if (isInsert && !hasReturning) {
    translatedSql = `${translatedSql.trim()} RETURNING id`;
  }

  let result: { rows: Array<Record<string, unknown>>; rowCount: number | null };
  try {
    result = await executor.query(translatedSql, params);
  } catch (error) {
    // Some tables do not expose an `id` column. Retry insert without RETURNING id.
    if (isInsert && !hasReturning) {
      const fallbackSql = translatedSql.replace(/\s+RETURNING\s+id\s*$/i, "");
      result = await executor.query(fallbackSql, params);
    } else {
      throw error;
    }
  }

  const payload: DbRunResult = {
    changes: result.rowCount || 0,
  };

  const firstRow = result.rows[0] as Record<string, unknown> | undefined;
  const firstRowId = firstRow?.id;
  if (typeof firstRowId !== "undefined" && Number.isFinite(Number(firstRowId))) {
    payload.lastID = Number(firstRowId);
  }

  return payload;
}

/**
 * @param {import("pg").PoolClient | import("pg").Pool} executor
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {Promise<Record<string, any> | null | undefined>}
 */
async function getWithExecutor(
  executor: import("pg").PoolClient | import("pg").Pool,
  sql: string,
  params: unknown[] = [],
): Promise<Record<string, any> | null | undefined> {
  const translatedSql = convertPlaceholders(translateSql(sql));
  const result = await executor.query(translatedSql, params);
  return result.rows[0];
}

/**
 * @param {import("pg").PoolClient | import("pg").Pool} executor
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {Promise<Array<Record<string, any>>>}
 */
async function allWithExecutor(
  executor: import("pg").PoolClient | import("pg").Pool,
  sql: string,
  params: unknown[] = [],
): Promise<Array<Record<string, any>>> {
  const translatedSql = convertPlaceholders(translateSql(sql));
  const result = await executor.query(translatedSql, params);
  return result.rows;
}

/**
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {Promise<DbRunResult>}
 */
async function run(sql: string, params: unknown[] = []): Promise<DbRunResult> {
  return runWithExecutor(getPool(), sql, params);
}

/**
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {Promise<Record<string, any> | null | undefined>}
 */
async function get(sql: string, params: unknown[] = []): Promise<Record<string, any> | null | undefined> {
  return getWithExecutor(getPool(), sql, params);
}

/**
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {Promise<Array<Record<string, any>>>}
 */
async function all(sql: string, params: unknown[] = []): Promise<Array<Record<string, any>>> {
  return allWithExecutor(getPool(), sql, params);
}

/**
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {Promise<Record<string, any> | null | undefined>}
 */
async function readGet(sql: string, params: unknown[] = []): Promise<Record<string, any> | null | undefined> {
  return getWithExecutor(getReadPool(), sql, params);
}

/**
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {Promise<Array<Record<string, any>>>}
 */
async function readAll(sql: string, params: unknown[] = []): Promise<Array<Record<string, any>>> {
  return allWithExecutor(getReadPool(), sql, params);
}

/**
 * @param {DbTransactionWork} work
 * @returns {Promise<unknown>}
 */
async function executeTransaction(work: DbTransactionWork): Promise<unknown> {
  if (typeof work !== "function") {
    throw new TypeError("executeTransaction requires a callback function");
  }

  const activeStore = transactionStorage.getStore();
  if (activeStore) {
    activeStore.savepointCounter += 1;
    const savepointName = `sp_${activeStore.savepointCounter}`;
    await activeStore.client.query(`SAVEPOINT ${savepointName}`);
    activeStore.depth += 1;
    try {
      const result = await Promise.resolve(work(activeStore.context));
      await activeStore.client.query(`RELEASE SAVEPOINT ${savepointName}`);
      return result;
    } catch (error) {
      await activeStore.client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
      await activeStore.client.query(`RELEASE SAVEPOINT ${savepointName}`);
      throw error;
    } finally {
      activeStore.depth -= 1;
    }
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    const txContext: DbTransactionContext = {
      run: async (sql: string, params: unknown[] = []) => runWithExecutor(client, sql, params),
      get: async (sql: string, params: unknown[] = []) => getWithExecutor(client, sql, params),
      all: async (sql: string, params: unknown[] = []) => allWithExecutor(client, sql, params),
    };
    const store: PostgresTransactionStore = {
      client,
      depth: 1,
      savepointCounter: 0,
      context: txContext,
    };
    const result = await transactionStorage.run(store, async () => Promise.resolve(work(txContext)));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function getDatabaseInfo() {
  return {
    client: dbClient,
    path: dbPath || "postgres://<configured>",
    isInMemory: false,
  };
}

async function closeDb() {
  if (pool) {
    const activePool = pool;
    pool = null;
    await activePool.end();
  }
  if (readPool) {
    const activeReadPool = readPool;
    readPool = null;
    await activeReadPool.end();
  }
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
