CREATE TABLE "loan_underwriting_assessments" (
    "loan_id" INTEGER NOT NULL PRIMARY KEY,
    "client_id" INTEGER NOT NULL,
    "branch_id" INTEGER,
    "principal" REAL NOT NULL DEFAULT 0,
    "expected_total" REAL NOT NULL DEFAULT 0,
    "balance" REAL NOT NULL DEFAULT 0,
    "term_weeks" INTEGER NOT NULL DEFAULT 0,
    "guarantor_count" INTEGER NOT NULL DEFAULT 0,
    "collateral_count" INTEGER NOT NULL DEFAULT 0,
    "support_income_total" REAL NOT NULL DEFAULT 0,
    "estimated_weekly_installment" REAL NOT NULL DEFAULT 0,
    "estimated_monthly_installment" REAL NOT NULL DEFAULT 0,
    "repayment_to_support_income_ratio" REAL,
    "collateral_value_total" REAL NOT NULL DEFAULT 0,
    "collateral_coverage_ratio" REAL,
    "guarantee_amount_total" REAL NOT NULL DEFAULT 0,
    "guarantee_coverage_ratio" REAL,
    "business_years" INTEGER,
    "kyc_status" TEXT NOT NULL DEFAULT 'pending',
    "risk_band" TEXT NOT NULL DEFAULT 'medium',
    "policy_decision" TEXT NOT NULL DEFAULT 'manual_review',
    "flags_json" TEXT,
    "assessment_json" TEXT,
    "override_decision" TEXT,
    "override_reason" TEXT,
    "assessed_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    CONSTRAINT "loan_underwriting_assessments_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "loan_underwriting_assessments_client_id_idx"
ON "loan_underwriting_assessments"("client_id");

CREATE INDEX "loan_underwriting_assessments_branch_id_idx"
ON "loan_underwriting_assessments"("branch_id");