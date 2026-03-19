-- CreateTable
CREATE TABLE "users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "is_active" INTEGER NOT NULL DEFAULT 1,
    "deactivated_at" TEXT,
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TEXT,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "branch_id" INTEGER,
    "primary_region_id" INTEGER,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "users_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "users_primary_region_id_fkey" FOREIGN KEY ("primary_region_id") REFERENCES "regions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "headquarters" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "location" TEXT,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "created_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "regions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "hq_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "is_active" INTEGER NOT NULL DEFAULT 1,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "regions_hq_id_fkey" FOREIGN KEY ("hq_id") REFERENCES "headquarters" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "branches" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "location_address" TEXT NOT NULL,
    "county" TEXT NOT NULL,
    "town" TEXT NOT NULL,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "region_id" INTEGER NOT NULL,
    "is_active" INTEGER NOT NULL DEFAULT 1,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    CONSTRAINT "branches_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "area_manager_branch_assignments" (
    "user_id" INTEGER NOT NULL,
    "branch_id" INTEGER NOT NULL,
    "created_at" TEXT NOT NULL,

    PRIMARY KEY ("user_id", "branch_id"),
    CONSTRAINT "area_manager_branch_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "area_manager_branch_assignments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "hierarchy_events" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "event_type" TEXT NOT NULL,
    "scope_level" TEXT NOT NULL,
    "region_id" INTEGER,
    "branch_id" INTEGER,
    "actor_user_id" INTEGER,
    "details" TEXT,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "hierarchy_events_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "hierarchy_events_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "hierarchy_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "clients" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "national_id" TEXT,
    "is_active" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TEXT,
    "branch_id" INTEGER,
    "created_by_user_id" INTEGER,
    "kra_pin" TEXT,
    "photo_url" TEXT,
    "id_document_url" TEXT,
    "kyc_status" TEXT NOT NULL DEFAULT 'pending',
    "next_of_kin_name" TEXT,
    "next_of_kin_phone" TEXT,
    "next_of_kin_relation" TEXT,
    "business_type" TEXT,
    "business_years" INTEGER,
    "business_location" TEXT,
    "residential_address" TEXT,
    "officer_id" INTEGER,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT,
    CONSTRAINT "clients_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "clients_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "clients_officer_id_fkey" FOREIGN KEY ("officer_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "loan_products" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "interest_rate" REAL NOT NULL,
    "registration_fee" REAL NOT NULL DEFAULT 0,
    "processing_fee" REAL NOT NULL DEFAULT 0,
    "penalty_rate_daily" REAL NOT NULL DEFAULT 0,
    "penalty_flat_amount" REAL NOT NULL DEFAULT 0,
    "penalty_grace_days" INTEGER NOT NULL DEFAULT 0,
    "penalty_cap_amount" REAL,
    "min_term_weeks" INTEGER NOT NULL,
    "max_term_weeks" INTEGER NOT NULL,
    "is_active" INTEGER NOT NULL DEFAULT 1,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT
);

