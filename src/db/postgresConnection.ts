import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import type { DbRunResult, DbTransactionContext, DbTransactionOptions, DbTransactionWork } from "../types/dataLayer.js";
import type { DbPoolSnapshot } from "../types/observability.js";
import { observeDbQuery, registerDbPoolSnapshotProvider } from "../observability/metricsRegistry.js";
import { runWithDbSpan } from "../observability/tracing.js";
import { getCurrentTenantId } from "../utils/tenantStore.js";

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

type PoolName = "primary" | "read";
type PoolMonitoringState = {
  maxConnections: number;
  highAcquireWaitThresholdMs: number;
  acquires: number;
  totalAcquireWaitMs: number;
  maxAcquireWaitMs: number;
  lastAcquireWaitMs: number;
  acquireTimeouts: number;
};

type PostgresTransactionStore = {
  client: import("pg").PoolClient;
  depth: number;
  savepointCounter: number;
  context: DbTransactionContext;
};

const transactionStorage = new AsyncLocalStorage<PostgresTransactionStore>();
const poolMonitoring: Record<PoolName, PoolMonitoringState> = {
  primary: {
    maxConnections: 20,
    highAcquireWaitThresholdMs: 250,
    acquires: 0,
    totalAcquireWaitMs: 0,
    maxAcquireWaitMs: 0,
    lastAcquireWaitMs: 0,
    acquireTimeouts: 0,
  },
  read: {
    maxConnections: 20,
    highAcquireWaitThresholdMs: 250,
    acquires: 0,
    totalAcquireWaitMs: 0,
    maxAcquireWaitMs: 0,
    lastAcquireWaitMs: 0,
    acquireTimeouts: 0,
  },
};

registerDbPoolSnapshotProvider("postgres", () => {
  const snapshots: Record<string, DbPoolSnapshot> = {};
  const primarySnapshot = buildPoolSnapshot("primary", pool);
  if (primarySnapshot) {
    snapshots.primary = primarySnapshot;
  }
  const readSnapshot = buildPoolSnapshot("read", readPool);
  if (readSnapshot) {
    snapshots.read = readSnapshot;
  }
  return snapshots;
});

function configurePoolMonitoring(poolName: PoolName, maxConnections: number, connectionTimeoutMs: number): void {
  const state = poolMonitoring[poolName];
  state.maxConnections = Math.max(1, Math.floor(maxConnections || 1));
  state.highAcquireWaitThresholdMs = Math.max(100, Math.floor(connectionTimeoutMs / 2) || 250);
}

function recordPoolAcquire(poolName: PoolName, waitMs: number): void {
  const state = poolMonitoring[poolName];
  const normalizedWaitMs = Number.isFinite(waitMs) ? Math.max(0, waitMs) : 0;
  state.acquires += 1;
  state.lastAcquireWaitMs = normalizedWaitMs;
  state.totalAcquireWaitMs += normalizedWaitMs;
  if (normalizedWaitMs > state.maxAcquireWaitMs) {
    state.maxAcquireWaitMs = normalizedWaitMs;
  }
}

function buildPoolSnapshot(poolName: PoolName, activePool: import("pg").Pool | null): DbPoolSnapshot | null {
  if (!activePool) {
    return null;
  }

  const state = poolMonitoring[poolName];
  const totalConnections = Number(activePool.totalCount || 0);
  const idleConnections = Number(activePool.idleCount || 0);
  const activeConnections = Math.max(0, totalConnections - idleConnections);
  const waitingClients = Number(activePool.waitingCount || 0);
  const averageAcquireWaitMs = state.acquires > 0
    ? Number((state.totalAcquireWaitMs / state.acquires).toFixed(2))
    : 0;

  return {
    maxConnections: state.maxConnections,
    totalConnections,
    activeConnections,
    idleConnections,
    waitingClients,
    acquires: state.acquires,
    averageAcquireWaitMs,
    maxAcquireWaitMs: Number(state.maxAcquireWaitMs.toFixed(2)),
    lastAcquireWaitMs: Number(state.lastAcquireWaitMs.toFixed(2)),
    acquireTimeouts: state.acquireTimeouts,
    alerts: {
      highAcquireWait: waitingClients > 0
        && Math.max(averageAcquireWaitMs, state.lastAcquireWaitMs) >= state.highAcquireWaitThresholdMs,
      poolExhausted: waitingClients > 0 && activeConnections >= state.maxConnections,
    },
  };
}

