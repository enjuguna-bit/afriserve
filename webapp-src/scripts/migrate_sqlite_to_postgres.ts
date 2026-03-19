#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { Client } from "pg";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSqlitePath = path.join(currentDir, "..", "data", "microfinance.db");
const sqlitePath = String(process.env.SQLITE_MIGRATION_SOURCE || process.env.DB_PATH || defaultSqlitePath).trim();
const postgresUrl = String(process.env.DATABASE_URL || "").trim();
const targetSchema = String(process.env.PG_MIGRATION_SCHEMA || "public").trim() || "public";
const configuredBatchSize = Number(process.env.PG_MIGRATION_BATCH_SIZE);
const batchSize = Number.isFinite(configuredBatchSize) && configuredBatchSize >= 1
  ? Math.floor(configuredBatchSize)
  : 500;
const truncateTarget = parseBoolean(process.env.PG_MIGRATION_TRUNCATE_TARGET, false);
const allowlist = String(process.env.PG_MIGRATION_TABLE_ALLOWLIST || "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

if (!postgresUrl) {
  throw new Error("DATABASE_URL is required for PostgreSQL migration.");
}
if (!sqlitePath || !fs.existsSync(sqlitePath)) {
  throw new Error(`SQLite source database not found: ${sqlitePath}`);
}

function parseBoolean(value: unknown, fallback = false): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function qid(identifier: string): string {
  return `"${String(identifier || "").replace(/"/g, "\"\"")}"`;
}

function qname(schema: string, table: string): string {
  return `${qid(schema)}.${qid(table)}`;
}

function isNumericDataType(dataType: string, udtName: string): boolean {
  const normalizedDataType = String(dataType || "").toLowerCase();
  const normalizedUdt = String(udtName || "").toLowerCase();
  return [
    "smallint",
    "integer",
    "bigint",
    "decimal",
    "numeric",
    "real",
    "double precision",
  ].includes(normalizedDataType)
    || ["int2", "int4", "int8", "float4", "float8", "numeric"].includes(normalizedUdt);
}

type PostgresColumn = {
  column_name: string;
  data_type: string;
  udt_name: string;
  column_default: string | null;
  is_identity: string;
};

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === null || typeof value === "undefined") {
    return null;
  }
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (["1", "true", "t", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "f", "no", "n", "off"].includes(normalized)) {
    return false;
  }
  return null;
}

