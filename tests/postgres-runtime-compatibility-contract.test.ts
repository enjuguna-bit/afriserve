import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "..");

test("Postgres runtime compatibility backfills tenant columns for core operational tables", () => {
  const schemaSource = fs.readFileSync(
    path.join(repoRoot, "src", "db", "schema.ts"),
    "utf8",
  );

  [
    '"branches"',
    '"password_resets"',
    '"clients"',
    '"loans"',
    '"repayments"',
    '"gl_journals"',
    '"audit_logs"',
  ].forEach((tableLiteral) => {
    assert.match(
      schemaSource,
      new RegExp(tableLiteral),
      `runtime compatibility should include ${tableLiteral} in the tenant backfill list`,
    );
  });

  assert.match(schemaSource, /ALTER TABLE \$\{tableName\} ADD COLUMN IF NOT EXISTS tenant_id TEXT/);
  assert.match(schemaSource, /CREATE INDEX IF NOT EXISTS idx_branches_tenant_id ON branches\(tenant_id\)/);
  assert.match(schemaSource, /CREATE INDEX IF NOT EXISTS idx_password_resets_tenant_id ON password_resets\(tenant_id\)/);
  assert.match(schemaSource, /ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tenant_id TEXT/);
  assert.match(schemaSource, /CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created_at ON audit_logs\(tenant_id, created_at\)/);
});

test("checked-in Postgres hotfix migration backfills missing core tenant columns", () => {
  const migrationSql = fs.readFileSync(
    path.join(
      repoRoot,
      "prisma",
      "postgres",
      "migrations",
      "202603240003_postgres_core_tenant_columns_hotfix",
      "migration.sql",
    ),
    "utf8",
  );

  [
    "ALTER TABLE IF EXISTS branches ADD COLUMN IF NOT EXISTS tenant_id TEXT",
    "ALTER TABLE IF EXISTS password_resets ADD COLUMN IF NOT EXISTS tenant_id TEXT",
    "ALTER TABLE IF EXISTS clients ADD COLUMN IF NOT EXISTS tenant_id TEXT",
    "ALTER TABLE IF EXISTS loans ADD COLUMN IF NOT EXISTS tenant_id TEXT",
    "ALTER TABLE IF EXISTS repayments ADD COLUMN IF NOT EXISTS tenant_id TEXT",
  ].forEach((statement) => {
    assert.match(
      migrationSql,
      new RegExp(statement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  });
});

test("checked-in Postgres audit log hotfix migration backfills audit_logs tenant parity", () => {
  const migrationSql = fs.readFileSync(
    path.join(
      repoRoot,
      "prisma",
      "postgres",
      "migrations",
      "202603280001_audit_logs_tenant_schema_parity",
      "migration.sql",
    ),
    "utf8",
  );

  [
    "ALTER TABLE IF EXISTS audit_logs ADD COLUMN IF NOT EXISTS tenant_id TEXT",
    "UPDATE audit_logs SET tenant_id = 'default' WHERE tenant_id IS NULL",
    "ALTER TABLE IF EXISTS audit_logs ALTER COLUMN tenant_id SET DEFAULT 'default'",
    "ALTER TABLE IF EXISTS audit_logs ALTER COLUMN tenant_id SET NOT NULL",
    "CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created_at",
  ].forEach((statement) => {
    assert.match(
      migrationSql,
      new RegExp(statement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  });
});

test("runtime migration 20260404_0022 is registered and backfills tenant_id from loans", () => {
  const schemaSource = fs.readFileSync(
    path.join(repoRoot, "src", "db", "schema.ts"),
    "utf8",
  );
  const runtimeMigrationSource = fs.readFileSync(
    path.join(
      repoRoot,
      "src",
      "migrations",
      "20260404_0022_tenant_id_transactions_installments_approvals.ts",
    ),
    "utf8",
  );

  assert.match(schemaSource, /migration20260404_0022_tenant_id_transactions_installments_approvals/);
  assert.match(runtimeMigrationSource, /UPDATE loan_installments/);
  assert.match(runtimeMigrationSource, /UPDATE transactions/);
  assert.match(runtimeMigrationSource, /UPDATE approval_requests/);
  assert.match(runtimeMigrationSource, /SELECT l\.tenant_id FROM loans l/);
});