function isPoolAcquireTimeoutError(error: unknown): boolean {
  const message = String((error as { message?: unknown })?.message || "").toLowerCase();
  return message.includes("timeout") && message.includes("connect");
}

function wrapPoolAcquireError(error: unknown, poolName: PoolName, waitMs: number): unknown {
  if (!isPoolAcquireTimeoutError(error)) {
    return error;
  }

  const snapshot = buildPoolSnapshot(poolName, poolName === "primary" ? pool : readPool);
  const wrapped = new Error(
    `Database ${poolName} pool acquisition timed out after ${Math.max(0, Math.floor(waitMs))}ms `
    + `(active=${snapshot?.activeConnections || 0}, waiting=${snapshot?.waitingClients || 0}, `
    + `max=${snapshot?.maxConnections || poolMonitoring[poolName].maxConnections}).`,
  ) as Error & { cause?: unknown };
  wrapped.cause = error;
  return wrapped;
}

async function acquirePoolClient(
  poolName: PoolName,
  activePool: import("pg").Pool,
): Promise<import("pg").PoolClient> {
  const startedAtMs = Date.now();
  try {
    const client = await activePool.connect();
    recordPoolAcquire(poolName, Date.now() - startedAtMs);
    return client;
  } catch (error) {
    if (isPoolAcquireTimeoutError(error)) {
      poolMonitoring[poolName].acquireTimeouts += 1;
    }
    throw wrapPoolAcquireError(error, poolName, Date.now() - startedAtMs);
  }
}

async function applyTenantSessionConfig(client: import("pg").PoolClient): Promise<void> {
  await client.query(
    "SELECT set_config('app.tenant_id', $1, false)",
    [getCurrentTenantId()],
  );
}

async function withPoolClient<T>(
  poolName: PoolName,
  activePool: import("pg").Pool,
  work: (client: import("pg").PoolClient) => Promise<T>,
): Promise<T> {
  const client = await acquirePoolClient(poolName, activePool);
  try {
    await applyTenantSessionConfig(client);
    return await work(client);
  } finally {
    client.release();
  }
}

async function queryWithObservation<T>(
  client: import("pg").PoolClient,
  poolName: PoolName,
  sql: string,
  params: unknown[],
): Promise<T> {
  return runWithDbSpan(
    {
      databaseSystem: "postgresql",
      poolName,
      sql,
    },
    async () => {
      const startedAtMs = Date.now();
      try {
        return await client.query(sql, params) as T;
      } finally {
        observeDbQuery(Date.now() - startedAtMs);
      }
    },
  );
}

function normalizeIsolationLevel(value: unknown): "READ COMMITTED" | "REPEATABLE READ" | "SERIALIZABLE" {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "read committed") {
    return "READ COMMITTED";
  }
  if (normalized === "repeatable read") {
    return "REPEATABLE READ";
  }
  return "SERIALIZABLE";
}

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
  const maxConnections = Number.isFinite(configuredMax) && configuredMax >= 1 ? Math.floor(configuredMax) : 20;
  const connectionTimeoutMillis = Number.isFinite(configuredConnectionTimeoutMs) && configuredConnectionTimeoutMs >= 0
    ? Math.floor(configuredConnectionTimeoutMs)
    : 3000;

  pool = new Pool({
    connectionString,
    max: maxConnections,
    idleTimeoutMillis: Number.isFinite(configuredIdleTimeoutMs) && configuredIdleTimeoutMs >= 0
      ? Math.floor(configuredIdleTimeoutMs)
      : 10000,
    connectionTimeoutMillis,
  });
  configurePoolMonitoring("primary", maxConnections, connectionTimeoutMillis);

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
  const maxConnections = Number.isFinite(configuredMax) && configuredMax >= 1 ? Math.floor(configuredMax) : 20;
  const connectionTimeoutMillis = Number.isFinite(configuredConnectionTimeoutMs) && configuredConnectionTimeoutMs >= 0
    ? Math.floor(configuredConnectionTimeoutMs)
    : 3000;

  readPool = new Pool({
    connectionString: readConnectionString,
    max: maxConnections,
    idleTimeoutMillis: Number.isFinite(configuredIdleTimeoutMs) && configuredIdleTimeoutMs >= 0
      ? Math.floor(configuredIdleTimeoutMs)
      : 10000,
    connectionTimeoutMillis,
  });
  configurePoolMonitoring("read", maxConnections, connectionTimeoutMillis);

  return readPool;
}

