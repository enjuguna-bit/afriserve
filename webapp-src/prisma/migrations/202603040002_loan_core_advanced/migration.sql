ALTER TABLE "loan_products" ADD COLUMN "interest_accrual_method" TEXT NOT NULL DEFAULT 'upfront';
ALTER TABLE "loan_products" ADD COLUMN "penalty_compounding_method" TEXT NOT NULL DEFAULT 'simple';
ALTER TABLE "loan_products" ADD COLUMN "penalty_base_amount" TEXT NOT NULL DEFAULT 'installment_outstanding';
ALTER TABLE "loan_products" ADD COLUMN "penalty_cap_percent_of_outstanding" REAL;

ALTER TABLE "loan_installments" ADD COLUMN "penalty_compounding_method" TEXT;
ALTER TABLE "loan_installments" ADD COLUMN "penalty_base_amount" TEXT;
ALTER TABLE "loan_installments" ADD COLUMN "penalty_cap_percent_of_outstanding" REAL;

CREATE TABLE "loan_disbursement_tranches" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "loan_id" INTEGER NOT NULL,
    "tranche_number" INTEGER NOT NULL,
    "amount" REAL NOT NULL,
    "disbursed_at" TEXT NOT NULL,
    "disbursed_by_user_id" INTEGER,
    "note" TEXT,
    "is_final" INTEGER NOT NULL DEFAULT 0,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "loan_disbursement_tranches_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "loan_disbursement_tranches_disbursed_by_user_id_fkey" FOREIGN KEY ("disbursed_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "loan_interest_profiles" (
    "loan_id" INTEGER NOT NULL PRIMARY KEY,
    "accrual_method" TEXT NOT NULL DEFAULT 'upfront',
    "accrual_basis" TEXT NOT NULL DEFAULT 'flat',
    "accrual_start_at" TEXT,
    "maturity_at" TEXT,
    "total_contractual_interest" REAL NOT NULL DEFAULT 0,
    "accrued_interest" REAL NOT NULL DEFAULT 0,
    "last_accrual_at" TEXT,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    CONSTRAINT "loan_interest_profiles_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "loan_interest_accrual_events" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "loan_id" INTEGER NOT NULL,
    "accrual_date" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "days_accrued" INTEGER NOT NULL DEFAULT 0,
    "balance_snapshot" REAL,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "loan_interest_accrual_events_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "loan_contract_versions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "loan_id" INTEGER NOT NULL,
    "version_number" INTEGER NOT NULL,
    "event_type" TEXT NOT NULL,
    "principal" REAL NOT NULL,
    "interest_rate" REAL NOT NULL,
    "term_weeks" INTEGER NOT NULL,
    "expected_total" REAL NOT NULL,
    "repaid_total" REAL NOT NULL,
    "balance" REAL NOT NULL,
    "snapshot_json" TEXT,
    "note" TEXT,
    "created_by_user_id" INTEGER,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "loan_contract_versions_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "loan_contract_versions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "loan_disbursement_tranches_loan_id_tranche_number_key"
ON "loan_disbursement_tranches"("loan_id", "tranche_number");

CREATE INDEX "loan_disbursement_tranches_loan_id_idx"
ON "loan_disbursement_tranches"("loan_id");

CREATE INDEX "loan_disbursement_tranches_disbursed_by_user_id_idx"
ON "loan_disbursement_tranches"("disbursed_by_user_id");

CREATE UNIQUE INDEX "loan_interest_accrual_events_loan_id_accrual_date_key"
ON "loan_interest_accrual_events"("loan_id", "accrual_date");

CREATE INDEX "loan_interest_accrual_events_loan_id_idx"
ON "loan_interest_accrual_events"("loan_id");

CREATE UNIQUE INDEX "loan_contract_versions_loan_id_version_number_key"
ON "loan_contract_versions"("loan_id", "version_number");

CREATE INDEX "loan_contract_versions_loan_id_idx"
ON "loan_contract_versions"("loan_id");

CREATE INDEX "loan_contract_versions_created_by_user_id_idx"
ON "loan_contract_versions"("created_by_user_id");

DROP TRIGGER IF EXISTS trg_approval_request_type_insert;
DROP TRIGGER IF EXISTS trg_approval_request_type_update;

CREATE TRIGGER IF NOT EXISTS trg_approval_request_type_insert
BEFORE INSERT ON "approval_requests"
FOR EACH ROW
WHEN NEW."request_type" NOT IN ('loan_restructure', 'loan_write_off', 'loan_top_up', 'loan_refinance', 'loan_term_extension')
BEGIN
  SELECT RAISE(ABORT, 'Invalid approval request type');
END;

CREATE TRIGGER IF NOT EXISTS trg_approval_request_type_update
BEFORE UPDATE OF "request_type" ON "approval_requests"
FOR EACH ROW
WHEN NEW."request_type" NOT IN ('loan_restructure', 'loan_write_off', 'loan_top_up', 'loan_refinance', 'loan_term_extension')
BEGIN
  SELECT RAISE(ABORT, 'Invalid approval request type');
END;

INSERT INTO "gl_accounts" ("code", "name", "account_type", "is_contra", "is_active", "created_at")
SELECT 'UNEARNED_INTEREST', 'Unearned Interest', 'liability', 0, 1, datetime('now')
WHERE NOT EXISTS (
  SELECT 1
  FROM "gl_accounts"
  WHERE "code" = 'UNEARNED_INTEREST'
);