function convertValue(value: unknown, column: PostgresColumn): unknown {
  if (typeof value === "undefined") {
    return null;
  }
  if (value === null) {
    return null;
  }

  const dataType = String(column.data_type || "").toLowerCase();
  const udtName = String(column.udt_name || "").toLowerCase();

  if (dataType === "boolean") {
    return normalizeBoolean(value);
  }

  if (dataType === "json" || dataType === "jsonb") {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      return trimmed;
    }
    try {
      return JSON.stringify(value);
    } catch (_error) {
      return null;
    }
  }

  if (isNumericDataType(dataType, udtName)) {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }

    const parsed = Number(String(value || "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return value;
}

async function getPostgresTables(pg: Client, schema: string): Promise<Set<string>> {
  const result = await pg.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = $1
      AND table_type = 'BASE TABLE'
    ORDER BY table_name ASC
  `, [schema]);

  return new Set(result.rows.map((row) => String(row.table_name || "").trim()).filter(Boolean));
}

async function getPostgresColumns(pg: Client, schema: string, table: string): Promise<PostgresColumn[]> {
  const result = await pg.query(`
    SELECT
      column_name,
      data_type,
      udt_name,
      column_default,
      is_identity
    FROM information_schema.columns
    WHERE table_schema = $1
      AND table_name = $2
    ORDER BY ordinal_position ASC
  `, [schema, table]);
  return result.rows as PostgresColumn[];
}

async function syncSequences(
  pg: Client,
  schema: string,
  tableName: string,
  columns: PostgresColumn[],
): Promise<void> {
  for (const column of columns) {
    const hasSequence = String(column.column_default || "").toLowerCase().includes("nextval(")
      || String(column.is_identity || "").toUpperCase() === "YES";
    if (!hasSequence) {
      continue;
    }

    const sequenceQuery = await pg.query(
      "SELECT pg_get_serial_sequence($1, $2) AS sequence_name",
      [`${schema}.${tableName}`, column.column_name],
    );
    const sequenceName = String(sequenceQuery.rows[0]?.sequence_name || "").trim();
    if (!sequenceName) {
      continue;
    }

    const maxResult = await pg.query(
      `SELECT MAX(${qid(column.column_name)}) AS max_value FROM ${qname(schema, tableName)}`,
    );
    const maxValue = Number(maxResult.rows[0]?.max_value || 0);
    if (Number.isFinite(maxValue) && maxValue >= 1) {
      await pg.query("SELECT setval($1::regclass, $2, true)", [sequenceName, Math.floor(maxValue)]);
    } else {
      await pg.query("SELECT setval($1::regclass, 1, false)", [sequenceName]);
    }
  }
}

async function insertBatch(
  pg: Client,
  schema: string,
  tableName: string,
  columns: PostgresColumn[],
  rows: Array<Record<string, unknown>>,
): Promise<number> {
  if (rows.length === 0) {
    return 0;
  }

  const values: unknown[] = [];
  const valueSql: string[] = [];

  rows.forEach((row) => {
    const placeholders: string[] = [];
    columns.forEach((column) => {
      values.push(convertValue(row[column.column_name], column));
      placeholders.push(`$${values.length}`);
    });
    valueSql.push(`(${placeholders.join(", ")})`);
  });

  const insertSql = `
    INSERT INTO ${qname(schema, tableName)} (${columns.map((column) => qid(column.column_name)).join(", ")})
    VALUES ${valueSql.join(", ")}
    ON CONFLICT DO NOTHING
  `;
  const result = await pg.query(insertSql, values);
  return Number(result.rowCount || 0);
}

async function migrateTable(
  sqlite: Database.Database,
  pg: Client,
  schema: string,
  tableName: string,
): Promise<{ sourceRows: number; insertedRows: number; skipped: boolean; reason?: string }> {
  const sqliteColumnRows = sqlite.prepare(`PRAGMA table_info(${qid(tableName)})`).all();
  const sqliteColumns = new Set(
    sqliteColumnRows
      .map((row) => String(row.name || "").trim())
      .filter(Boolean),
  );

  const postgresColumns = await getPostgresColumns(pg, schema, tableName);
  const sharedColumns = postgresColumns.filter((column) => sqliteColumns.has(String(column.column_name || "").trim()));

  if (sharedColumns.length === 0) {
    return {
      sourceRows: 0,
      insertedRows: 0,
      skipped: true,
      reason: "no_shared_columns",
    };
  }

  const selectSql = `SELECT ${sharedColumns.map((column) => qid(column.column_name)).join(", ")} FROM ${qid(tableName)}`;
  const statement = sqlite.prepare(selectSql);
  const iterator = statement.iterate() as Iterable<Record<string, unknown>>;

  let sourceRows = 0;
  let insertedRows = 0;
  let batch: Array<Record<string, unknown>> = [];

  for (const row of iterator) {
    batch.push(row);
    sourceRows += 1;

    if (batch.length >= batchSize) {
      insertedRows += await insertBatch(pg, schema, tableName, sharedColumns, batch);
      batch = [];
    }
  }

  if (batch.length > 0) {
    insertedRows += await insertBatch(pg, schema, tableName, sharedColumns, batch);
  }

  await syncSequences(pg, schema, tableName, postgresColumns);

  return {
    sourceRows,
    insertedRows,
    skipped: false,
  };
}

async function main() {
  const sqlite = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  const pg = new Client({ connectionString: postgresUrl });
  await pg.connect();

  const sqliteTables = sqlite.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
    ORDER BY rowid ASC
  `).all().map((row) => String(row.name || "").trim()).filter(Boolean);

  const postgresTables = await getPostgresTables(pg, targetSchema);
  if (postgresTables.size === 0) {
    throw new Error(`No target tables found in PostgreSQL schema "${targetSchema}". Apply schema migrations before data migration.`);
  }

  const tablesToMigrate = sqliteTables.filter((tableName) => {
    if (allowlist.length > 0 && !allowlist.includes(tableName)) {
      return false;
    }
    return postgresTables.has(tableName);
  });

  if (tablesToMigrate.length === 0) {
    throw new Error("No overlapping tables between SQLite source and PostgreSQL target schema.");
  }

  const summary = {
    tablesAttempted: 0,
    tablesMigrated: 0,
    tablesSkipped: 0,
    sourceRows: 0,
    insertedRows: 0,
  };

  try {
    await pg.query("BEGIN");

    if (truncateTarget) {
      for (const tableName of [...tablesToMigrate].reverse()) {
        await pg.query(`TRUNCATE TABLE ${qname(targetSchema, tableName)} RESTART IDENTITY CASCADE`);
      }
    }

    for (const tableName of tablesToMigrate) {
      summary.tablesAttempted += 1;
      const result = await migrateTable(sqlite, pg, targetSchema, tableName);
      summary.sourceRows += result.sourceRows;
      summary.insertedRows += result.insertedRows;
      if (result.skipped) {
        summary.tablesSkipped += 1;
        console.log(`[migrate:postgres] skipped table=${tableName} reason=${result.reason || "unknown"}`);
      } else {
        summary.tablesMigrated += 1;
        console.log(
          `[migrate:postgres] table=${tableName} source_rows=${result.sourceRows} inserted_rows=${result.insertedRows}`,
        );
      }
    }

    await pg.query("COMMIT");
    console.log(
      `[migrate:postgres] completed tables_attempted=${summary.tablesAttempted}`
      + ` tables_migrated=${summary.tablesMigrated}`
      + ` tables_skipped=${summary.tablesSkipped}`
      + ` source_rows=${summary.sourceRows}`
      + ` inserted_rows=${summary.insertedRows}`,
    );
  } catch (error) {
    await pg.query("ROLLBACK");
    throw error;
  } finally {
    sqlite.close();
    await pg.end();
  }
}

main().catch((error) => {
  console.error(`[migrate:postgres] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
