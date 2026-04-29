import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "..");

test("GL accounts route no longer filters by a missing tenant column", () => {
  const routeSource = fs.readFileSync(
    path.join(repoRoot, "src", "routes", "reports", "glReports.ts"),
    "utf8",
  );

  const routeStart = routeSource.indexOf('"/api/reports/gl/accounts"');
  assert.notEqual(routeStart, -1, "expected GL accounts route to exist");

  const routeSlice = routeSource.slice(routeStart, routeStart + 700);
  assert.ok(
    !routeSlice.includes("WHERE tenant_id = ?"),
    "GL accounts route should not filter on gl_accounts.tenant_id",
  );
});

test("capital transaction tenant contract is enforced in schema and service code", () => {
  const runtimeSchemaSource = fs.readFileSync(
    path.join(repoRoot, "src", "db", "schema.ts"),
    "utf8",
  );
  const capitalServiceSource = fs.readFileSync(
    path.join(repoRoot, "src", "services", "capitalTransactionService.ts"),
    "utf8",
  );
  const coaVersioningServiceSource = fs.readFileSync(
    path.join(repoRoot, "src", "services", "coaVersioningService.ts"),
    "utf8",
  );
  const sqlitePrismaSchema = fs.readFileSync(
    path.join(repoRoot, "prisma", "schema.prisma"),
    "utf8",
  );
  const postgresPrismaSchema = fs.readFileSync(
    path.join(repoRoot, "prisma", "postgres", "schema.prisma"),
    "utf8",
  );

  assert.match(
    runtimeSchemaSource,
    /CREATE TABLE IF NOT EXISTS capital_transactions[\s\S]*tenant_id TEXT NOT NULL DEFAULT 'default'/,
    "runtime Postgres compatibility schema should create capital_transactions with tenant_id",
  );
  assert.match(
    runtimeSchemaSource,
    /ALTER TABLE capital_transactions ADD COLUMN IF NOT EXISTS tenant_id TEXT/,
    "runtime Postgres compatibility schema should backfill tenant_id for existing deployments",
  );
  assert.match(
    runtimeSchemaSource,
    /async function ensurePostgresCoaTenantColumns\(\): Promise<void> \{[\s\S]*ensureTenantColumn\("gl_coa_versions"\)/,
    "runtime Postgres compatibility schema should backfill tenant_id for CoA versions on existing deployments via the CoA compatibility repair",
  );
  assert.match(
    runtimeSchemaSource,
    /async function ensurePostgresCoaTenantColumns\(\): Promise<void> \{[\s\S]*ensureTenantColumn\("gl_coa_accounts"\)/,
    "runtime Postgres compatibility schema should backfill tenant_id for CoA accounts on existing deployments via the CoA compatibility repair",
  );

  assert.match(sqlitePrismaSchema, /model capital_transactions \{/);
  assert.match(postgresPrismaSchema, /model capital_transactions \{/);
  assert.match(sqlitePrismaSchema, /tenant_id\s+String\s+@default\("default"\)/);
  assert.match(postgresPrismaSchema, /tenant_id\s+String\s+@default\("default"\)/);
  assert.match(sqlitePrismaSchema, /model gl_coa_versions \{[\s\S]*tenant_id\s+String\s+@default\("default"\)/);
  assert.match(postgresPrismaSchema, /model gl_coa_versions \{[\s\S]*tenant_id\s+String\s+@default\("default"\)/);
  assert.match(sqlitePrismaSchema, /model gl_coa_accounts \{[\s\S]*tenant_id\s+String\s+@default\("default"\)/);
  assert.match(postgresPrismaSchema, /model gl_coa_accounts \{[\s\S]*tenant_id\s+String\s+@default\("default"\)/);

  assert.match(
    capitalServiceSource,
    /SELECT \* FROM capital_transactions WHERE id = \? AND tenant_id = \?/,
    "capital service should read transactions within the current tenant",
  );
  assert.match(
    capitalServiceSource,
    /wb\.addEquals\("ct\.tenant_id", getCurrentTenantId\(\)\)/,
    "capital transaction listings should always be tenant scoped",
  );
  assert.match(
    coaVersioningServiceSource,
    /columnExists\("gl_coa_versions", "tenant_id"\)[\s\S]*columnExists\("gl_coa_accounts", "tenant_id"\)/,
    "CoA versioning service should tolerate databases that do not yet have tenant columns",
  );
});

test("general ledger period-lock checks match the schema contract", () => {
  const generalLedgerServiceSource = fs.readFileSync(
    path.join(repoRoot, "src", "services", "generalLedgerService.ts"),
    "utf8",
  );
  const sqlitePrismaSchema = fs.readFileSync(
    path.join(repoRoot, "prisma", "schema.prisma"),
    "utf8",
  );
  const postgresPrismaSchema = fs.readFileSync(
    path.join(repoRoot, "prisma", "postgres", "schema.prisma"),
    "utf8",
  );
  const sqlitePeriodLockBlock = sqlitePrismaSchema.match(/model gl_period_locks \{[\s\S]*?\n\}/)?.[0] || "";
  const postgresPeriodLockBlock = postgresPrismaSchema.match(/model gl_period_locks \{[\s\S]*?\n\}/)?.[0] || "";

  assert.ok(
    !generalLedgerServiceSource.includes("FROM gl_period_locks WHERE tenant_id = ?"),
    "general ledger raw SQL should not filter gl_period_locks by tenant_id while the table remains global",
  );
  assert.notEqual(sqlitePeriodLockBlock, "", "expected SQLite Prisma gl_period_locks model block to exist");
  assert.notEqual(postgresPeriodLockBlock, "", "expected Postgres Prisma gl_period_locks model block to exist");
  assert.doesNotMatch(
    sqlitePeriodLockBlock,
    /tenant_id\s+String/,
    "SQLite Prisma schema should not declare tenant_id on gl_period_locks without a matching migration",
  );
  assert.doesNotMatch(
    postgresPeriodLockBlock,
    /tenant_id\s+String/,
    "Postgres Prisma schema should not declare tenant_id on gl_period_locks without a matching migration",
  );
  assert.match(
    generalLedgerServiceSource,
    /db\.gl_journals\.findFirst\(\{[\s\S]*tenant_id: tenantId[\s\S]*reference_type: referenceTypeValue[\s\S]*reference_id: normalizedReferenceId/,
    "Prisma journal idempotency checks should remain tenant scoped",
  );
  assert.match(
    generalLedgerServiceSource,
    /db\.gl_journals\.create\(\{[\s\S]*tenant_id: tenantId/,
    "Prisma journal writes should stamp tenant_id",
  );
  assert.match(
    generalLedgerServiceSource,
    /db\.gl_entries\.create\(\{[\s\S]*tenant_id: tenantId/,
    "Prisma journal entries should stamp tenant_id",
  );
});