-- CreateTable
CREATE TABLE "loans" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "client_id" INTEGER NOT NULL,
    "product_id" INTEGER,
    "branch_id" INTEGER,
    "created_by_user_id" INTEGER,
    "principal" REAL NOT NULL,
    "interest_rate" REAL NOT NULL,
    "term_months" INTEGER NOT NULL,
    "term_weeks" INTEGER,
    "registration_fee" REAL NOT NULL DEFAULT 0,
    "processing_fee" REAL NOT NULL DEFAULT 0,
    "created_at" TEXT NOT NULL,
    "disbursed_at" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending_approval',
    "officer_id" INTEGER,
    "disbursed_by_user_id" INTEGER,
    "disbursement_note" TEXT,
    "approved_by_user_id" INTEGER,
    "approved_at" TEXT,
    "rejected_by_user_id" INTEGER,
    "rejected_at" TEXT,
    "rejection_reason" TEXT,
    "archived_at" TEXT,
    "expected_total" REAL NOT NULL,
    "repaid_total" REAL NOT NULL DEFAULT 0,
    "balance" REAL NOT NULL,
    "external_reference" TEXT,
    CONSTRAINT "loans_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "loans_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "loan_products" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "loans_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "loans_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "loans_officer_id_fkey" FOREIGN KEY ("officer_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "loans_disbursed_by_user_id_fkey" FOREIGN KEY ("disbursed_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "loans_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "loans_rejected_by_user_id_fkey" FOREIGN KEY ("rejected_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "repayments" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "loan_id" INTEGER NOT NULL,
    "recorded_by_user_id" INTEGER,
    "amount" REAL NOT NULL,
    "paid_at" TEXT NOT NULL,
    "note" TEXT,
    "payment_channel" TEXT NOT NULL DEFAULT 'manual',
    "payment_provider" TEXT,
    "external_receipt" TEXT,
    "external_reference" TEXT,
    "payer_phone" TEXT,
    CONSTRAINT "repayments_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "repayments_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "mobile_money_c2b_events" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "provider" TEXT NOT NULL,
    "external_receipt" TEXT NOT NULL,
    "account_reference" TEXT NOT NULL,
    "payer_phone" TEXT,
    "amount" REAL NOT NULL,
    "paid_at" TEXT NOT NULL,
    "payload_json" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "loan_id" INTEGER,
    "repayment_id" INTEGER,
    "reconciliation_note" TEXT,
    "reconciled_at" TEXT,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "mobile_money_c2b_events_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "mobile_money_c2b_events_repayment_id_fkey" FOREIGN KEY ("repayment_id") REFERENCES "repayments" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "mobile_money_b2c_disbursements" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "request_id" TEXT NOT NULL,
    "loan_id" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "phone_number" TEXT NOT NULL,
    "account_reference" TEXT NOT NULL,
    "narration" TEXT,
    "initiated_by_user_id" INTEGER,
    "provider_request_id" TEXT,
    "provider_response_json" TEXT,
    "status" TEXT NOT NULL,
    "failure_reason" TEXT,
    "reversal_attempts" INTEGER NOT NULL DEFAULT 0,
    "reversal_last_requested_at" TEXT,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    CONSTRAINT "mobile_money_b2c_disbursements_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "mobile_money_b2c_disbursements_initiated_by_user_id_fkey" FOREIGN KEY ("initiated_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "loan_installments" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "loan_id" INTEGER NOT NULL,
    "installment_number" INTEGER NOT NULL,
    "due_date" TEXT NOT NULL,
    "amount_due" REAL NOT NULL,
    "amount_paid" REAL NOT NULL DEFAULT 0,
    "penalty_amount_accrued" REAL NOT NULL DEFAULT 0,
    "penalty_last_applied_at" TEXT,
    "penalty_rate_daily" REAL,
    "penalty_flat_amount" REAL,
    "penalty_grace_days" INTEGER,
    "penalty_cap_amount" REAL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paid_at" TEXT,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "loan_installments_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "collection_actions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "loan_id" INTEGER NOT NULL,
    "branch_id" INTEGER,
    "installment_id" INTEGER,
    "action_type" TEXT NOT NULL,
    "action_note" TEXT,
    "promise_date" TEXT,
    "next_follow_up_date" TEXT,
    "action_status" TEXT NOT NULL DEFAULT 'open',
    "created_by_user_id" INTEGER,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "collection_actions_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "collection_actions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "collection_actions_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "loan_installments" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "collection_actions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "loan_id" INTEGER,
    "client_id" INTEGER,
    "branch_id" INTEGER,
    "tx_type" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "occurred_at" TEXT NOT NULL,
    "note" TEXT,
    CONSTRAINT "transactions_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "transactions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "transactions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "request_type" TEXT NOT NULL,
    "target_type" TEXT NOT NULL DEFAULT 'loan',
    "target_id" INTEGER NOT NULL,
    "loan_id" INTEGER NOT NULL,
    "branch_id" INTEGER,
    "requested_by_user_id" INTEGER NOT NULL,
    "checker_user_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "request_payload" TEXT NOT NULL,
    "request_note" TEXT,
    "review_note" TEXT,
    "requested_at" TEXT NOT NULL,
    "reviewed_at" TEXT,
    "approved_at" TEXT,
    "rejected_at" TEXT,
    "executed_at" TEXT,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    CONSTRAINT "approval_requests_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "approval_requests_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "approval_requests_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "approval_requests_checker_user_id_fkey" FOREIGN KEY ("checker_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "gl_accounts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "account_type" TEXT NOT NULL,
    "is_contra" INTEGER NOT NULL DEFAULT 0,
    "is_active" INTEGER NOT NULL DEFAULT 1,
    "created_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "gl_journals" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "reference_type" TEXT NOT NULL,
    "reference_id" INTEGER,
    "loan_id" INTEGER,
    "client_id" INTEGER,
    "branch_id" INTEGER,
    "description" TEXT NOT NULL,
    "note" TEXT,
    "posted_by_user_id" INTEGER,
    "total_debit" REAL NOT NULL,
    "total_credit" REAL NOT NULL,
    "posted_at" TEXT NOT NULL,
    CONSTRAINT "gl_journals_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "gl_journals_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "gl_journals_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "gl_journals_posted_by_user_id_fkey" FOREIGN KEY ("posted_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "gl_entries" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "journal_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "side" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "memo" TEXT,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "gl_entries_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "gl_journals" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "gl_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "gl_accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "password_resets" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TEXT NOT NULL,
    "used_at" TEXT,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "password_resets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" INTEGER,
    "details" TEXT,
    "ip_address" TEXT,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "guarantors" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "national_id" TEXT,
    "physical_address" TEXT,
    "occupation" TEXT,
    "employer_name" TEXT,
    "monthly_income" REAL NOT NULL DEFAULT 0,
    "is_active" INTEGER NOT NULL DEFAULT 1,
    "branch_id" INTEGER,
    "created_by_user_id" INTEGER,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    CONSTRAINT "guarantors_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "guarantors_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "loan_guarantors" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "loan_id" INTEGER NOT NULL,
    "guarantor_id" INTEGER NOT NULL,
    "guarantee_amount" REAL NOT NULL DEFAULT 0,
    "relationship_to_client" TEXT,
    "liability_type" TEXT NOT NULL DEFAULT 'individual',
    "note" TEXT,
    "created_by_user_id" INTEGER,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "loan_guarantors_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "loan_guarantors_guarantor_id_fkey" FOREIGN KEY ("guarantor_id") REFERENCES "guarantors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "loan_guarantors_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "collateral_assets" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "asset_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "estimated_value" REAL NOT NULL,
    "ownership_type" TEXT NOT NULL DEFAULT 'client',
    "owner_name" TEXT,
    "owner_national_id" TEXT,
    "registration_number" TEXT,
    "logbook_number" TEXT,
    "title_number" TEXT,
    "location_details" TEXT,
    "valuation_date" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "branch_id" INTEGER,
    "created_by_user_id" INTEGER,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    CONSTRAINT "collateral_assets_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "collateral_assets_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "loan_collaterals" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "loan_id" INTEGER NOT NULL,
    "collateral_asset_id" INTEGER NOT NULL,
    "forced_sale_value" REAL,
    "lien_rank" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "created_by_user_id" INTEGER,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "loan_collaterals_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "loan_collaterals_collateral_asset_id_fkey" FOREIGN KEY ("collateral_asset_id") REFERENCES "collateral_assets" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "loan_collaterals_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_branch_id_idx" ON "users"("branch_id");

-- CreateIndex
CREATE INDEX "users_primary_region_id_idx" ON "users"("primary_region_id");

-- CreateIndex
CREATE UNIQUE INDEX "headquarters_code_key" ON "headquarters"("code");

-- CreateIndex
CREATE UNIQUE INDEX "regions_name_key" ON "regions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "regions_code_key" ON "regions"("code");

-- CreateIndex
CREATE INDEX "regions_hq_id_idx" ON "regions"("hq_id");

-- CreateIndex
CREATE UNIQUE INDEX "branches_code_key" ON "branches"("code");

-- CreateIndex
CREATE INDEX "branches_region_id_idx" ON "branches"("region_id");

-- CreateIndex
CREATE INDEX "area_manager_branch_assignments_branch_id_idx" ON "area_manager_branch_assignments"("branch_id");

-- CreateIndex
CREATE INDEX "hierarchy_events_region_id_idx" ON "hierarchy_events"("region_id");

-- CreateIndex
CREATE INDEX "hierarchy_events_branch_id_idx" ON "hierarchy_events"("branch_id");

-- CreateIndex
CREATE INDEX "hierarchy_events_actor_user_id_idx" ON "hierarchy_events"("actor_user_id");

-- CreateIndex
CREATE INDEX "clients_branch_id_idx" ON "clients"("branch_id");

-- CreateIndex
CREATE INDEX "clients_created_by_user_id_idx" ON "clients"("created_by_user_id");

-- CreateIndex
CREATE INDEX "clients_officer_id_idx" ON "clients"("officer_id");

-- CreateIndex
CREATE INDEX "loans_client_id_idx" ON "loans"("client_id");

-- CreateIndex
CREATE INDEX "loans_product_id_idx" ON "loans"("product_id");

-- CreateIndex
CREATE INDEX "loans_branch_id_idx" ON "loans"("branch_id");

-- CreateIndex
CREATE INDEX "loans_created_by_user_id_idx" ON "loans"("created_by_user_id");

-- CreateIndex
CREATE INDEX "loans_officer_id_idx" ON "loans"("officer_id");

-- CreateIndex
CREATE INDEX "loans_disbursed_by_user_id_idx" ON "loans"("disbursed_by_user_id");

-- CreateIndex
CREATE INDEX "loans_approved_by_user_id_idx" ON "loans"("approved_by_user_id");

-- CreateIndex
CREATE INDEX "loans_rejected_by_user_id_idx" ON "loans"("rejected_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "repayments_external_receipt_key" ON "repayments"("external_receipt");

-- CreateIndex
CREATE INDEX "repayments_loan_id_idx" ON "repayments"("loan_id");

-- CreateIndex
CREATE INDEX "repayments_recorded_by_user_id_idx" ON "repayments"("recorded_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "mobile_money_c2b_events_external_receipt_key" ON "mobile_money_c2b_events"("external_receipt");

-- CreateIndex
CREATE INDEX "mobile_money_c2b_events_loan_id_idx" ON "mobile_money_c2b_events"("loan_id");

-- CreateIndex
CREATE INDEX "mobile_money_c2b_events_repayment_id_idx" ON "mobile_money_c2b_events"("repayment_id");

-- CreateIndex
CREATE UNIQUE INDEX "mobile_money_b2c_disbursements_request_id_key" ON "mobile_money_b2c_disbursements"("request_id");

-- CreateIndex
CREATE INDEX "mobile_money_b2c_disbursements_loan_id_idx" ON "mobile_money_b2c_disbursements"("loan_id");

-- CreateIndex
CREATE INDEX "mobile_money_b2c_disbursements_initiated_by_user_id_idx" ON "mobile_money_b2c_disbursements"("initiated_by_user_id");

-- CreateIndex
CREATE INDEX "loan_installments_loan_id_idx" ON "loan_installments"("loan_id");

-- CreateIndex
CREATE INDEX "collection_actions_loan_id_idx" ON "collection_actions"("loan_id");

-- CreateIndex
CREATE INDEX "collection_actions_branch_id_idx" ON "collection_actions"("branch_id");

-- CreateIndex
CREATE INDEX "collection_actions_installment_id_idx" ON "collection_actions"("installment_id");

-- CreateIndex
CREATE INDEX "collection_actions_created_by_user_id_idx" ON "collection_actions"("created_by_user_id");

-- CreateIndex
CREATE INDEX "transactions_loan_id_idx" ON "transactions"("loan_id");

-- CreateIndex
CREATE INDEX "transactions_client_id_idx" ON "transactions"("client_id");

-- CreateIndex
CREATE INDEX "transactions_branch_id_idx" ON "transactions"("branch_id");

-- CreateIndex
CREATE INDEX "approval_requests_loan_id_idx" ON "approval_requests"("loan_id");

-- CreateIndex
CREATE INDEX "approval_requests_branch_id_idx" ON "approval_requests"("branch_id");

-- CreateIndex
CREATE INDEX "approval_requests_requested_by_user_id_idx" ON "approval_requests"("requested_by_user_id");

-- CreateIndex
CREATE INDEX "approval_requests_checker_user_id_idx" ON "approval_requests"("checker_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "gl_accounts_code_key" ON "gl_accounts"("code");

-- CreateIndex
CREATE INDEX "gl_journals_loan_id_idx" ON "gl_journals"("loan_id");

-- CreateIndex
CREATE INDEX "gl_journals_client_id_idx" ON "gl_journals"("client_id");

-- CreateIndex
CREATE INDEX "gl_journals_branch_id_idx" ON "gl_journals"("branch_id");

-- CreateIndex
CREATE INDEX "gl_journals_posted_by_user_id_idx" ON "gl_journals"("posted_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "gl_journals_reference_type_reference_id_key" ON "gl_journals"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "gl_entries_journal_id_idx" ON "gl_entries"("journal_id");

-- CreateIndex
CREATE INDEX "gl_entries_account_id_idx" ON "gl_entries"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_token_hash_key" ON "password_resets"("token_hash");

-- CreateIndex
CREATE INDEX "password_resets_user_id_idx" ON "password_resets"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "guarantors_branch_id_idx" ON "guarantors"("branch_id");

-- CreateIndex
CREATE INDEX "guarantors_created_by_user_id_idx" ON "guarantors"("created_by_user_id");

-- CreateIndex
CREATE INDEX "loan_guarantors_loan_id_idx" ON "loan_guarantors"("loan_id");

-- CreateIndex
CREATE INDEX "loan_guarantors_guarantor_id_idx" ON "loan_guarantors"("guarantor_id");

-- CreateIndex
CREATE INDEX "loan_guarantors_created_by_user_id_idx" ON "loan_guarantors"("created_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "loan_guarantors_loan_id_guarantor_id_key" ON "loan_guarantors"("loan_id", "guarantor_id");

-- CreateIndex
CREATE INDEX "collateral_assets_branch_id_idx" ON "collateral_assets"("branch_id");

-- CreateIndex
CREATE INDEX "collateral_assets_created_by_user_id_idx" ON "collateral_assets"("created_by_user_id");

-- CreateIndex
CREATE INDEX "loan_collaterals_loan_id_idx" ON "loan_collaterals"("loan_id");

-- CreateIndex
CREATE INDEX "loan_collaterals_collateral_asset_id_idx" ON "loan_collaterals"("collateral_asset_id");

-- CreateIndex
CREATE INDEX "loan_collaterals_created_by_user_id_idx" ON "loan_collaterals"("created_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "loan_collaterals_loan_id_collateral_asset_id_key" ON "loan_collaterals"("loan_id", "collateral_asset_id");

