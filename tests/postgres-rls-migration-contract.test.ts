/**
 * tests/postgres-rls-migration-contract.test.ts
 *
 * Verifies that every tenant-scoped table in the Postgres schema has a
 * Row-Level Security policy applied across the full migration chain.
 *
 * Coverage tracks the complete migration history:
 *   202603230001 — initial 16 core tables
 *   202603250001 — audit_logs, transactions, loan_installments,
 *                  repayment_idempotency_keys, loan_overpayment_credits,
 *                  mobile_money_c2b_events, mobile_money_b2c_disbursements,
 *                  domain_events
 *   202603300001 — client_profile_versions, client_profile_refreshes,
 *                  client_profile_refresh_events, client_profile_refresh_feedback
 *   202603300002 — tenant_id columns + RLS rebuilt for the tables above that
 *                  had policies but no column yet
 *
 * When new tables with tenant_id are added, add them to the appropriate
 * section below and the matching migration file assertion.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "..");

function readMigrationSql(relativePath: string): string {
  return fs.readFileSync(
    path.join(repoRoot, "prisma", "postgres", "migrations", relativePath),
    "utf8",
  );
}

// ── Migration 202603230001 — initial core tables ───────────────────────────
test("RLS migration 202603230001 covers the original 16 core tenant-scoped tables", () => {
  const migrationSql = readMigrationSql(
    "202603230001_postgres_row_level_security/migration.sql",
  );

  const coreTables = [
    "users",
    "branches",
    "clients",
    "loan_products",
    "loans",
    "repayments",
    "loan_underwriting_assessments",
    "collection_actions",
    "capital_transactions",
    "gl_journals",
    "gl_entries",
    "gl_coa_versions",
    "gl_coa_accounts",
    "gl_suspense_cases",
    "gl_suspense_allocations",
    "password_resets",
  ];

  coreTables.forEach((tableName) => {
    assert.match(
      migrationSql,
      new RegExp(`'${tableName}'`),
      `202603230001 RLS migration should include ${tableName}`,
    );
  });

  assert.match(migrationSql, /ENABLE ROW LEVEL SECURITY/, "should ENABLE RLS");
  assert.match(migrationSql, /FORCE ROW LEVEL SECURITY/, "should FORCE RLS");
  assert.match(migrationSql, /CREATE POLICY tenant_isolation/, "should create tenant_isolation policy");
  assert.match(
    migrationSql,
    /current_setting\(''app\.tenant_id'', true\)/,
    "policy should reference app.tenant_id session variable",
  );
});

// ── Migration 202603250001 — extended tables ───────────────────────────────
test("RLS migration 202603250001 covers audit_logs, transactions, installments, mobile money, domain_events", () => {
  const migrationSql = readMigrationSql(
    "202603250001_rls_tenant_parity/migration.sql",
  );

  const extendedTables = [
    "audit_logs",
    "transactions",
    "loan_installments",
    "repayment_idempotency_keys",
    "loan_overpayment_credits",
    "mobile_money_c2b_events",
    "mobile_money_b2c_disbursements",
    "domain_events",
  ];

  extendedTables.forEach((tableName) => {
    assert.match(
      migrationSql,
      new RegExp(`"${tableName}"`),
      `202603250001 RLS migration should include ${tableName}`,
    );
  });

  assert.match(migrationSql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migrationSql, /CREATE POLICY/);
});

// ── Migration 202603300001 — client profile refresh tables ────────────────
test("RLS migration 202603300001 covers all four client_profile_refresh tables", () => {
  const migrationSql = readMigrationSql(
    "202603300001_rls_client_profile_refresh_tables/migration.sql",
  );

  const profileRefreshTables = [
    "client_profile_versions",
    "client_profile_refreshes",
    "client_profile_refresh_events",
    "client_profile_refresh_feedback",
  ];

  profileRefreshTables.forEach((tableName) => {
    assert.match(
      migrationSql,
      new RegExp(tableName),
      `202603300001 should include ${tableName}`,
    );
  });

  assert.match(migrationSql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migrationSql, /FORCE ROW LEVEL SECURITY/);
  assert.match(migrationSql, /CREATE POLICY tenant_isolation/);
  assert.match(migrationSql, /current_setting\(''app\.tenant_id'', true\)/);
});

// ── Migration 202603300002 — tenant_id column + RLS for previously-missing tables
test("RLS migration 202603300002 adds tenant_id and rebuilds policies on late-migrated tables", () => {
  const migrationSql = readMigrationSql(
    "202603300002_tenant_id_missing_tables/migration.sql",
  );

  const lateTables = [
    "loan_installments",
    "transactions",
    "mobile_money_c2b_events",
    "mobile_money_b2c_disbursements",
    "domain_events",
  ];

  lateTables.forEach((tableName) => {
    assert.match(
      migrationSql,
      new RegExp(tableName),
      `202603300002 should re-apply RLS for ${tableName}`,
    );
  });

  // All five tables should have tenant_id added idempotently
  const addColumnCount = (migrationSql.match(/ADD COLUMN IF NOT EXISTS tenant_id/g) || []).length;
  assert.ok(
    addColumnCount >= 4,
    `Expected at least 4 ADD COLUMN IF NOT EXISTS tenant_id statements, got ${addColumnCount}`,
  );

  assert.match(migrationSql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migrationSql, /FORCE ROW LEVEL SECURITY/);
  assert.match(migrationSql, /CREATE POLICY tenant_isolation/);
  assert.match(migrationSql, /current_setting\('app\.tenant_id', true\)/);
});

// ── Raw connection wiring ──────────────────────────────────────────────────
test("raw Postgres connections propagate app.tenant_id before queries and transactions", () => {
  const postgresConnectionSource = fs.readFileSync(
    path.join(repoRoot, "src", "db", "postgresConnection.ts"),
    "utf8",
  );

  assert.match(
    postgresConnectionSource,
    /SELECT set_config\('app\.tenant_id', \$1, false\)/,
    "raw pg connections should set the tenant session variable before executing SQL",
  );
  assert.match(
    postgresConnectionSource,
    /withPoolClient\("primary", getPool\(\), \(client\) => runWithExecutor\(client, "primary", sql, params\)\)/,
    "top-level raw SQL writes should run through a tenant-scoped pooled client",
  );
  assert.match(
    postgresConnectionSource,
    /await applyTenantSessionConfig\(client\);\s*await client\.query\(`BEGIN ISOLATION LEVEL/,
    "transactions should set the tenant session before BEGIN so RLS applies inside the transaction",
  );
});

// ── Migration 20260401000001 — mobile money + idempotency tenant_id columns ──
test("SQLite migration 20260401000001 adds tenant_id to mobile money and idempotency tables", () => {
  const migrationSql = fs.readFileSync(
    path.join(repoRoot, "prisma", "migrations", "20260401000001_tenant_id_mobile_money_rls", "migration.sql"),
    "utf8",
  );

  const expectedTables = [
    "mobile_money_c2b_events",
    "mobile_money_b2c_disbursements",
    "repayment_idempotency_keys",
    "loan_overpayment_credits",
  ];

  expectedTables.forEach((tableName) => {
    assert.match(
      migrationSql,
      new RegExp(`ALTER TABLE ${tableName} ADD COLUMN tenant_id`),
      `20260401000001 should add tenant_id to ${tableName}`,
    );
  });

  // Must NOT contain Postgres-only syntax — this migration runs on SQLite in dev/test
  assert.doesNotMatch(
    migrationSql,
    /ENABLE ROW LEVEL SECURITY/,
    "SQLite migration must not contain Postgres-only ENABLE ROW LEVEL SECURITY",
  );
  assert.doesNotMatch(
    migrationSql,
    /CREATE POLICY/,
    "SQLite migration must not contain Postgres-only CREATE POLICY",
  );
  assert.doesNotMatch(
    migrationSql,
    /UPDATE .+ FROM/i,
    "SQLite migration must not contain Postgres-only UPDATE ... FROM syntax",
  );

  // Must create indexes for query performance
  assert.match(migrationSql, /CREATE INDEX IF NOT EXISTS/, "should create tenant indexes");
});

// ── Postgres migration 202603300002 already covers mobile money tables ─────
test("Postgres migration 202603300002 covers mobile_money tables with app.tenant_id RLS", () => {
  const migrationSql = fs.readFileSync(
    path.join(
      repoRoot,
      "prisma",
      "postgres",
      "migrations",
      "202603300002_tenant_id_missing_tables",
      "migration.sql",
    ),
    "utf8",
  );

  const mobileTables = [
    "mobile_money_c2b_events",
    "mobile_money_b2c_disbursements",
  ];

  mobileTables.forEach((tableName) => {
    assert.match(
      migrationSql,
      new RegExp(tableName),
      `202603300002 should include ${tableName}`,
    );
  });

  assert.match(migrationSql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migrationSql, /FORCE ROW LEVEL SECURITY/);
  assert.match(
    migrationSql,
    /current_setting\('app\.tenant_id', true\)/,
    "Postgres mobile money RLS must reference app.tenant_id (not app.current_tenant_id)",
  );
});

// ── mobileMoneyService.ts sets tenant_id at write time ──────────────────────
test("mobileMoneyService writes tenant_id on both B2C disbursements and C2B events", () => {
  const serviceSource = fs.readFileSync(
    path.join(repoRoot, "src", "services", "mobileMoneyService.ts"),
    "utf8",
  );

  assert.match(
    serviceSource,
    /tenant_id: getCurrentTenantId\(\)/,
    "mobileMoneyService should write tenant_id via getCurrentTenantId() at INSERT time",
  );

  assert.match(
    serviceSource,
    /runWithTenant\(resolvedTenantId/,
    "B2C callback handler should wrap the transaction in runWithTenant to scope the inner queries",
  );

  assert.match(
    serviceSource,
    /tenant_id: resolvedTenantId/,
    "B2C callback inner findFirst should be scoped with resolvedTenantId",
  );
});

test("Postgres migration 20260404000001 adds tenant_id and RLS to transactions, installments, and approval_requests", () => {
  const migrationSql = fs.readFileSync(
    path.join(
      repoRoot,
      "prisma",
      "postgres",
      "migrations",
      "20260404000001_tenant_id_transactions_installments_approvals",
      "migration.sql",
    ),
    "utf8",
  );

  const expectedTables = [
    "loan_installments",
    "transactions",
    "approval_requests",
  ];

  expectedTables.forEach((tableName) => {
    assert.match(
      migrationSql,
      new RegExp(tableName),
      `20260404000001 should include ${tableName}`,
    );
  });

  assert.match(migrationSql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migrationSql, /FORCE ROW LEVEL SECURITY/);
  assert.match(migrationSql, /CREATE POLICY tenant_isolation/);
  assert.match(migrationSql, /current_setting\('app\.tenant_id', true\)/);
});

test("SQLite migration 20260404000001 adds tenant_id columns to transactions, installments, and approval_requests", () => {
  const migrationSql = fs.readFileSync(
    path.join(
      repoRoot,
      "prisma",
      "migrations",
      "20260404000001_tenant_id_transactions_installments_approvals",
      "migration.sql",
    ),
    "utf8",
  );

  const expectedTables = [
    "loan_installments",
    "transactions",
    "approval_requests",
  ];

  expectedTables.forEach((tableName) => {
    assert.match(
      migrationSql,
      new RegExp(`ALTER TABLE ${tableName} ADD COLUMN tenant_id`),
      `20260404000001 should add tenant_id to ${tableName}`,
    );
  });
});
