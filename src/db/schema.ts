/**
 * SQLite-only runtime compatibility schema.
 *
 * This file handles dev/test bootstrap and forward-compatibility for SQLite databases.
 * It creates tables and columns that may not yet exist, normalizes legacy data formats,
 * and runs the runtime migration registry.
 *
 * **Not intended for long-term production schema evolution.**
 *
 * For production (Postgres):
 *   - Use Prisma `migrate deploy` with reviewed SQL.
 *   - See docs/MIGRATION_STRATEGY.md for the full canonical migration path.
 *
 * For development (SQLite):
 *   - This file bootstraps the schema from the Prisma schema definition.
 *   - Legacy JS migrations in src/migrations/* run via the runtime registry below.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createSeedApi } from "./seed.js";
import { run, get, all, dbClient, dbPath, db } from "./connection.js";
import type { RunMigrationsOptions, RunMigrationsResult } from "../types/dataLayer.js";
import migration20260225_0001_baseline from "../migrations/20260225_0001_baseline.js";
import migration20260225_0002_audit_log_indexes from "../migrations/20260225_0002_audit_log_indexes.js";
import migration20260225_0003_startup_data_fixes from "../migrations/20260225_0003_startup_data_fixes.js";
import migration20260226_0004_b2c_status_completed from "../migrations/20260226_0004_b2c_status_completed.js";
import migration20260226_0005_b2c_reversal_tracking from "../migrations/20260226_0005_b2c_reversal_tracking.js";
import migration20260304_0006_loan_core_advanced from "../migrations/20260304_0006_loan_core_advanced.js";
import migration20260305_0007_accounting_advanced from "../migrations/20260305_0007_accounting_advanced.js";
import migration20260305_0008_domain_events_tenancy from "../migrations/20260305_0008_domain_events_tenancy.js";
import migration20260305_0009_user_roles from "../migrations/20260305_0009_user_roles.js";
import migration20260306_0010_expand_client_kyc_statuses from "../migrations/20260306_0010_expand_client_kyc_statuses.js";
import migration20260306_0011_expand_guarantor_collateral_enums from "../migrations/20260306_0011_expand_guarantor_collateral_enums.js";
import migration20260308_0012_approval_request_expiry from "../migrations/20260308_0012_approval_request_expiry.js";
import migration20260308_0013_external_reference_indexes from "../migrations/20260308_0013_external_reference_indexes.js";
import migration20260316_0014_client_national_id_unique_index from "../migrations/20260316_0014_client_national_id_unique_index.js";
import migration20260317_0015_tenant_id_columns from "../migrations/20260317_0015_tenant_id_columns.js";
import migration20260318_0016_tenant_id_guarantors_collateral from "../migrations/20260318_0016_tenant_id_guarantors_collateral.js";
import { resolveRepoRoot } from "../utils/projectPaths.js";

const execFileAsync = promisify(execFile);
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const { seedHierarchyData, seedDefaultAdmin, seedDefaultLoanProduct } = createSeedApi({ run, get, all });
const repoRoot = resolveRepoRoot(currentDir);
const sqlitePrismaSchemaPath = path.join(repoRoot, "prisma", "schema.prisma");
const postgresPrismaSchemaPath = path.join(repoRoot, "prisma", "postgres", "schema.prisma");
const sqliteBootstrapSqlPath = path.join(repoRoot, "generated", "prisma", "sqlite-bootstrap.sql");
let cachedPrismaDateTimeFieldNames: Set<string> | null = null;
const runtimeMigrations = [
  migration20260225_0001_baseline,
  migration20260225_0002_audit_log_indexes,
  migration20260225_0003_startup_data_fixes,
  migration20260226_0004_b2c_status_completed,
  migration20260226_0005_b2c_reversal_tracking,
  migration20260304_0006_loan_core_advanced,
  migration20260305_0007_accounting_advanced,
  migration20260305_0008_domain_events_tenancy,
  migration20260305_0009_user_roles,
  migration20260306_0010_expand_client_kyc_statuses,
  migration20260306_0011_expand_guarantor_collateral_enums,
  migration20260308_0012_approval_request_expiry,
  migration20260308_0013_external_reference_indexes,
  migration20260316_0014_client_national_id_unique_index,
  migration20260317_0015_tenant_id_columns,
  migration20260318_0016_tenant_id_guarantors_collateral,
];

function getNpxCommand(): string {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function resolvePrismaSchemaPath(): string {
  return dbClient === "postgres" ? postgresPrismaSchemaPath : sqlitePrismaSchemaPath;
}

async function executePrismaMigrateDeploy(): Promise<string> {
  const effectiveEnv: NodeJS.ProcessEnv = {
    ...process.env,
  };

  try {
    const { stdout, stderr } = await execFileAsync(
      getNpxCommand(),
      ["prisma", "migrate", "deploy", "--schema", postgresPrismaSchemaPath],
      {
        cwd: repoRoot,
        env: effectiveEnv,
        windowsHide: true,
      },
    );

    return `${stdout || ""}${stderr || ""}`;
  } catch {
    const prismaCliPath = path.join(repoRoot, "node_modules", "prisma", "build", "index.js");

    if (!existsSync(prismaCliPath)) {
      throw new Error("Unable to run Prisma migrations: Prisma CLI binary was not found.");
    }

    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [prismaCliPath, "migrate", "deploy", "--schema", postgresPrismaSchemaPath],
      {
        cwd: repoRoot,
        env: effectiveEnv,
        windowsHide: true,
      },
    );

    return `${stdout || ""}${stderr || ""}`;
  }
}

async function sqliteTableExists(tableName: string): Promise<boolean> {
  const row = await get(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    [tableName],
  );
  return Boolean(row?.name);
}

async function sqliteColumnExists(tableName: string, columnName: string): Promise<boolean> {
  const columns = await all(`PRAGMA table_info(${tableName})`);
  return columns.some((column) => String(column.name || "").toLowerCase() === columnName.toLowerCase());
}

async function sqliteTableDefinitionSql(tableName: string): Promise<string> {
  const row = await get(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    [tableName],
  );
  return String(row?.sql || "");
}

async function sqliteTriggerNames(tableName: string): Promise<string[]> {
  const rows = await all(
    "SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ? ORDER BY name ASC",
    [tableName],
  );
  return rows
    .map((row) => String(row.name || "").trim())
    .filter(Boolean);
}

function toMoneyNumber(value: unknown): number {
  const normalized = Number(value || 0);
  if (!Number.isFinite(normalized)) {
    return 0;
  }
  return Number(normalized.toFixed(2));
}

function normalizeEpochLikeDateTimeValue(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!/^\d{10,17}$/.test(raw)) {
    return null;
  }

  const normalizedMs = raw.length <= 10
    ? Number(raw) * 1000
    : Number(raw.slice(0, 13));
  const normalizedDate = new Date(normalizedMs);
  if (!Number.isFinite(normalizedMs) || Number.isNaN(normalizedDate.getTime())) {
    return null;
  }

  return normalizedDate.toISOString();
}

function normalizeLegacySqliteDateTimeString(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  const epochNormalized = normalizeEpochLikeDateTimeValue(raw);
  if (epochNormalized) {
    return epochNormalized;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return `${raw}T00:00:00.000Z`;
  }

  const sqliteDateTimeMatch = raw.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(\.\d+)?$/);
  if (sqliteDateTimeMatch) {
    const [, datePart, timePart, fractionalPart = ""] = sqliteDateTimeMatch;
    const milliseconds = fractionalPart
      ? `${fractionalPart}000`.slice(0, 4)
      : ".000";
    return `${datePart}T${timePart}${milliseconds}Z`;
  }

  return null;
}

async function loadPrismaDateTimeFieldNames(): Promise<Set<string>> {
  if (cachedPrismaDateTimeFieldNames) {
    return cachedPrismaDateTimeFieldNames;
  }

  const schemaSource = await readFile(sqlitePrismaSchemaPath, "utf8");
  const fieldNames = new Set<string>();
  const lines = schemaSource.split(/\r?\n/);
  let insideModel = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) {
      continue;
    }

    if (trimmed.startsWith("model ")) {
      insideModel = true;
      continue;
    }

    if (insideModel && trimmed === "}") {
      insideModel = false;
      continue;
    }

    if (!insideModel || trimmed.startsWith("@@")) {
      continue;
    }

    const fieldMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+DateTime\??(?:\s|$)/);
    if (fieldMatch) {
      fieldNames.add(fieldMatch[1]!);
    }
  }

  cachedPrismaDateTimeFieldNames = fieldNames;
  return fieldNames;
}

async function normalizeSqliteLegacyDateTimeColumns(tableName: string, skipColumns: string[] = []): Promise<void> {
  const prismaDateTimeFieldNames = await loadPrismaDateTimeFieldNames();
  const skipColumnSet = new Set(skipColumns.map((column) => column.toLowerCase()));
  const columns = await all(`PRAGMA table_info(${tableName})`);
  const candidateColumns = columns
    .map((column) => String(column.name || "").trim())
    .filter((columnName) => columnName && prismaDateTimeFieldNames.has(columnName) && !skipColumnSet.has(columnName.toLowerCase()));

  if (candidateColumns.length === 0) {
    return;
  }

  for (const columnName of candidateColumns) {
    const rows = await all(
      `
        SELECT rowid AS __rowid, ${columnName} AS value
        FROM ${tableName}
        WHERE ${columnName} IS NOT NULL
      `,
    );

    for (const row of rows) {
      const normalizedValue = normalizeLegacySqliteDateTimeString(row.value);
      if (!normalizedValue || normalizedValue === String(row.value).trim()) {
        continue;
      }

      await run(
        `UPDATE ${tableName} SET ${columnName} = ? WHERE rowid = ?`,
        [normalizedValue, Number(row.__rowid)],
      );
    }
  }
}

function getSqliteLegacyDateTimeSkipColumns(tableName: string): string[] {
  const normalizedTableName = String(tableName || "").trim().toLowerCase();

  // These accounting fields represent business dates. Converting YYYY-MM-DD values
  // into midnight UTC timestamps can collide with already-normalized rows.
  if (normalizedTableName === "gl_batch_runs") {
    return ["effective_date"];
  }
  if (normalizedTableName === "gl_period_locks") {
    return ["lock_date"];
  }
  if (normalizedTableName === "gl_balance_snapshots" || normalizedTableName === "gl_trial_balance_snapshots") {
    return ["snapshot_date"];
  }

  return [];
}

async function generatePrismaSchemaBootstrapSql(schemaPath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      getNpxCommand(),
      ["prisma", "migrate", "diff", "--from-empty", "--to-schema-datamodel", schemaPath, "--script"],
      {
        cwd: repoRoot,
        env: process.env,
        windowsHide: true,
      },
    );

    return String(stdout || "");
  } catch {
    const prismaCliPath = path.join(repoRoot, "node_modules", "prisma", "build", "index.js");

    if (!existsSync(prismaCliPath)) {
      throw new Error("Unable to bootstrap SQLite schema: Prisma CLI binary was not found.");
    }

    const { stdout } = await execFileAsync(
      process.execPath,
      [prismaCliPath, "migrate", "diff", "--from-empty", "--to-schema-datamodel", schemaPath, "--script"],
      {
        cwd: repoRoot,
        env: process.env,
        windowsHide: true,
      },
    );

    return String(stdout || "");
  }
}

async function bootstrapSqliteSchemaFromPrismaSchema(): Promise<void> {
  if (dbClient !== "sqlite") {
    return;
  }

  const hasUsersTable = await sqliteTableExists("users");
  if (hasUsersTable) {
    return;
  }

  const sqliteDb = db as { exec?: (sql: string) => unknown } | null;
  if (!sqliteDb || typeof sqliteDb.exec !== "function") {
    throw new Error("Unable to bootstrap SQLite schema: database connection does not support script execution.");
  }

  const bootstrapSql = existsSync(sqliteBootstrapSqlPath)
    ? await readFile(sqliteBootstrapSqlPath, "utf8")
    : await generatePrismaSchemaBootstrapSql(sqlitePrismaSchemaPath);
  if (!bootstrapSql.trim()) {
    throw new Error("Unable to bootstrap SQLite schema: Prisma did not return any SQL.");
  }

  sqliteDb.exec(bootstrapSql);
}

async function ensureSqliteRuntimeCompatibilitySchema(): Promise<void> {
  if (dbClient !== "sqlite") {
    return;
  }

  const hasAuditLogsTable = await sqliteTableExists("audit_logs");
  if (hasAuditLogsTable) {
    const auditLogTriggerNames = await sqliteTriggerNames("audit_logs");
    for (const triggerName of auditLogTriggerNames) {
      await run(`DROP TRIGGER IF EXISTS ${triggerName}`);
    }

    await normalizeSqliteLegacyDateTimeColumns("audit_logs", getSqliteLegacyDateTimeSkipColumns("audit_logs"));

    await run(`
      CREATE TRIGGER IF NOT EXISTS trg_audit_logs_append_only_update
      BEFORE UPDATE ON audit_logs
      BEGIN
        SELECT RAISE(ABORT, 'audit_logs is append-only');
      END
    `);
    await run(`
      CREATE TRIGGER IF NOT EXISTS trg_audit_logs_append_only_delete
      BEFORE DELETE ON audit_logs
      BEGIN
        SELECT RAISE(ABORT, 'audit_logs is append-only');
      END
    `);
  }

  const tables = await all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
  for (const tableRow of tables) {
    const tableName = String(tableRow.name || "").trim();
    if (!tableName || tableName === "audit_logs") {
      continue;
    }
    await normalizeSqliteLegacyDateTimeColumns(tableName, getSqliteLegacyDateTimeSkipColumns(tableName));
  }

  const hasUsersTable = await sqliteTableExists("users");
  if (hasUsersTable) {
    const usersHasDeactivatedAt = await sqliteColumnExists("users", "deactivated_at");
    if (!usersHasDeactivatedAt) {
      await run("ALTER TABLE users ADD COLUMN deactivated_at TEXT");
    }
  }

  const hasRepaymentsTable = await sqliteTableExists("repayments");
  if (hasRepaymentsTable) {
    const repaymentsHasPaymentChannel = await sqliteColumnExists("repayments", "payment_channel");
    if (!repaymentsHasPaymentChannel) {
      await run("ALTER TABLE repayments ADD COLUMN payment_channel TEXT");
    }
    const repaymentsHasPaymentProvider = await sqliteColumnExists("repayments", "payment_provider");
    if (!repaymentsHasPaymentProvider) {
      await run("ALTER TABLE repayments ADD COLUMN payment_provider TEXT");
    }
    const repaymentsHasExternalReceipt = await sqliteColumnExists("repayments", "external_receipt");
    if (!repaymentsHasExternalReceipt) {
      await run("ALTER TABLE repayments ADD COLUMN external_receipt TEXT");
    }
    const repaymentsHasExternalReference = await sqliteColumnExists("repayments", "external_reference");
    if (!repaymentsHasExternalReference) {
      await run("ALTER TABLE repayments ADD COLUMN external_reference TEXT");
    }
    const repaymentsHasPayerPhone = await sqliteColumnExists("repayments", "payer_phone");
    if (!repaymentsHasPayerPhone) {
      await run("ALTER TABLE repayments ADD COLUMN payer_phone TEXT");
    }
    const repaymentsHasAppliedAmount = await sqliteColumnExists("repayments", "applied_amount");
    if (!repaymentsHasAppliedAmount) {
      await run("ALTER TABLE repayments ADD COLUMN applied_amount REAL NOT NULL DEFAULT 0");
    }
    const repaymentsHasPenaltyAmount = await sqliteColumnExists("repayments", "penalty_amount");
    if (!repaymentsHasPenaltyAmount) {
      await run("ALTER TABLE repayments ADD COLUMN penalty_amount REAL NOT NULL DEFAULT 0");
    }
    const repaymentsHasInterestAmount = await sqliteColumnExists("repayments", "interest_amount");
    if (!repaymentsHasInterestAmount) {
      await run("ALTER TABLE repayments ADD COLUMN interest_amount REAL NOT NULL DEFAULT 0");
    }
    const repaymentsHasPrincipalAmount = await sqliteColumnExists("repayments", "principal_amount");
    if (!repaymentsHasPrincipalAmount) {
      await run("ALTER TABLE repayments ADD COLUMN principal_amount REAL NOT NULL DEFAULT 0");
    }
    const repaymentsHasOverpaymentAmount = await sqliteColumnExists("repayments", "overpayment_amount");
    if (!repaymentsHasOverpaymentAmount) {
      await run("ALTER TABLE repayments ADD COLUMN overpayment_amount REAL NOT NULL DEFAULT 0");
    }
  }

  const hasRepaymentIdempotencyKeysTable = await sqliteTableExists("repayment_idempotency_keys");
  if (!hasRepaymentIdempotencyKeysTable) {
    await run(`
      CREATE TABLE IF NOT EXISTS repayment_idempotency_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        loan_id INTEGER NOT NULL,
        client_idempotency_key TEXT NOT NULL,
        request_amount REAL NOT NULL,
        repayment_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY (repayment_id) REFERENCES repayments(id) ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
  } else {
    const hasRequestAmount = await sqliteColumnExists("repayment_idempotency_keys", "request_amount");
    if (!hasRequestAmount) {
      await run("ALTER TABLE repayment_idempotency_keys ADD COLUMN request_amount REAL NOT NULL DEFAULT 0");
    }
    const hasRepaymentId = await sqliteColumnExists("repayment_idempotency_keys", "repayment_id");
    if (!hasRepaymentId) {
      await run("ALTER TABLE repayment_idempotency_keys ADD COLUMN repayment_id INTEGER");
    }
    const hasCreatedAt = await sqliteColumnExists("repayment_idempotency_keys", "created_at");
    if (!hasCreatedAt) {
      await run("ALTER TABLE repayment_idempotency_keys ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'))");
    }
    const hasUpdatedAt = await sqliteColumnExists("repayment_idempotency_keys", "updated_at");
    if (!hasUpdatedAt) {
      await run("ALTER TABLE repayment_idempotency_keys ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))");
    }
  }
  await run("CREATE UNIQUE INDEX IF NOT EXISTS idx_repayment_idempotency_unique ON repayment_idempotency_keys(loan_id, client_idempotency_key)");
  await run("CREATE INDEX IF NOT EXISTS idx_repayment_idempotency_repayment_id ON repayment_idempotency_keys(repayment_id)");

  const hasLoanOverpaymentCreditsTable = await sqliteTableExists("loan_overpayment_credits");
  if (!hasLoanOverpaymentCreditsTable) {
    await run(`
      CREATE TABLE IF NOT EXISTS loan_overpayment_credits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        loan_id INTEGER NOT NULL,
        client_id INTEGER,
        branch_id INTEGER,
        repayment_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        note TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL ON UPDATE CASCADE,
        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL ON UPDATE CASCADE,
        FOREIGN KEY (repayment_id) REFERENCES repayments(id) ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
  } else {
    const hasClientId = await sqliteColumnExists("loan_overpayment_credits", "client_id");
    if (!hasClientId) {
      await run("ALTER TABLE loan_overpayment_credits ADD COLUMN client_id INTEGER");
    }
    const hasBranchId = await sqliteColumnExists("loan_overpayment_credits", "branch_id");
    if (!hasBranchId) {
      await run("ALTER TABLE loan_overpayment_credits ADD COLUMN branch_id INTEGER");
    }
    const hasRepaymentId = await sqliteColumnExists("loan_overpayment_credits", "repayment_id");
    if (!hasRepaymentId) {
      await run("ALTER TABLE loan_overpayment_credits ADD COLUMN repayment_id INTEGER");
    }
    const hasStatus = await sqliteColumnExists("loan_overpayment_credits", "status");
    if (!hasStatus) {
      await run("ALTER TABLE loan_overpayment_credits ADD COLUMN status TEXT NOT NULL DEFAULT 'open'");
    }
    const hasNote = await sqliteColumnExists("loan_overpayment_credits", "note");
    if (!hasNote) {
      await run("ALTER TABLE loan_overpayment_credits ADD COLUMN note TEXT");
    }
    const hasCreatedAt = await sqliteColumnExists("loan_overpayment_credits", "created_at");
    if (!hasCreatedAt) {
      await run("ALTER TABLE loan_overpayment_credits ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'))");
    }
    const hasUpdatedAt = await sqliteColumnExists("loan_overpayment_credits", "updated_at");
    if (!hasUpdatedAt) {
      await run("ALTER TABLE loan_overpayment_credits ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))");
    }
  }
  await run("CREATE UNIQUE INDEX IF NOT EXISTS idx_loan_overpayment_credit_repayment_id ON loan_overpayment_credits(repayment_id)");
  await run("CREATE INDEX IF NOT EXISTS idx_loan_overpayment_credit_loan_id ON loan_overpayment_credits(loan_id)");
  await run("CREATE INDEX IF NOT EXISTS idx_loan_overpayment_credit_client_id ON loan_overpayment_credits(client_id)");

  const hasMobileMoneyC2BEventsTable = await sqliteTableExists("mobile_money_c2b_events");
  if (!hasMobileMoneyC2BEventsTable) {
    await run(`
      CREATE TABLE IF NOT EXISTS mobile_money_c2b_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        external_receipt TEXT NOT NULL,
        account_reference TEXT NOT NULL,
        payer_phone TEXT,
        amount REAL NOT NULL,
        paid_at TEXT NOT NULL,
        payload_json TEXT,
        status TEXT NOT NULL DEFAULT 'received',
        loan_id INTEGER,
        repayment_id INTEGER,
        reconciliation_note TEXT,
        reconciled_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE SET NULL ON UPDATE CASCADE,
        FOREIGN KEY (repayment_id) REFERENCES repayments(id) ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
  } else {
    const c2bHasProvider = await sqliteColumnExists("mobile_money_c2b_events", "provider");
    if (!c2bHasProvider) {
      await run("ALTER TABLE mobile_money_c2b_events ADD COLUMN provider TEXT NOT NULL DEFAULT 'unknown'");
    }
    const c2bHasExternalReceipt = await sqliteColumnExists("mobile_money_c2b_events", "external_receipt");
    if (!c2bHasExternalReceipt) {
      await run("ALTER TABLE mobile_money_c2b_events ADD COLUMN external_receipt TEXT NOT NULL DEFAULT ''");
    }
    const c2bHasAccountReference = await sqliteColumnExists("mobile_money_c2b_events", "account_reference");
    if (!c2bHasAccountReference) {
      await run("ALTER TABLE mobile_money_c2b_events ADD COLUMN account_reference TEXT NOT NULL DEFAULT ''");
    }
    const c2bHasPayerPhone = await sqliteColumnExists("mobile_money_c2b_events", "payer_phone");
    if (!c2bHasPayerPhone) {
      await run("ALTER TABLE mobile_money_c2b_events ADD COLUMN payer_phone TEXT");
    }
    const c2bHasAmount = await sqliteColumnExists("mobile_money_c2b_events", "amount");
    if (!c2bHasAmount) {
      await run("ALTER TABLE mobile_money_c2b_events ADD COLUMN amount REAL NOT NULL DEFAULT 0");
    }
    const c2bHasPaidAt = await sqliteColumnExists("mobile_money_c2b_events", "paid_at");
    if (!c2bHasPaidAt) {
      await run("ALTER TABLE mobile_money_c2b_events ADD COLUMN paid_at TEXT NOT NULL DEFAULT (datetime('now'))");
    }
    const c2bHasPayloadJson = await sqliteColumnExists("mobile_money_c2b_events", "payload_json");
    if (!c2bHasPayloadJson) {
      await run("ALTER TABLE mobile_money_c2b_events ADD COLUMN payload_json TEXT");
    }
    const c2bHasStatus = await sqliteColumnExists("mobile_money_c2b_events", "status");
    if (!c2bHasStatus) {
      await run("ALTER TABLE mobile_money_c2b_events ADD COLUMN status TEXT NOT NULL DEFAULT 'received'");
    }
    const c2bHasLoanId = await sqliteColumnExists("mobile_money_c2b_events", "loan_id");
    if (!c2bHasLoanId) {
      await run("ALTER TABLE mobile_money_c2b_events ADD COLUMN loan_id INTEGER");
    }
    const c2bHasRepaymentId = await sqliteColumnExists("mobile_money_c2b_events", "repayment_id");
    if (!c2bHasRepaymentId) {
      await run("ALTER TABLE mobile_money_c2b_events ADD COLUMN repayment_id INTEGER");
    }
    const c2bHasReconciliationNote = await sqliteColumnExists("mobile_money_c2b_events", "reconciliation_note");
    if (!c2bHasReconciliationNote) {
      await run("ALTER TABLE mobile_money_c2b_events ADD COLUMN reconciliation_note TEXT");
    }
    const c2bHasReconciledAt = await sqliteColumnExists("mobile_money_c2b_events", "reconciled_at");
    if (!c2bHasReconciledAt) {
      await run("ALTER TABLE mobile_money_c2b_events ADD COLUMN reconciled_at TEXT");
    }
    const c2bHasCreatedAt = await sqliteColumnExists("mobile_money_c2b_events", "created_at");
    if (!c2bHasCreatedAt) {
      await run("ALTER TABLE mobile_money_c2b_events ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'))");
    }
  }
  await run("CREATE UNIQUE INDEX IF NOT EXISTS idx_mobile_money_c2b_external_receipt ON mobile_money_c2b_events(external_receipt)");
  await run("CREATE INDEX IF NOT EXISTS idx_mobile_money_c2b_loan_id ON mobile_money_c2b_events(loan_id)");
  await run("CREATE INDEX IF NOT EXISTS idx_mobile_money_c2b_repayment_id ON mobile_money_c2b_events(repayment_id)");

  const hasGlAccountsTable = await sqliteTableExists("gl_accounts");
  if (!hasGlAccountsTable) {
    await run(`
      CREATE TABLE IF NOT EXISTS gl_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        account_type TEXT NOT NULL,
        is_contra INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  const hasApprovalRequestsTable = await sqliteTableExists("approval_requests");
  if (!hasApprovalRequestsTable) {
    await run(`
      CREATE TABLE IF NOT EXISTS approval_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_type TEXT NOT NULL,
        target_type TEXT NOT NULL DEFAULT 'loan',
        target_id INTEGER NOT NULL,
        loan_id INTEGER NOT NULL,
        branch_id INTEGER,
        requested_by_user_id INTEGER NOT NULL,
        checker_user_id INTEGER,
        status TEXT NOT NULL DEFAULT 'pending',
        request_payload TEXT NOT NULL,
        request_note TEXT,
        review_note TEXT,
        requested_at TEXT NOT NULL,
        reviewed_at TEXT,
        approved_at TEXT,
        rejected_at TEXT,
        executed_at TEXT,
        expires_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL ON UPDATE CASCADE,
        FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        FOREIGN KEY (checker_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
  } else {
    const hasApprovalRequestExpiresAt = await sqliteColumnExists("approval_requests", "expires_at");
    if (!hasApprovalRequestExpiresAt) {
      await run("ALTER TABLE approval_requests ADD COLUMN expires_at TEXT");
      await run(`
        UPDATE approval_requests
        SET expires_at = datetime(COALESCE(requested_at, created_at), '+7 days')
        WHERE expires_at IS NULL
          AND status = 'pending'
      `);
    }
  }
  await run("CREATE INDEX IF NOT EXISTS idx_approval_requests_loan_id ON approval_requests(loan_id)");
  await run("CREATE INDEX IF NOT EXISTS idx_approval_requests_branch_id ON approval_requests(branch_id)");
  await run("CREATE INDEX IF NOT EXISTS idx_approval_requests_requested_by_user_id ON approval_requests(requested_by_user_id)");
  await run("CREATE INDEX IF NOT EXISTS idx_approval_requests_checker_user_id ON approval_requests(checker_user_id)");
  await run("CREATE INDEX IF NOT EXISTS idx_approval_requests_expires_at ON approval_requests(expires_at)");
  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_requests_pending_unique
    ON approval_requests(request_type, target_type, target_id)
    WHERE status = 'pending'
  `);

  const hasPermissionsTable = await sqliteTableExists("permissions");
  if (!hasPermissionsTable) {
    await run(`
      CREATE TABLE IF NOT EXISTS permissions (
        permission_id TEXT NOT NULL PRIMARY KEY,
        description TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
  }

  const hasRolePermissionsTable = await sqliteTableExists("role_permissions");
  if (!hasRolePermissionsTable) {
    await run(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        role TEXT NOT NULL,
        permission_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (role, permission_id),
        FOREIGN KEY (permission_id) REFERENCES permissions(permission_id) ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
  }
  await run("CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id)");

  const hasUserCustomPermissionsTable = await sqliteTableExists("user_custom_permissions");
  if (!hasUserCustomPermissionsTable) {
    await run(`
      CREATE TABLE IF NOT EXISTS user_custom_permissions (
        user_id INTEGER NOT NULL,
        permission_id TEXT NOT NULL,
        granted_at TEXT NOT NULL,
        granted_by_user_id INTEGER,
        PRIMARY KEY (user_id, permission_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY (permission_id) REFERENCES permissions(permission_id) ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY (granted_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
  }
  await run("CREATE INDEX IF NOT EXISTS idx_user_custom_permissions_permission_id ON user_custom_permissions(permission_id)");
  await run("CREATE INDEX IF NOT EXISTS idx_user_custom_permissions_granted_by_user_id ON user_custom_permissions(granted_by_user_id)");

  const hasLoanProductsTable = await sqliteTableExists("loan_products");
  if (!hasLoanProductsTable) {
    await run(`
      CREATE TABLE IF NOT EXISTS loan_products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        interest_rate REAL NOT NULL DEFAULT 0,
        interest_accrual_method TEXT NOT NULL DEFAULT 'upfront',
        registration_fee REAL NOT NULL DEFAULT 0,
        processing_fee REAL NOT NULL DEFAULT 0,
        penalty_rate_daily REAL NOT NULL DEFAULT 0,
        penalty_flat_amount REAL NOT NULL DEFAULT 0,
        penalty_grace_days INTEGER NOT NULL DEFAULT 0,
        penalty_cap_amount REAL,
        penalty_compounding_method TEXT NOT NULL DEFAULT 'simple',
        penalty_base_amount TEXT NOT NULL DEFAULT 'installment_outstanding',
        penalty_cap_percent_of_outstanding REAL,
        pricing_strategy TEXT NOT NULL DEFAULT 'flat_rate',
        pricing_config TEXT,
        min_principal REAL NOT NULL DEFAULT 1,
        max_principal REAL NOT NULL DEFAULT 1000000,
        min_term_weeks INTEGER NOT NULL DEFAULT 1,
        max_term_weeks INTEGER NOT NULL DEFAULT 1,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT
      )
    `);
  } else {
    const hasInterestAccrualMethod = await sqliteColumnExists("loan_products", "interest_accrual_method");
    if (!hasInterestAccrualMethod) {
      await run("ALTER TABLE loan_products ADD COLUMN interest_accrual_method TEXT NOT NULL DEFAULT 'upfront'");
    }
    const hasPenaltyCompoundingMethod = await sqliteColumnExists("loan_products", "penalty_compounding_method");
    if (!hasPenaltyCompoundingMethod) {
      await run("ALTER TABLE loan_products ADD COLUMN penalty_compounding_method TEXT NOT NULL DEFAULT 'simple'");
    }
    const hasPenaltyBaseAmount = await sqliteColumnExists("loan_products", "penalty_base_amount");
    if (!hasPenaltyBaseAmount) {
      await run("ALTER TABLE loan_products ADD COLUMN penalty_base_amount TEXT NOT NULL DEFAULT 'installment_outstanding'");
    }
    const hasPenaltyCapPercentOutstanding = await sqliteColumnExists("loan_products", "penalty_cap_percent_of_outstanding");
    if (!hasPenaltyCapPercentOutstanding) {
      await run("ALTER TABLE loan_products ADD COLUMN penalty_cap_percent_of_outstanding REAL");
    }
    const hasPricingStrategy = await sqliteColumnExists("loan_products", "pricing_strategy");
    if (!hasPricingStrategy) {
      await run("ALTER TABLE loan_products ADD COLUMN pricing_strategy TEXT NOT NULL DEFAULT 'flat_rate'");
    }
    const hasPricingConfig = await sqliteColumnExists("loan_products", "pricing_config");
    if (!hasPricingConfig) {
      await run("ALTER TABLE loan_products ADD COLUMN pricing_config TEXT");
    }
    const hasMaxGraduatedPrincipal = await sqliteColumnExists("loan_products", "max_graduated_principal");
    if (!hasMaxGraduatedPrincipal) {
      await run("ALTER TABLE loan_products ADD COLUMN max_graduated_principal REAL");
    }
    const hasMinPrincipal = await sqliteColumnExists("loan_products", "min_principal");
    if (!hasMinPrincipal) {
      await run("ALTER TABLE loan_products ADD COLUMN min_principal REAL NOT NULL DEFAULT 1");
    }
    const hasMaxPrincipal = await sqliteColumnExists("loan_products", "max_principal");
    if (!hasMaxPrincipal) {
      await run("ALTER TABLE loan_products ADD COLUMN max_principal REAL NOT NULL DEFAULT 1000000");
    }
  }

  const hasGlJournalsTable = await sqliteTableExists("gl_journals");
  if (!hasGlJournalsTable) {
    await run(`
      CREATE TABLE IF NOT EXISTS gl_journals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reference_type TEXT,
        reference_id INTEGER,
        loan_id INTEGER,
        client_id INTEGER,
        branch_id INTEGER,
        base_currency TEXT NOT NULL DEFAULT 'KES',
        transaction_currency TEXT NOT NULL DEFAULT 'KES',
        exchange_rate REAL NOT NULL DEFAULT 1,
        fx_rate_source TEXT,
        fx_rate_timestamp TEXT,
        description TEXT,
        note TEXT,
        posted_by_user_id INTEGER,
        total_debit REAL DEFAULT 0,
        total_credit REAL DEFAULT 0,
        posted_at TEXT DEFAULT (datetime('now')),
        external_reference_id TEXT
      )
    `);
  } else {
    const hasGlJournalBaseCurrency = await sqliteColumnExists("gl_journals", "base_currency");
    if (!hasGlJournalBaseCurrency) {
      await run("ALTER TABLE gl_journals ADD COLUMN base_currency TEXT NOT NULL DEFAULT 'KES'");
    }
    const hasGlJournalTransactionCurrency = await sqliteColumnExists("gl_journals", "transaction_currency");
    if (!hasGlJournalTransactionCurrency) {
      await run("ALTER TABLE gl_journals ADD COLUMN transaction_currency TEXT NOT NULL DEFAULT 'KES'");
    }
    const hasGlJournalExchangeRate = await sqliteColumnExists("gl_journals", "exchange_rate");
    if (!hasGlJournalExchangeRate) {
      await run("ALTER TABLE gl_journals ADD COLUMN exchange_rate REAL NOT NULL DEFAULT 1");
    }
    const hasGlJournalFxRateSource = await sqliteColumnExists("gl_journals", "fx_rate_source");
    if (!hasGlJournalFxRateSource) {
      await run("ALTER TABLE gl_journals ADD COLUMN fx_rate_source TEXT");
    }
    const hasGlJournalFxRateTimestamp = await sqliteColumnExists("gl_journals", "fx_rate_timestamp");
    if (!hasGlJournalFxRateTimestamp) {
      await run("ALTER TABLE gl_journals ADD COLUMN fx_rate_timestamp TEXT");
    }
    const hasGlJournalExternalReferenceId = await sqliteColumnExists("gl_journals", "external_reference_id");
    if (!hasGlJournalExternalReferenceId) {
      await run("ALTER TABLE gl_journals ADD COLUMN external_reference_id TEXT");
    }
  }
  await run("CREATE INDEX IF NOT EXISTS idx_gl_journals_external_reference_id ON gl_journals(external_reference_id)");

  const hasGlAccountingBatchesTable = await sqliteTableExists("gl_accounting_batches");
  if (!hasGlAccountingBatchesTable) {
    await run(`
      CREATE TABLE IF NOT EXISTS gl_accounting_batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_type TEXT NOT NULL,
        effective_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        triggered_by_user_id INTEGER,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (triggered_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
  } else {
    const hasBatchType = await sqliteColumnExists("gl_accounting_batches", "batch_type");
    if (!hasBatchType) {
      await run("ALTER TABLE gl_accounting_batches ADD COLUMN batch_type TEXT NOT NULL DEFAULT 'eod'");
    }
    const hasEffectiveDate = await sqliteColumnExists("gl_accounting_batches", "effective_date");
    if (!hasEffectiveDate) {
      await run("ALTER TABLE gl_accounting_batches ADD COLUMN effective_date TEXT NOT NULL DEFAULT (date('now'))");
    }
    const hasStatus = await sqliteColumnExists("gl_accounting_batches", "status");
    if (!hasStatus) {
      await run("ALTER TABLE gl_accounting_batches ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'");
    }
    const hasTriggeredByUserId = await sqliteColumnExists("gl_accounting_batches", "triggered_by_user_id");
    if (!hasTriggeredByUserId) {
      await run("ALTER TABLE gl_accounting_batches ADD COLUMN triggered_by_user_id INTEGER");
    }
    const hasNote = await sqliteColumnExists("gl_accounting_batches", "note");
    if (!hasNote) {
      await run("ALTER TABLE gl_accounting_batches ADD COLUMN note TEXT");
    }
    const hasCreatedAt = await sqliteColumnExists("gl_accounting_batches", "created_at");
    if (!hasCreatedAt) {
      await run("ALTER TABLE gl_accounting_batches ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'))");
    }
    const hasUpdatedAt = await sqliteColumnExists("gl_accounting_batches", "updated_at");
    if (!hasUpdatedAt) {
      await run("ALTER TABLE gl_accounting_batches ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))");
    }
  }
  await run("CREATE INDEX IF NOT EXISTS idx_gl_accounting_batches_type_date ON gl_accounting_batches(batch_type, effective_date)");
  await run("CREATE INDEX IF NOT EXISTS idx_gl_accounting_batches_status ON gl_accounting_batches(status)");
  await run("CREATE INDEX IF NOT EXISTS idx_gl_accounting_batches_triggered_by ON gl_accounting_batches(triggered_by_user_id)");

  const hasGlEntriesTable = await sqliteTableExists("gl_entries");
  if (!hasGlEntriesTable) {
    await run(`
      CREATE TABLE IF NOT EXISTS gl_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        journal_id INTEGER NOT NULL,
        account_id INTEGER NOT NULL,
        side TEXT NOT NULL,
        amount REAL NOT NULL,
        memo TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (journal_id) REFERENCES gl_journals(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        FOREIGN KEY (account_id) REFERENCES gl_accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);
    await run("CREATE INDEX IF NOT EXISTS idx_gl_entries_journal_id ON gl_entries(journal_id)");
    await run("CREATE INDEX IF NOT EXISTS idx_gl_entries_account_id ON gl_entries(account_id)");
  }

  await run(
    `
      INSERT INTO gl_accounts (code, name, account_type, is_contra, is_active, created_at)
      SELECT ?, ?, ?, 0, 1, datetime('now')
      WHERE NOT EXISTS (
        SELECT 1
        FROM gl_accounts
        WHERE code = ?
      )
    `,
    ["LOAN_RECEIVABLE", "Loan Receivable", "asset", "LOAN_RECEIVABLE"],
  );

  await run(
    `
      INSERT INTO gl_accounts (code, name, account_type, is_contra, is_active, created_at)
      SELECT ?, ?, ?, 0, 1, datetime('now')
      WHERE NOT EXISTS (
        SELECT 1
        FROM gl_accounts
        WHERE code = ?
      )
    `,
    ["CASH", "Cash", "asset", "CASH"],
  );

  await run(
    `
      INSERT INTO gl_accounts (code, name, account_type, is_contra, is_active, created_at)
      SELECT ?, ?, ?, 0, 1, datetime('now')
      WHERE NOT EXISTS (
        SELECT 1
        FROM gl_accounts
        WHERE code = ?
      )
    `,
    ["INTEREST_INCOME", "Interest Income", "revenue", "INTEREST_INCOME"],
  );

  await run(
    `
      INSERT INTO gl_accounts (code, name, account_type, is_contra, is_active, created_at)
      SELECT ?, ?, ?, 0, 1, datetime('now')
      WHERE NOT EXISTS (
        SELECT 1
        FROM gl_accounts
        WHERE code = ?
      )
    `,
    ["FEE_INCOME", "Fee Income", "revenue", "FEE_INCOME"],
  );

  await run(
    `
      INSERT INTO gl_accounts (code, name, account_type, is_contra, is_active, created_at)
      SELECT ?, ?, ?, 0, 1, datetime('now')
      WHERE NOT EXISTS (
        SELECT 1
        FROM gl_accounts
        WHERE code = ?
      )
    `,
    ["WRITE_OFF_EXPENSE", "Write-off Expense", "expense", "WRITE_OFF_EXPENSE"],
  );

  await run(
    `
      INSERT INTO gl_accounts (code, name, account_type, is_contra, is_active, created_at)
      SELECT ?, ?, ?, 0, 1, datetime('now')
      WHERE NOT EXISTS (
        SELECT 1
        FROM gl_accounts
        WHERE code = ?
      )
    `,
    ["PENALTY_INCOME", "Penalty Income", "revenue", "PENALTY_INCOME"],
  );

  await run(
    `
      INSERT INTO gl_accounts (code, name, account_type, is_contra, is_active, created_at)
      SELECT ?, ?, ?, 0, 1, datetime('now')
      WHERE NOT EXISTS (
        SELECT 1
        FROM gl_accounts
        WHERE code = ?
      )
    `,
    ["UNEARNED_INTEREST", "Unearned Interest", "liability", "UNEARNED_INTEREST"],
  );

  await run(
    `
      INSERT INTO gl_accounts (code, name, account_type, is_contra, is_active, created_at)
      SELECT ?, ?, ?, 0, 1, datetime('now')
      WHERE NOT EXISTS (
        SELECT 1
        FROM gl_accounts
        WHERE code = ?
      )
    `,
    ["SUSPENSE_FUNDS", "Suspense Funds", "liability", "SUSPENSE_FUNDS"],
  );

  await run(
    `
      INSERT INTO gl_accounts (code, name, account_type, is_contra, is_active, created_at)
      SELECT ?, ?, ?, 0, 1, datetime('now')
      WHERE NOT EXISTS (
        SELECT 1
        FROM gl_accounts
        WHERE code = ?
      )
    `,
    ["FX_GAIN_LOSS", "FX Gain/Loss", "revenue", "FX_GAIN_LOSS"],
  );

  const hasLoansTable = await sqliteTableExists("loans");
  if (hasLoansTable) {
    const loansHasProductId = await sqliteColumnExists("loans", "product_id");
    if (!loansHasProductId) {
      await run("ALTER TABLE loans ADD COLUMN product_id INTEGER");
    }

    const loansHasArchivedAt = await sqliteColumnExists("loans", "archived_at");
    if (!loansHasArchivedAt) {
      await run("ALTER TABLE loans ADD COLUMN archived_at TEXT");
    }

    const loansHasCreatedAt = await sqliteColumnExists("loans", "created_at");
    if (!loansHasCreatedAt) {
      await run("ALTER TABLE loans ADD COLUMN created_at TEXT");
      await run("UPDATE loans SET created_at = datetime('now') WHERE created_at IS NULL");
    }

    const loansHasDisbursedAt = await sqliteColumnExists("loans", "disbursed_at");
    if (!loansHasDisbursedAt) {
      await run("ALTER TABLE loans ADD COLUMN disbursed_at TEXT");
    }

    const loansHasDisbursedByUserId = await sqliteColumnExists("loans", "disbursed_by_user_id");
    if (!loansHasDisbursedByUserId) {
      await run("ALTER TABLE loans ADD COLUMN disbursed_by_user_id INTEGER");
    }

    const loansHasDisbursementNote = await sqliteColumnExists("loans", "disbursement_note");
    if (!loansHasDisbursementNote) {
      await run("ALTER TABLE loans ADD COLUMN disbursement_note TEXT");
    }

    const loansHasStatus = await sqliteColumnExists("loans", "status");
    if (!loansHasStatus) {
      await run("ALTER TABLE loans ADD COLUMN status TEXT DEFAULT 'pending_approval'");
      await run("UPDATE loans SET status = COALESCE(NULLIF(TRIM(status), ''), 'pending_approval')");
    }

    const loansHasOfficerId = await sqliteColumnExists("loans", "officer_id");
    if (!loansHasOfficerId) {
      await run("ALTER TABLE loans ADD COLUMN officer_id INTEGER");
    }

    const loansHasApprovedByUserId = await sqliteColumnExists("loans", "approved_by_user_id");
    if (!loansHasApprovedByUserId) {
      await run("ALTER TABLE loans ADD COLUMN approved_by_user_id INTEGER");
    }

    const loansHasApprovedAt = await sqliteColumnExists("loans", "approved_at");
    if (!loansHasApprovedAt) {
      await run("ALTER TABLE loans ADD COLUMN approved_at TEXT");
    }

    const loansHasRejectedByUserId = await sqliteColumnExists("loans", "rejected_by_user_id");
    if (!loansHasRejectedByUserId) {
      await run("ALTER TABLE loans ADD COLUMN rejected_by_user_id INTEGER");
    }

    const loansHasRejectedAt = await sqliteColumnExists("loans", "rejected_at");
    if (!loansHasRejectedAt) {
      await run("ALTER TABLE loans ADD COLUMN rejected_at TEXT");
    }

    const loansHasRejectionReason = await sqliteColumnExists("loans", "rejection_reason");
    if (!loansHasRejectionReason) {
      await run("ALTER TABLE loans ADD COLUMN rejection_reason TEXT");
    }

    const loansHasExternalReference = await sqliteColumnExists("loans", "external_reference");
    if (!loansHasExternalReference) {
      await run("ALTER TABLE loans ADD COLUMN external_reference TEXT");
    }

    const loansHasPurpose = await sqliteColumnExists("loans", "purpose");
    if (!loansHasPurpose) {
      await run("ALTER TABLE loans ADD COLUMN purpose TEXT");
    }

    const loansTableSql = await sqliteTableDefinitionSql("loans");
    const normalizedLoansTableSql = loansTableSql.toLowerCase().replace(/\s+/g, " ");
    const loansStatusConstraintIsLegacy = normalizedLoansTableSql.includes("status")
      && !normalizedLoansTableSql.includes("pending_approval");

    if (loansStatusConstraintIsLegacy) {
      await run("PRAGMA foreign_keys = OFF");
      try {
        await run("DROP TABLE IF EXISTS loans__compat");
        await run(`
          CREATE TABLE loans__compat (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER NOT NULL,
            product_id INTEGER,
            branch_id INTEGER,
            created_by_user_id INTEGER,
            principal REAL NOT NULL,
            interest_rate REAL NOT NULL,
            term_months INTEGER NOT NULL,
            term_weeks INTEGER,
            registration_fee REAL NOT NULL DEFAULT 0,
            processing_fee REAL NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            disbursed_at TEXT,
            status TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval', 'approved', 'rejected', 'active', 'closed', 'written_off', 'restructured')),
            officer_id INTEGER,
            disbursed_by_user_id INTEGER,
            disbursement_note TEXT,
            approved_by_user_id INTEGER,
            approved_at TEXT,
            rejected_by_user_id INTEGER,
            rejected_at TEXT,
            rejection_reason TEXT,
            archived_at TEXT,
            expected_total REAL NOT NULL,
            repaid_total REAL NOT NULL DEFAULT 0,
            balance REAL NOT NULL,
            external_reference TEXT,
            FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT ON UPDATE CASCADE,
            FOREIGN KEY (product_id) REFERENCES loan_products(id) ON DELETE SET NULL ON UPDATE CASCADE,
            FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL ON UPDATE CASCADE,
            FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
            FOREIGN KEY (officer_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
            FOREIGN KEY (disbursed_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
            FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
            FOREIGN KEY (rejected_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
          )
        `);
        await run(`
          INSERT INTO loans__compat (
            id,
            client_id,
            product_id,
            branch_id,
            created_by_user_id,
            principal,
            interest_rate,
            term_months,
            term_weeks,
            registration_fee,
            processing_fee,
            created_at,
            disbursed_at,
            status,
            officer_id,
            disbursed_by_user_id,
            disbursement_note,
            approved_by_user_id,
            approved_at,
            rejected_by_user_id,
            rejected_at,
            rejection_reason,
            archived_at,
            expected_total,
            repaid_total,
            balance,
            external_reference
          )
          SELECT
            id,
            client_id,
            product_id,
            branch_id,
            created_by_user_id,
            principal,
            interest_rate,
            term_months,
            term_weeks,
            COALESCE(registration_fee, 0),
            COALESCE(processing_fee, 0),
            COALESCE(created_at, datetime('now')),
            disbursed_at,
            CASE
              WHEN status IN ('pending_approval', 'approved', 'rejected', 'active', 'closed', 'written_off', 'restructured') THEN status
              WHEN status IS NULL OR TRIM(status) = '' THEN 'active'
              ELSE 'active'
            END,
            officer_id,
            disbursed_by_user_id,
            disbursement_note,
            approved_by_user_id,
            approved_at,
            rejected_by_user_id,
            rejected_at,
            rejection_reason,
            archived_at,
            expected_total,
            COALESCE(repaid_total, 0),
            balance,
            external_reference
          FROM loans
        `);
        await run("DROP TABLE loans");
        await run("ALTER TABLE loans__compat RENAME TO loans");
      } finally {
        await run("PRAGMA foreign_keys = ON");
      }
    }
  }

  const hasClientsTable = await sqliteTableExists("clients");
  if (hasClientsTable) {
    const clientsHasDeletedAt = await sqliteColumnExists("clients", "deleted_at");
    if (!clientsHasDeletedAt) {
      await run("ALTER TABLE clients ADD COLUMN deleted_at TEXT");
    }
    const clientsHasKycStatus = await sqliteColumnExists("clients", "kyc_status");
    if (!clientsHasKycStatus) {
      await run("ALTER TABLE clients ADD COLUMN kyc_status TEXT NOT NULL DEFAULT 'pending'");
      await run("UPDATE clients SET kyc_status = 'pending' WHERE kyc_status IS NULL OR TRIM(kyc_status) = ''");
    }
    const clientsHasOnboardingStatus = await sqliteColumnExists("clients", "onboarding_status");
    if (!clientsHasOnboardingStatus) {
      await run("ALTER TABLE clients ADD COLUMN onboarding_status TEXT NOT NULL DEFAULT 'registered'");
      await run("UPDATE clients SET onboarding_status = 'registered' WHERE onboarding_status IS NULL OR TRIM(onboarding_status) = ''");
    }
    const clientsHasFeePaymentStatus = await sqliteColumnExists("clients", "fee_payment_status");
    if (!clientsHasFeePaymentStatus) {
      await run("ALTER TABLE clients ADD COLUMN fee_payment_status TEXT NOT NULL DEFAULT 'unpaid'");
      await run("UPDATE clients SET fee_payment_status = 'unpaid' WHERE fee_payment_status IS NULL OR TRIM(fee_payment_status) = ''");
    }
    const clientsHasFeesPaidAt = await sqliteColumnExists("clients", "fees_paid_at");
    if (!clientsHasFeesPaidAt) {
      await run("ALTER TABLE clients ADD COLUMN fees_paid_at TEXT");
    }
  }

  const hasGuarantorsTable = await sqliteTableExists("guarantors");
  if (!hasGuarantorsTable) {
    await run(`
      CREATE TABLE IF NOT EXISTS guarantors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        phone TEXT,
        national_id TEXT,
        physical_address TEXT,
        occupation TEXT,
        employer_name TEXT,
        monthly_income REAL NOT NULL DEFAULT 0,
        guarantee_amount REAL NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        client_id INTEGER,
        branch_id INTEGER,
        created_by_user_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL ON UPDATE CASCADE,
        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL ON UPDATE CASCADE,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
  } else {
    const guarantorsHasClientId = await sqliteColumnExists("guarantors", "client_id");
    if (!guarantorsHasClientId) {
      await run("ALTER TABLE guarantors ADD COLUMN client_id INTEGER");
    }
    const guarantorsHasCreatedByUserId = await sqliteColumnExists("guarantors", "created_by_user_id");
    if (!guarantorsHasCreatedByUserId) {
      await run("ALTER TABLE guarantors ADD COLUMN created_by_user_id INTEGER");
    }
    const guarantorsHasGuaranteeAmount = await sqliteColumnExists("guarantors", "guarantee_amount");
    if (!guarantorsHasGuaranteeAmount) {
      await run("ALTER TABLE guarantors ADD COLUMN guarantee_amount REAL NOT NULL DEFAULT 0");
    }
  }
  await run("CREATE INDEX IF NOT EXISTS idx_guarantors_client_id ON guarantors(client_id)");

  const hasCollateralAssetsTable = await sqliteTableExists("collateral_assets");
  if (!hasCollateralAssetsTable) {
    await run(`
      CREATE TABLE IF NOT EXISTS collateral_assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_type TEXT NOT NULL,
        description TEXT NOT NULL,
        estimated_value REAL NOT NULL DEFAULT 0,
        ownership_type TEXT NOT NULL DEFAULT 'client',
        owner_name TEXT,
        owner_national_id TEXT,
        registration_number TEXT,
        logbook_number TEXT,
        title_number TEXT,
        location_details TEXT,
        valuation_date TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        client_id INTEGER,
        branch_id INTEGER,
        created_by_user_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL ON UPDATE CASCADE,
        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL ON UPDATE CASCADE,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
  } else {
    const collateralAssetsHasClientId = await sqliteColumnExists("collateral_assets", "client_id");
    if (!collateralAssetsHasClientId) {
      await run("ALTER TABLE collateral_assets ADD COLUMN client_id INTEGER");
    }
    const collateralAssetsHasCreatedByUserId = await sqliteColumnExists("collateral_assets", "created_by_user_id");
    if (!collateralAssetsHasCreatedByUserId) {
      await run("ALTER TABLE collateral_assets ADD COLUMN created_by_user_id INTEGER");
    }
  }
  await run("CREATE INDEX IF NOT EXISTS idx_collateral_assets_client_id ON collateral_assets(client_id)");

  const hasLoanGuarantorsTable = await sqliteTableExists("loan_guarantors");
  if (!hasLoanGuarantorsTable) {
    await run(`
      CREATE TABLE IF NOT EXISTS loan_guarantors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        loan_id INTEGER NOT NULL,
        guarantor_id INTEGER NOT NULL,
        guarantee_amount REAL NOT NULL DEFAULT 0,
        relationship_to_client TEXT,
        liability_type TEXT NOT NULL DEFAULT 'individual',
        note TEXT,
        created_by_user_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY (guarantor_id) REFERENCES guarantors(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
  } else {
    const loanGuarantorsHasGuaranteeAmount = await sqliteColumnExists("loan_guarantors", "guarantee_amount");
    if (!loanGuarantorsHasGuaranteeAmount) {
      await run("ALTER TABLE loan_guarantors ADD COLUMN guarantee_amount REAL NOT NULL DEFAULT 0");
    }
    const loanGuarantorsHasRelationshipToClient = await sqliteColumnExists("loan_guarantors", "relationship_to_client");
    if (!loanGuarantorsHasRelationshipToClient) {
      await run("ALTER TABLE loan_guarantors ADD COLUMN relationship_to_client TEXT");
    }
    const loanGuarantorsHasLiabilityType = await sqliteColumnExists("loan_guarantors", "liability_type");
    if (!loanGuarantorsHasLiabilityType) {
      await run("ALTER TABLE loan_guarantors ADD COLUMN liability_type TEXT NOT NULL DEFAULT 'individual'");
    }
    const loanGuarantorsHasNote = await sqliteColumnExists("loan_guarantors", "note");
    if (!loanGuarantorsHasNote) {
      await run("ALTER TABLE loan_guarantors ADD COLUMN note TEXT");
    }
    const loanGuarantorsHasCreatedByUserId = await sqliteColumnExists("loan_guarantors", "created_by_user_id");
    if (!loanGuarantorsHasCreatedByUserId) {
      await run("ALTER TABLE loan_guarantors ADD COLUMN created_by_user_id INTEGER");
    }
    const loanGuarantorsHasCreatedAt = await sqliteColumnExists("loan_guarantors", "created_at");
    if (!loanGuarantorsHasCreatedAt) {
      await run("ALTER TABLE loan_guarantors ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'))");
    }
  }
  await run("CREATE INDEX IF NOT EXISTS idx_loan_guarantors_loan_id ON loan_guarantors(loan_id)");
  await run("CREATE INDEX IF NOT EXISTS idx_loan_guarantors_guarantor_id ON loan_guarantors(guarantor_id)");
  await run("CREATE UNIQUE INDEX IF NOT EXISTS idx_loan_guarantors_unique_link ON loan_guarantors(loan_id, guarantor_id)");

  const hasLoanCollateralsTable = await sqliteTableExists("loan_collaterals");
  if (!hasLoanCollateralsTable) {
    await run(`
      CREATE TABLE IF NOT EXISTS loan_collaterals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        loan_id INTEGER NOT NULL,
        collateral_asset_id INTEGER NOT NULL,
        forced_sale_value REAL,
        lien_rank INTEGER NOT NULL DEFAULT 1,
        note TEXT,
        created_by_user_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY (collateral_asset_id) REFERENCES collateral_assets(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
  } else {
    const loanCollateralsHasForcedSaleValue = await sqliteColumnExists("loan_collaterals", "forced_sale_value");
    if (!loanCollateralsHasForcedSaleValue) {
      await run("ALTER TABLE loan_collaterals ADD COLUMN forced_sale_value REAL");
    }
    const loanCollateralsHasLienRank = await sqliteColumnExists("loan_collaterals", "lien_rank");
    if (!loanCollateralsHasLienRank) {
      await run("ALTER TABLE loan_collaterals ADD COLUMN lien_rank INTEGER NOT NULL DEFAULT 1");
    }
    const loanCollateralsHasNote = await sqliteColumnExists("loan_collaterals", "note");
    if (!loanCollateralsHasNote) {
      await run("ALTER TABLE loan_collaterals ADD COLUMN note TEXT");
    }
    const loanCollateralsHasCreatedByUserId = await sqliteColumnExists("loan_collaterals", "created_by_user_id");
    if (!loanCollateralsHasCreatedByUserId) {
      await run("ALTER TABLE loan_collaterals ADD COLUMN created_by_user_id INTEGER");
    }
    const loanCollateralsHasCreatedAt = await sqliteColumnExists("loan_collaterals", "created_at");
    if (!loanCollateralsHasCreatedAt) {
      await run("ALTER TABLE loan_collaterals ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'))");
    }
    const loanCollateralsHasCollateralAssetId = await sqliteColumnExists("loan_collaterals", "collateral_asset_id");
    if (!loanCollateralsHasCollateralAssetId) {
      const loanCollateralsHasCollateralId = await sqliteColumnExists("loan_collaterals", "collateral_id");
      if (loanCollateralsHasCollateralId) {
        await run("ALTER TABLE loan_collaterals ADD COLUMN collateral_asset_id INTEGER");
        await run("UPDATE loan_collaterals SET collateral_asset_id = collateral_id WHERE collateral_asset_id IS NULL");
      }
    }
  }
  await run("CREATE INDEX IF NOT EXISTS idx_loan_collaterals_loan_id ON loan_collaterals(loan_id)");
  await run("CREATE INDEX IF NOT EXISTS idx_loan_collaterals_collateral_id ON loan_collaterals(collateral_asset_id)");
  await run("CREATE UNIQUE INDEX IF NOT EXISTS idx_loan_collaterals_unique_link ON loan_collaterals(loan_id, collateral_asset_id)");

  const hasLoanInstallmentsTable = await sqliteTableExists("loan_installments");
  if (hasLoanInstallmentsTable) {
    const hasPenaltyAmountAccrued = await sqliteColumnExists("loan_installments", "penalty_amount_accrued");
    if (!hasPenaltyAmountAccrued) {
      await run("ALTER TABLE loan_installments ADD COLUMN penalty_amount_accrued REAL NOT NULL DEFAULT 0");
    }

    const hasPenaltyLastAppliedAt = await sqliteColumnExists("loan_installments", "penalty_last_applied_at");
    if (!hasPenaltyLastAppliedAt) {
      await run("ALTER TABLE loan_installments ADD COLUMN penalty_last_applied_at TEXT");
    }

    const hasPenaltyRateDaily = await sqliteColumnExists("loan_installments", "penalty_rate_daily");
    if (!hasPenaltyRateDaily) {
      await run("ALTER TABLE loan_installments ADD COLUMN penalty_rate_daily REAL");
    }

    const hasPenaltyFlatAmount = await sqliteColumnExists("loan_installments", "penalty_flat_amount");
    if (!hasPenaltyFlatAmount) {
      await run("ALTER TABLE loan_installments ADD COLUMN penalty_flat_amount REAL");
    }

    const hasPenaltyGraceDays = await sqliteColumnExists("loan_installments", "penalty_grace_days");
    if (!hasPenaltyGraceDays) {
      await run("ALTER TABLE loan_installments ADD COLUMN penalty_grace_days INTEGER");
    }

    const hasPenaltyCapAmount = await sqliteColumnExists("loan_installments", "penalty_cap_amount");
    if (!hasPenaltyCapAmount) {
      await run("ALTER TABLE loan_installments ADD COLUMN penalty_cap_amount REAL");
    }

    const hasPenaltyCompoundingMethod = await sqliteColumnExists("loan_installments", "penalty_compounding_method");
    if (!hasPenaltyCompoundingMethod) {
      await run("ALTER TABLE loan_installments ADD COLUMN penalty_compounding_method TEXT");
    }

    const hasPenaltyBaseAmount = await sqliteColumnExists("loan_installments", "penalty_base_amount");
    if (!hasPenaltyBaseAmount) {
      await run("ALTER TABLE loan_installments ADD COLUMN penalty_base_amount TEXT");
    }

    const hasPenaltyCapPercentOutstanding = await sqliteColumnExists("loan_installments", "penalty_cap_percent_of_outstanding");
    if (!hasPenaltyCapPercentOutstanding) {
      await run("ALTER TABLE loan_installments ADD COLUMN penalty_cap_percent_of_outstanding REAL");
    }
  }

  await run(`
    CREATE TABLE IF NOT EXISTS loan_disbursement_tranches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id INTEGER NOT NULL,
      tranche_number INTEGER NOT NULL,
      amount REAL NOT NULL,
      disbursed_at TEXT NOT NULL,
      disbursed_by_user_id INTEGER,
      note TEXT,
      is_final INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE ON UPDATE CASCADE,
      FOREIGN KEY (disbursed_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);
  await run("CREATE UNIQUE INDEX IF NOT EXISTS idx_loan_disbursement_tranches_loan_tranche ON loan_disbursement_tranches(loan_id, tranche_number)");
  await run("CREATE INDEX IF NOT EXISTS idx_loan_disbursement_tranches_loan_id ON loan_disbursement_tranches(loan_id)");

  await run(`
    CREATE TABLE IF NOT EXISTS loan_interest_profiles (
      loan_id INTEGER PRIMARY KEY,
      accrual_method TEXT NOT NULL DEFAULT 'upfront',
      accrual_basis TEXT NOT NULL DEFAULT 'flat',
      accrual_start_at TEXT,
      maturity_at TEXT,
      total_contractual_interest REAL NOT NULL DEFAULT 0,
      accrued_interest REAL NOT NULL DEFAULT 0,
      last_accrual_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS loan_interest_accrual_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id INTEGER NOT NULL,
      accrual_date TEXT NOT NULL,
      amount REAL NOT NULL,
      days_accrued INTEGER NOT NULL DEFAULT 0,
      balance_snapshot REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await run("CREATE UNIQUE INDEX IF NOT EXISTS idx_loan_interest_accrual_events_unique ON loan_interest_accrual_events(loan_id, accrual_date)");

  await run(`
    CREATE TABLE IF NOT EXISTS loan_contract_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id INTEGER NOT NULL,
      version_number INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      principal REAL NOT NULL,
      interest_rate REAL NOT NULL,
      term_weeks INTEGER NOT NULL,
      expected_total REAL NOT NULL,
      repaid_total REAL NOT NULL,
      balance REAL NOT NULL,
      snapshot_json TEXT,
      note TEXT,
      created_by_user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE ON UPDATE CASCADE,
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);
  await run("CREATE UNIQUE INDEX IF NOT EXISTS idx_loan_contract_versions_loan_version ON loan_contract_versions(loan_id, version_number)");

  await run(`
    CREATE TABLE IF NOT EXISTS loan_underwriting_assessments (
      loan_id INTEGER PRIMARY KEY,
      client_id INTEGER NOT NULL,
      branch_id INTEGER,
      principal REAL NOT NULL DEFAULT 0,
      expected_total REAL NOT NULL DEFAULT 0,
      balance REAL NOT NULL DEFAULT 0,
      term_weeks INTEGER NOT NULL DEFAULT 0,
      guarantor_count INTEGER NOT NULL DEFAULT 0,
      collateral_count INTEGER NOT NULL DEFAULT 0,
      support_income_total REAL NOT NULL DEFAULT 0,
      estimated_weekly_installment REAL NOT NULL DEFAULT 0,
      estimated_monthly_installment REAL NOT NULL DEFAULT 0,
      repayment_to_support_income_ratio REAL,
      collateral_value_total REAL NOT NULL DEFAULT 0,
      collateral_coverage_ratio REAL,
      guarantee_amount_total REAL NOT NULL DEFAULT 0,
      guarantee_coverage_ratio REAL,
      business_years INTEGER,
      kyc_status TEXT NOT NULL DEFAULT 'pending',
      risk_band TEXT NOT NULL DEFAULT 'medium',
      policy_decision TEXT NOT NULL DEFAULT 'manual_review',
      flags_json TEXT,
      assessment_json TEXT,
      override_decision TEXT,
      override_reason TEXT,
      assessed_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await run("CREATE INDEX IF NOT EXISTS idx_loan_underwriting_assessments_client_id ON loan_underwriting_assessments(client_id)");
  await run("CREATE INDEX IF NOT EXISTS idx_loan_underwriting_assessments_branch_id ON loan_underwriting_assessments(branch_id)");
}

async function ensureSqliteReportIndexes(): Promise<void> {
  if (dbClient !== "sqlite") {
    return;
  }

  await run("CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, is_active)");
  await run("CREATE INDEX IF NOT EXISTS idx_loans_client_id ON loans(client_id)");
  await run("CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status)");
  await run("CREATE INDEX IF NOT EXISTS idx_loans_branch_status ON loans(branch_id, status)");
  await run("CREATE INDEX IF NOT EXISTS idx_loans_branch_disbursed_at ON loans(branch_id, disbursed_at)");
  await run("CREATE INDEX IF NOT EXISTS idx_loans_created_by_disbursed_at ON loans(created_by_user_id, disbursed_at)");
  await run("CREATE INDEX IF NOT EXISTS idx_loans_created_at ON loans(created_at)");
  await run("CREATE INDEX IF NOT EXISTS idx_loans_officer_id ON loans(officer_id)");
  await run("CREATE INDEX IF NOT EXISTS idx_loans_external_reference ON loans(external_reference)");
  await run("CREATE INDEX IF NOT EXISTS idx_clients_kyc_status ON clients(kyc_status)");
  await run("CREATE INDEX IF NOT EXISTS idx_clients_onboarding_status ON clients(onboarding_status)");
  await run("CREATE INDEX IF NOT EXISTS idx_clients_fee_payment_status ON clients(fee_payment_status)");
  await run("CREATE INDEX IF NOT EXISTS idx_repayments_paid_at ON repayments(paid_at)");
  await run("CREATE INDEX IF NOT EXISTS idx_repayments_loan_paid_at ON repayments(loan_id, paid_at)");
  await run("CREATE INDEX IF NOT EXISTS idx_repayments_recorded_by_user_id ON repayments(recorded_by_user_id)");
  await run("CREATE INDEX IF NOT EXISTS idx_repayments_recorded_by_paid_at ON repayments(recorded_by_user_id, paid_at)");
  await run("CREATE INDEX IF NOT EXISTS idx_repayments_external_reference ON repayments(external_reference)");
  await run("CREATE INDEX IF NOT EXISTS idx_collection_actions_created_by_user_id ON collection_actions(created_by_user_id)");
  await run("CREATE INDEX IF NOT EXISTS idx_collection_actions_status_follow_up_date ON collection_actions(action_status, next_follow_up_date)");
  await run("CREATE INDEX IF NOT EXISTS idx_transactions_tx_type_occurred_at ON transactions(tx_type, occurred_at)");
  await run("CREATE INDEX IF NOT EXISTS idx_gl_entries_account_created_at ON gl_entries(account_id, created_at)");
  await run("CREATE INDEX IF NOT EXISTS idx_mobile_money_c2b_status ON mobile_money_c2b_events(status)");
  await run("CREATE INDEX IF NOT EXISTS idx_installments_loan_status_due_date ON loan_installments(loan_id, status, due_date)");
  await run("CREATE INDEX IF NOT EXISTS idx_installments_due_status_loan_id ON loan_installments(due_date, status, loan_id)");
  await run("CREATE INDEX IF NOT EXISTS idx_clients_branch_created_at ON clients(branch_id, created_at)");
}

async function ensureSqliteLoanContractVersionBackfill(): Promise<void> {
  if (dbClient !== "sqlite") {
    return;
  }

  const hasLoansTable = await sqliteTableExists("loans");
  const hasLoanContractVersionsTable = await sqliteTableExists("loan_contract_versions");
  if (!hasLoansTable || !hasLoanContractVersionsTable) {
    return;
  }

  const loans = await all(
    `
      SELECT
        id,
        client_id,
        product_id,
        branch_id,
        created_by_user_id,
        officer_id,
        principal,
        interest_rate,
        term_weeks,
        registration_fee,
        processing_fee,
        expected_total,
        repaid_total,
        balance,
        status,
        created_at,
        approved_at,
        rejected_at,
        rejection_reason,
        disbursed_at,
        disbursed_by_user_id,
        disbursement_note,
        external_reference
      FROM loans
      ORDER BY id ASC
    `,
  );

  const backfillTimestamp = new Date().toISOString();

  for (const loan of loans) {
    const existingVersions = await all(
      `
        SELECT id
        FROM loan_contract_versions
        WHERE loan_id = ?
        ORDER BY version_number ASC, id ASC
      `,
      [loan.id],
    );

    if (existingVersions.length > 0) {
      continue;
    }

    const tranches = await all(
      `
        SELECT
          id,
          tranche_number,
          amount,
          disbursed_at,
          note,
          is_final
        FROM loan_disbursement_tranches
        WHERE loan_id = ?
        ORDER BY tranche_number ASC, id ASC
      `,
      [loan.id],
    );

    const principal = toMoneyNumber(loan.principal);
    const interestRate = Number(loan.interest_rate || 0);
    const termWeeks = Number(loan.term_weeks || 0);
    const expectedTotal = toMoneyNumber(loan.expected_total);
    const currentRepaidTotal = toMoneyNumber(loan.repaid_total);
    const currentBalance = toMoneyNumber(loan.balance);
    const createdByUserId = Number(loan.created_by_user_id || 0) || null;

    const creationSnapshot = {
      backfilled: true,
      inferredFromCurrentState: true,
      reason: "startup contract version backfill",
      loan: {
        ...loan,
        status: "pending_approval",
        approved_at: null,
        rejected_at: null,
        rejection_reason: null,
        disbursed_at: null,
        disbursed_by_user_id: null,
        disbursement_note: null,
        repaid_total: 0,
        balance: expectedTotal,
      },
      disbursementSummary: {
        totalDisbursed: 0,
        remainingPrincipal: principal,
        trancheCount: 0,
        finalTrancheCount: 0,
      },
    };

    await run(
      `
        INSERT INTO loan_contract_versions (
          loan_id,
          version_number,
          event_type,
          principal,
          interest_rate,
          term_weeks,
          expected_total,
          repaid_total,
          balance,
          snapshot_json,
          note,
          created_by_user_id,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        Number(loan.id),
        1,
        "creation",
        principal,
        interestRate,
        termWeeks,
        expectedTotal,
        0,
        expectedTotal,
        JSON.stringify(creationSnapshot),
        "Backfilled creation version",
        createdByUserId,
        loan.created_at || backfillTimestamp,
      ],
    );

    let versionNumber = 2;
    let cumulativeDisbursed = 0;

    for (const tranche of tranches) {
      const trancheAmount = toMoneyNumber(tranche.amount);
      cumulativeDisbursed = toMoneyNumber(cumulativeDisbursed + trancheAmount);
      const isFinal = Number(tranche.is_final || 0) === 1;
      const remainingPrincipal = toMoneyNumber(Math.max(principal - cumulativeDisbursed, 0));
      const eventType = isFinal ? "disbursement" : "disbursement_tranche";
      const trancheSnapshot: Record<string, unknown> = {
        backfilled: true,
        inferredFromCurrentState: true,
        reason: "startup contract version backfill",
        loan: {
          ...loan,
          status: isFinal ? "active" : "approved",
          disbursed_at: isFinal ? (loan.disbursed_at || tranche.disbursed_at || null) : null,
          disbursed_by_user_id: isFinal ? (Number(loan.disbursed_by_user_id || 0) || null) : null,
          disbursement_note: isFinal ? (loan.disbursement_note || tranche.note || null) : null,
        },
        disbursementSummary: {
          totalDisbursed: cumulativeDisbursed,
          remainingPrincipal,
          trancheCount: Number(tranche.tranche_number || versionNumber - 1),
          finalTrancheCount: isFinal ? 1 : 0,
        },
        tranche: {
          trancheNumber: Number(tranche.tranche_number || 0),
          amount: trancheAmount,
          finalDisbursement: isFinal,
        },
      };

      if (isFinal) {
        trancheSnapshot.disbursement = {
          trancheNumber: Number(tranche.tranche_number || 0),
          amount: trancheAmount,
          finalDisbursement: true,
          totalDisbursedPrincipal: cumulativeDisbursed,
        };
      }

      await run(
        `
          INSERT INTO loan_contract_versions (
            loan_id,
            version_number,
            event_type,
            principal,
            interest_rate,
            term_weeks,
            expected_total,
            repaid_total,
            balance,
            snapshot_json,
            note,
            created_by_user_id,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          Number(loan.id),
          versionNumber,
          eventType,
          principal,
          interestRate,
          termWeeks,
          expectedTotal,
          currentRepaidTotal,
          currentBalance,
          JSON.stringify(trancheSnapshot),
          isFinal ? "Backfilled final disbursement version" : "Backfilled disbursement tranche version",
          createdByUserId,
          tranche.disbursed_at || loan.disbursed_at || loan.created_at || backfillTimestamp,
        ],
      );

      versionNumber += 1;
    }
  }
}

async function runLegacyRuntimeMigrations(): Promise<string[]> {
  await run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const migrationColumns = await all("PRAGMA table_info(schema_migrations)");
  const hasIdColumn = migrationColumns.some((column) => String(column.name || "").toLowerCase() === "id");
  const hasNameColumn = migrationColumns.some((column) => String(column.name || "").toLowerCase() === "name");
  const appliedMigrationRows = await all("SELECT * FROM schema_migrations");
  const appliedMigrationIds = new Set(
    appliedMigrationRows
      .map((row) => String(row.id || row.name || "").trim())
      .filter(Boolean),
  );
  const appliedNow: string[] = [];

  for (const migration of runtimeMigrations) {
    const migrationId = String(migration?.id || "").trim();
    if (!migrationId || appliedMigrationIds.has(migrationId) || typeof migration?.up !== "function") {
      continue;
    }

    await migration.up({ run, get, all } as any);
    if (hasIdColumn && hasNameColumn) {
      await run(
        "INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, datetime('now'))",
        [migrationId, migrationId],
      );
    } else if (hasNameColumn) {
      await run(
        "INSERT INTO schema_migrations (name, applied_at) VALUES (?, datetime('now'))",
        [migrationId],
      );
    } else {
      await run(
        "INSERT INTO schema_migrations (id, applied_at) VALUES (?, datetime('now'))",
        [migrationId],
      );
    }
    appliedMigrationIds.add(migrationId);
    appliedNow.push(migrationId);
  }

  return appliedNow;
}

async function initSchema(): Promise<void> {
  return;
}

async function runMigrations(options: RunMigrationsOptions = {}): Promise<RunMigrationsResult> {
  const direction: "up" | "down" = options.direction === "down" ? "down" : "up";

  if (direction === "down") {
    throw new Error(
      "Down migrations are not supported in Prisma-managed mode. Use `prisma migrate resolve` or a forward migration instead.",
    );
  }

  if (dbClient === "sqlite") {
    await bootstrapSqliteSchemaFromPrismaSchema();
    await ensureSqliteRuntimeCompatibilitySchema();
    const appliedRuntimeMigrations = await runLegacyRuntimeMigrations();
    await ensureSqliteLoanContractVersionBackfill();
    await ensureSqliteReportIndexes();
    await seedHierarchyData();
    await seedDefaultLoanProduct();
    await seedDefaultAdmin();

    return {
      direction,
      applied: ["sqlite_schema_bootstrap_from_prisma", ...appliedRuntimeMigrations],
      skipped: ["prisma_live_schema_sync_skipped_sqlite_runtime"],
    };
  }
  const applied: string[] = [];
  const skipped: string[] = [];

  if (dbClient === "postgres") {
    await executePrismaMigrateDeploy();
    applied.push("prisma_migrate_deploy");
  }

  await seedHierarchyData();
  await seedDefaultLoanProduct();
  await seedDefaultAdmin();

  return {
    direction,
    applied,
    skipped,
  };
}

export {
  initSchema,
  runMigrations,
};