function translateJuliandayOperand(operand: string): string {
  const normalized = String(operand || "").trim();
  // 'now' or empty → current moment as timestamp
  if (!normalized || /^'now'$/i.test(normalized)) {
    return "CURRENT_TIMESTAMP";
  }
  // SQLite date(expr) just truncates to midnight — cast inner expr to date then to timestamp
  const dateWrapMatch = normalized.match(/^date\(\s*([\s\S]+?)\s*\)$/i);
  if (dateWrapMatch) {
    const inner = (dateWrapMatch[1] ?? "").trim();
    if (!inner || /^'now'$/i.test(inner)) {
      return "CURRENT_DATE::timestamp";
    }
    return `CAST(${inner} AS date)::timestamp`;
  }
  return `CAST(${normalized} AS timestamp)`;
}

function translateDateOperand(operand: string): string {
  const normalized = String(operand || "").trim();
  if (!normalized || /^'now'$/i.test(normalized)) {
    return "CURRENT_DATE";
  }
  return `CAST(${normalized} AS date)`;
}

function translateDatetimeWithHourModifier(operand: string, hourModifier: string): string {
  const normalizedHourModifier = String(hourModifier || "").trim();
  const numericHours = Number.parseInt(normalizedHourModifier, 10);
  const safeHours = Number.isFinite(numericHours) ? numericHours : 0;
  const baseOperand = translateJuliandayOperand(operand);
  if (safeHours === 0) {
    return baseOperand;
  }
  const intervalHours = Math.abs(safeHours);
  const intervalDirection = safeHours >= 0 ? "+" : "-";
  return `(${baseOperand} ${intervalDirection} INTERVAL '${intervalHours} hours')`;
}

