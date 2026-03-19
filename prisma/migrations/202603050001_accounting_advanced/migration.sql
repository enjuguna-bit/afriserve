ALTER TABLE "gl_journals" ADD COLUMN "base_currency" TEXT NOT NULL DEFAULT 'KES';
ALTER TABLE "gl_journals" ADD COLUMN "transaction_currency" TEXT NOT NULL DEFAULT 'KES';
ALTER TABLE "gl_journals" ADD COLUMN "exchange_rate" REAL NOT NULL DEFAULT 1;
ALTER TABLE "gl_journals" ADD COLUMN "fx_rate_source" TEXT;
ALTER TABLE "gl_journals" ADD COLUMN "fx_rate_timestamp" TEXT;

ALTER TABLE "gl_entries" ADD COLUMN "transaction_amount" REAL;
ALTER TABLE "gl_entries" ADD COLUMN "transaction_currency" TEXT;
ALTER TABLE "gl_entries" ADD COLUMN "coa_version_id" INTEGER;
ALTER TABLE "gl_entries" ADD COLUMN "coa_account_code" TEXT;
ALTER TABLE "gl_entries" ADD COLUMN "coa_account_name" TEXT;

CREATE TABLE "gl_fx_rates" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "base_currency" TEXT NOT NULL,
    "quote_currency" TEXT NOT NULL,
    "rate" REAL NOT NULL,
    "source" TEXT NOT NULL,
    "quoted_at" TEXT NOT NULL,
    "created_by_user_id" INTEGER,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "gl_fx_rates_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "gl_batch_runs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "batch_type" TEXT NOT NULL,
    "effective_date" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TEXT NOT NULL,
    "completed_at" TEXT,
    "triggered_by_user_id" INTEGER,
    "summary_json" TEXT,
    "error_message" TEXT,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "gl_batch_runs_triggered_by_user_id_fkey" FOREIGN KEY ("triggered_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "gl_period_locks" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "batch_run_id" INTEGER,
    "lock_type" TEXT NOT NULL,
    "lock_date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'locked',
    "note" TEXT,
    "locked_by_user_id" INTEGER,
    "locked_at" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "gl_period_locks_batch_run_id_fkey" FOREIGN KEY ("batch_run_id") REFERENCES "gl_batch_runs" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "gl_period_locks_locked_by_user_id_fkey" FOREIGN KEY ("locked_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "gl_balance_snapshots" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "batch_run_id" INTEGER,
    "snapshot_date" TEXT NOT NULL,
    "account_id" INTEGER NOT NULL,
    "branch_id" INTEGER,
    "currency" TEXT NOT NULL,
    "debit_total" REAL NOT NULL DEFAULT 0,
    "credit_total" REAL NOT NULL DEFAULT 0,
    "net_balance" REAL NOT NULL DEFAULT 0,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "gl_balance_snapshots_batch_run_id_fkey" FOREIGN KEY ("batch_run_id") REFERENCES "gl_batch_runs" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "gl_balance_snapshots_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "gl_accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "gl_balance_snapshots_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "gl_trial_balance_snapshots" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "batch_run_id" INTEGER,
    "snapshot_date" TEXT NOT NULL,
    "branch_id" INTEGER,
    "currency" TEXT NOT NULL,
    "total_debit" REAL NOT NULL DEFAULT 0,
    "total_credit" REAL NOT NULL DEFAULT 0,
    "balanced" INTEGER NOT NULL DEFAULT 1,
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "gl_trial_balance_snapshots_batch_run_id_fkey" FOREIGN KEY ("batch_run_id") REFERENCES "gl_batch_runs" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "gl_trial_balance_snapshots_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "gl_coa_versions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "version_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "effective_from" TEXT,
    "effective_to" TEXT,
    "parent_version_id" INTEGER,
    "notes" TEXT,
    "created_by_user_id" INTEGER,
    "activated_by_user_id" INTEGER,
    "activated_at" TEXT,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    CONSTRAINT "gl_coa_versions_parent_version_id_fkey" FOREIGN KEY ("parent_version_id") REFERENCES "gl_coa_versions" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "gl_coa_versions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "gl_coa_versions_activated_by_user_id_fkey" FOREIGN KEY ("activated_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "gl_coa_accounts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "coa_version_id" INTEGER NOT NULL,
    "base_account_id" INTEGER,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "account_type" TEXT NOT NULL,
    "is_contra" INTEGER NOT NULL DEFAULT 0,
    "is_posting_allowed" INTEGER NOT NULL DEFAULT 1,
    "is_active" INTEGER NOT NULL DEFAULT 1,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    CONSTRAINT "gl_coa_accounts_coa_version_id_fkey" FOREIGN KEY ("coa_version_id") REFERENCES "gl_coa_versions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "gl_coa_accounts_base_account_id_fkey" FOREIGN KEY ("base_account_id") REFERENCES "gl_accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "gl_suspense_cases" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "external_reference" TEXT,
    "source_channel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "description" TEXT,
    "branch_id" INTEGER,
    "client_id" INTEGER,
    "loan_id" INTEGER,
    "transaction_currency" TEXT NOT NULL DEFAULT 'KES',
    "transaction_amount" REAL NOT NULL,
    "transaction_amount_remaining" REAL NOT NULL,
    "book_currency" TEXT NOT NULL DEFAULT 'KES',
    "book_amount" REAL NOT NULL,
    "book_amount_remaining" REAL NOT NULL,
    "opening_fx_rate" REAL NOT NULL DEFAULT 1,
    "received_at" TEXT NOT NULL,
    "created_by_user_id" INTEGER,
    "resolved_by_user_id" INTEGER,
    "resolved_at" TEXT,
    "note" TEXT,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    CONSTRAINT "gl_suspense_cases_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "gl_suspense_cases_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "gl_suspense_cases_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "gl_suspense_cases_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "gl_suspense_cases_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "gl_suspense_allocations" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "suspense_case_id" INTEGER NOT NULL,
    "journal_id" INTEGER NOT NULL,
    "target_account_code" TEXT NOT NULL,
    "allocated_transaction_amount" REAL NOT NULL,
    "carrying_book_amount" REAL NOT NULL,
    "settled_book_amount" REAL NOT NULL,
    "fx_difference_amount" REAL NOT NULL DEFAULT 0,
    "transaction_currency" TEXT NOT NULL,
    "book_currency" TEXT NOT NULL,
    "fx_rate" REAL NOT NULL DEFAULT 1,
    "note" TEXT,
    "allocated_by_user_id" INTEGER,
    "allocated_at" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "gl_suspense_allocations_suspense_case_id_fkey" FOREIGN KEY ("suspense_case_id") REFERENCES "gl_suspense_cases" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "gl_suspense_allocations_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "gl_journals" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "gl_suspense_allocations_allocated_by_user_id_fkey" FOREIGN KEY ("allocated_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "gl_fx_rates_base_currency_quote_currency_quoted_at_key"
ON "gl_fx_rates"("base_currency", "quote_currency", "quoted_at");
CREATE INDEX "gl_fx_rates_base_currency_quote_currency_quoted_at_idx"
ON "gl_fx_rates"("base_currency", "quote_currency", "quoted_at");

CREATE UNIQUE INDEX "gl_batch_runs_batch_type_effective_date_key"
ON "gl_batch_runs"("batch_type", "effective_date");
CREATE INDEX "gl_batch_runs_status_idx"
ON "gl_batch_runs"("status");
CREATE INDEX "gl_batch_runs_triggered_by_user_id_idx"
ON "gl_batch_runs"("triggered_by_user_id");

CREATE UNIQUE INDEX "gl_period_locks_lock_type_lock_date_key"
ON "gl_period_locks"("lock_type", "lock_date");
CREATE INDEX "gl_period_locks_batch_run_id_idx"
ON "gl_period_locks"("batch_run_id");
CREATE INDEX "gl_period_locks_locked_by_user_id_idx"
ON "gl_period_locks"("locked_by_user_id");
CREATE INDEX "gl_period_locks_lock_date_idx"
ON "gl_period_locks"("lock_date");

CREATE UNIQUE INDEX "gl_balance_snapshots_snapshot_date_account_id_branch_id_currency_key"
ON "gl_balance_snapshots"("snapshot_date", "account_id", "branch_id", "currency");
CREATE INDEX "gl_balance_snapshots_batch_run_id_idx"
ON "gl_balance_snapshots"("batch_run_id");
CREATE INDEX "gl_balance_snapshots_snapshot_date_idx"
ON "gl_balance_snapshots"("snapshot_date");
CREATE INDEX "gl_balance_snapshots_account_id_idx"
ON "gl_balance_snapshots"("account_id");
CREATE INDEX "gl_balance_snapshots_branch_id_idx"
ON "gl_balance_snapshots"("branch_id");

CREATE INDEX "gl_trial_balance_snapshots_batch_run_id_idx"
ON "gl_trial_balance_snapshots"("batch_run_id");
CREATE INDEX "gl_trial_balance_snapshots_snapshot_date_idx"
ON "gl_trial_balance_snapshots"("snapshot_date");
CREATE INDEX "gl_trial_balance_snapshots_branch_id_idx"
ON "gl_trial_balance_snapshots"("branch_id");

CREATE UNIQUE INDEX "gl_coa_versions_version_code_key"
ON "gl_coa_versions"("version_code");
CREATE INDEX "gl_coa_versions_status_idx"
ON "gl_coa_versions"("status");
CREATE INDEX "gl_coa_versions_parent_version_id_idx"
ON "gl_coa_versions"("parent_version_id");
CREATE INDEX "gl_coa_versions_created_by_user_id_idx"
ON "gl_coa_versions"("created_by_user_id");

CREATE UNIQUE INDEX "gl_coa_accounts_coa_version_id_code_key"
ON "gl_coa_accounts"("coa_version_id", "code");
CREATE INDEX "gl_coa_accounts_coa_version_id_idx"
ON "gl_coa_accounts"("coa_version_id");
CREATE INDEX "gl_coa_accounts_base_account_id_idx"
ON "gl_coa_accounts"("base_account_id");

CREATE INDEX "gl_suspense_cases_status_idx"
ON "gl_suspense_cases"("status");
CREATE INDEX "gl_suspense_cases_branch_id_idx"
ON "gl_suspense_cases"("branch_id");
CREATE INDEX "gl_suspense_cases_client_id_idx"
ON "gl_suspense_cases"("client_id");
CREATE INDEX "gl_suspense_cases_loan_id_idx"
ON "gl_suspense_cases"("loan_id");
CREATE INDEX "gl_suspense_cases_external_reference_idx"
ON "gl_suspense_cases"("external_reference");

CREATE INDEX "gl_suspense_allocations_suspense_case_id_idx"
ON "gl_suspense_allocations"("suspense_case_id");
CREATE INDEX "gl_suspense_allocations_journal_id_idx"
ON "gl_suspense_allocations"("journal_id");
CREATE INDEX "gl_suspense_allocations_allocated_by_user_id_idx"
ON "gl_suspense_allocations"("allocated_by_user_id");

DROP TRIGGER IF EXISTS trg_gl_journals_lock_guard_insert;
CREATE TRIGGER IF NOT EXISTS trg_gl_journals_lock_guard_insert
BEFORE INSERT ON "gl_journals"
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM "gl_period_locks" pl
  WHERE LOWER(TRIM(COALESCE(pl."status", ''))) = 'locked'
    AND LOWER(TRIM(COALESCE(pl."lock_type", ''))) = 'eod'
    AND date(pl."lock_date") = date(COALESCE(NEW."posted_at", datetime('now')))
)
BEGIN
  SELECT RAISE(ABORT, 'GL period is locked for posting date');
END;

INSERT INTO "gl_accounts" ("code", "name", "account_type", "is_contra", "is_active", "created_at")
SELECT 'SUSPENSE_FUNDS', 'Suspense Funds', 'liability', 0, 1, datetime('now')
WHERE NOT EXISTS (
  SELECT 1
  FROM "gl_accounts"
  WHERE "code" = 'SUSPENSE_FUNDS'
);

INSERT INTO "gl_accounts" ("code", "name", "account_type", "is_contra", "is_active", "created_at")
SELECT 'FX_GAIN_LOSS', 'FX Gain/Loss', 'revenue', 0, 1, datetime('now')
WHERE NOT EXISTS (
  SELECT 1
  FROM "gl_accounts"
  WHERE "code" = 'FX_GAIN_LOSS'
);