function translateGroupConcatExpression(expression: string, separator = ","): string {
  const normalizedExpression = String(expression || "").trim();
  const normalizedSeparator = String(separator || ",").replace(/'/g, "''");
  return `STRING_AGG((${normalizedExpression})::text, '${normalizedSeparator}')`;
}

function splitTopLevelSqlArguments(value: string): string[] {
  const source = String(value || "");
  const segments: string[] = [];
  let current = "";
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (!inDoubleQuote && char === "'") {
      current += char;
      if (inSingleQuote && next === "'") {
        current += "'";
        index += 1;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (!inSingleQuote && char === "\"") {
      inDoubleQuote = !inDoubleQuote;
      current += char;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote) {
      if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        depth -= 1;
      } else if (char === "," && depth === 0) {
        segments.push(current.trim());
        current = "";
        continue;
      }
    }

    current += char;
  }

  if (current.trim() || segments.length > 0) {
    segments.push(current.trim());
  }

  return segments;
}

function translateDatetimeCall(operand: string): string {
  const argumentsList = splitTopLevelSqlArguments(operand);
  if (argumentsList.length === 2) {
    const hourModifierMatch = argumentsList[1]?.match(/^'([+-]?\d+)\s+hours?'$/i);
    if (hourModifierMatch?.[1]) {
      return translateDatetimeWithHourModifier(argumentsList[0] || "", hourModifierMatch[1]);
    }
  }

  return translateJuliandayOperand(operand);
}

function translateJuliandayCall(operand: string): string {
  return `(EXTRACT(EPOCH FROM ${translateJuliandayOperand(operand)}) / 86400.0)`;
}

function isSqlIdentifierChar(char: string | undefined): boolean {
  return Boolean(char && /[A-Za-z0-9_]/.test(char));
}

function replaceSqlFunctionCalls(
  sql: string,
  functionName: string,
  transform: (operand: string) => string,
): string {
  const source = String(sql || "");
  const lowerFunctionName = functionName.toLowerCase();
  let output = "";
  let index = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (!inDoubleQuote && char === "'") {
      if (inSingleQuote && next === "'") {
        output += "''";
        index += 2;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      output += char;
      index += 1;
      continue;
    }

    if (!inSingleQuote && char === "\"") {
      inDoubleQuote = !inDoubleQuote;
      output += char;
      index += 1;
      continue;
    }

    if (inSingleQuote || inDoubleQuote) {
      output += char;
      index += 1;
      continue;
    }

    const candidate = source.slice(index, index + functionName.length);
    if (
      candidate.toLowerCase() !== lowerFunctionName
      || isSqlIdentifierChar(source[index - 1])
      || isSqlIdentifierChar(source[index + functionName.length])
    ) {
      output += char;
      index += 1;
      continue;
    }

    let cursor = index + functionName.length;
    while (cursor < source.length && /\s/.test(source[cursor] || "")) {
      cursor += 1;
    }

    if (source[cursor] !== "(") {
      output += char;
      index += 1;
      continue;
    }

    let depth = 0;
    let endIndex = -1;
    let nestedInSingleQuote = false;
    let nestedInDoubleQuote = false;

    for (let scanIndex = cursor; scanIndex < source.length; scanIndex += 1) {
      const scanChar = source[scanIndex];
      const scanNext = source[scanIndex + 1];

      if (!nestedInDoubleQuote && scanChar === "'") {
        if (nestedInSingleQuote && scanNext === "'") {
          scanIndex += 1;
          continue;
        }
        nestedInSingleQuote = !nestedInSingleQuote;
        continue;
      }

      if (!nestedInSingleQuote && scanChar === "\"") {
        nestedInDoubleQuote = !nestedInDoubleQuote;
        continue;
      }

      if (nestedInSingleQuote || nestedInDoubleQuote) {
        continue;
      }

      if (scanChar === "(") {
        depth += 1;
      } else if (scanChar === ")") {
        depth -= 1;
        if (depth === 0) {
          endIndex = scanIndex;
          break;
        }
      }
    }

    if (endIndex === -1) {
      output += char;
      index += 1;
      continue;
    }

    const operand = source.slice(cursor + 1, endIndex);
    output += transform(operand);
    index = endIndex + 1;
  }

  return output;
}

/**
 * @param {string} sql
 * @returns {string}
 */
function translateSql(sql: string): string {
  let translated = String(sql || "");
  translated = replaceSqlFunctionCalls(translated, "datetime", (operand) => translateDatetimeCall(operand));
  translated = replaceSqlFunctionCalls(translated, "date", (operand) => translateDateOperand(operand));
  translated = replaceSqlFunctionCalls(translated, "julianday", (operand) => translateJuliandayCall(operand));
  translated = translated.replace(
    /GROUP_CONCAT\(\s*((?:[^()]+|\([^()]*\))+?)\s*,\s*'([^']*)'\s*\)/gi,
    (_match, expression, separator) => translateGroupConcatExpression(expression, separator),
  );
  translated = translated.replace(
    /GROUP_CONCAT\(\s*((?:[^()]+|\([^()]*\))+?)\s*\)/gi,
    (_match, expression) => translateGroupConcatExpression(expression),
  );
  translated = translated.replace(/\s+COLLATE\s+NOCASE\b/gi, "");
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
 * @param {import("pg").PoolClient} client
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {Promise<DbRunResult>}
 */
async function runWithExecutor(
  client: import("pg").PoolClient,
  poolName: PoolName,
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
    result = await queryWithObservation(client, poolName, translatedSql, params);
  } catch (error) {
    // Some tables do not expose an `id` column. Retry insert without RETURNING id.
    if (isInsert && !hasReturning) {
      const fallbackSql = translatedSql.replace(/\s+RETURNING\s+id\s*$/i, "");
      result = await queryWithObservation(client, poolName, fallbackSql, params);
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
 * @param {import("pg").PoolClient} client
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {Promise<Record<string, any> | null | undefined>}
 */
async function getWithExecutor(
  client: import("pg").PoolClient,
  poolName: PoolName,
  sql: string,
  params: unknown[] = [],
): Promise<Record<string, any> | null | undefined> {
  const translatedSql = convertPlaceholders(translateSql(sql));
  const result = await queryWithObservation<{ rows: Array<Record<string, any>> }>(client, poolName, translatedSql, params);
  return result.rows[0];
}

/**
 * @param {import("pg").PoolClient} client
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {Promise<Array<Record<string, any>>>}
 */
async function allWithExecutor(
  client: import("pg").PoolClient,
  poolName: PoolName,
  sql: string,
  params: unknown[] = [],
): Promise<Array<Record<string, any>>> {
  const translatedSql = convertPlaceholders(translateSql(sql));
  const result = await queryWithObservation<{ rows: Array<Record<string, any>> }>(client, poolName, translatedSql, params);
  return result.rows;
}

/**
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {Promise<DbRunResult>}
 */
async function run(sql: string, params: unknown[] = []): Promise<DbRunResult> {
  return withPoolClient("primary", getPool(), (client) => runWithExecutor(client, "primary", sql, params));
}

/**
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {Promise<Record<string, any> | null | undefined>}
 */
async function get(sql: string, params: unknown[] = []): Promise<Record<string, any> | null | undefined> {
  return withPoolClient("primary", getPool(), (client) => getWithExecutor(client, "primary", sql, params));
}

/**
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {Promise<Array<Record<string, any>>>}
 */
async function all(sql: string, params: unknown[] = []): Promise<Array<Record<string, any>>> {
  return withPoolClient("primary", getPool(), (client) => allWithExecutor(client, "primary", sql, params));
}

function getReadPoolTarget(): { poolName: PoolName; pool: import("pg").Pool } {
  const activeReadPool = getReadPool();
  return readPool
    ? { poolName: "read", pool: activeReadPool }
    : { poolName: "primary", pool: activeReadPool };
}

/**
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {Promise<Record<string, any> | null | undefined>}
 */
async function readGet(sql: string, params: unknown[] = []): Promise<Record<string, any> | null | undefined> {
  const target = getReadPoolTarget();
  return withPoolClient(target.poolName, target.pool, (client) => getWithExecutor(client, target.poolName, sql, params));
}

/**
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {Promise<Array<Record<string, any>>>}
 */
async function readAll(sql: string, params: unknown[] = []): Promise<Array<Record<string, any>>> {
  const target = getReadPoolTarget();
  return withPoolClient(target.poolName, target.pool, (client) => allWithExecutor(client, target.poolName, sql, params));
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

  const client = await acquirePoolClient("primary", getPool());
  try {
    await applyTenantSessionConfig(client);
    await client.query(`BEGIN ISOLATION LEVEL ${normalizeIsolationLevel(options.isolationLevel)}`);
    const txContext: DbTransactionContext = {
      run: async (sql: string, params: unknown[] = []) => runWithExecutor(client, "primary", sql, params),
      get: async (sql: string, params: unknown[] = []) => getWithExecutor(client, "primary", sql, params),
      all: async (sql: string, params: unknown[] = []) => allWithExecutor(client, "primary", sql, params),
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

async function initializePool(): Promise<void> {
  const client = await acquirePoolClient("primary", getPool());
  try { await client.query("SELECT 1"); } finally { client.release(); }
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
  initializePool,
  translateSql,
  convertPlaceholders,
};
