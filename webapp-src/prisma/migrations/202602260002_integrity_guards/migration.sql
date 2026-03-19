-- Domain/status constraints
CREATE TRIGGER IF NOT EXISTS trg_users_role_check_insert
BEFORE INSERT ON "users"
FOR EACH ROW
WHEN NEW."role" NOT IN ('admin', 'ceo', 'finance', 'operations_manager', 'it', 'area_manager', 'loan_officer', 'cashier')
BEGIN
  SELECT RAISE(ABORT, 'Invalid user role');
END;

CREATE TRIGGER IF NOT EXISTS trg_users_role_check_update
BEFORE UPDATE OF "role" ON "users"
FOR EACH ROW
WHEN NEW."role" NOT IN ('admin', 'ceo', 'finance', 'operations_manager', 'it', 'area_manager', 'loan_officer', 'cashier')
BEGIN
  SELECT RAISE(ABORT, 'Invalid user role');
END;

CREATE TRIGGER IF NOT EXISTS trg_hierarchy_events_scope_level_insert
BEFORE INSERT ON "hierarchy_events"
FOR EACH ROW
WHEN NEW."scope_level" NOT IN ('hq', 'region', 'branch')
BEGIN
  SELECT RAISE(ABORT, 'Invalid hierarchy scope level');
END;

CREATE TRIGGER IF NOT EXISTS trg_hierarchy_events_scope_level_update
BEFORE UPDATE OF "scope_level" ON "hierarchy_events"
FOR EACH ROW
WHEN NEW."scope_level" NOT IN ('hq', 'region', 'branch')
BEGIN
  SELECT RAISE(ABORT, 'Invalid hierarchy scope level');
END;

CREATE TRIGGER IF NOT EXISTS trg_clients_kyc_status_insert
BEFORE INSERT ON "clients"
FOR EACH ROW
WHEN NEW."kyc_status" NOT IN ('pending', 'verified', 'rejected')
BEGIN
  SELECT RAISE(ABORT, 'Invalid KYC status');
END;

CREATE TRIGGER IF NOT EXISTS trg_clients_kyc_status_update
BEFORE UPDATE OF "kyc_status" ON "clients"
FOR EACH ROW
WHEN NEW."kyc_status" NOT IN ('pending', 'verified', 'rejected')
BEGIN
  SELECT RAISE(ABORT, 'Invalid KYC status');
END;

CREATE TRIGGER IF NOT EXISTS trg_loan_products_is_active_insert
BEFORE INSERT ON "loan_products"
FOR EACH ROW
WHEN NEW."is_active" NOT IN (0, 1)
BEGIN
  SELECT RAISE(ABORT, 'Invalid loan product active flag');
END;

CREATE TRIGGER IF NOT EXISTS trg_loan_products_is_active_update
BEFORE UPDATE OF "is_active" ON "loan_products"
FOR EACH ROW
WHEN NEW."is_active" NOT IN (0, 1)
BEGIN
  SELECT RAISE(ABORT, 'Invalid loan product active flag');
END;

CREATE TRIGGER IF NOT EXISTS trg_loans_status_insert
BEFORE INSERT ON "loans"
FOR EACH ROW
WHEN NEW."status" NOT IN ('active', 'closed', 'written_off', 'restructured', 'pending_approval', 'approved', 'rejected')
BEGIN
  SELECT RAISE(ABORT, 'Invalid loan status');
END;

CREATE TRIGGER IF NOT EXISTS trg_loans_status_update
BEFORE UPDATE OF "status" ON "loans"
FOR EACH ROW
WHEN NEW."status" NOT IN ('active', 'closed', 'written_off', 'restructured', 'pending_approval', 'approved', 'rejected')
BEGIN
  SELECT RAISE(ABORT, 'Invalid loan status');
END;

CREATE TRIGGER IF NOT EXISTS trg_mobile_money_c2b_status_insert
BEFORE INSERT ON "mobile_money_c2b_events"
FOR EACH ROW
WHEN NEW."status" NOT IN ('received', 'reconciled', 'rejected')
BEGIN
  SELECT RAISE(ABORT, 'Invalid C2B status');
END;

CREATE TRIGGER IF NOT EXISTS trg_mobile_money_c2b_status_update
BEFORE UPDATE OF "status" ON "mobile_money_c2b_events"
FOR EACH ROW
WHEN NEW."status" NOT IN ('received', 'reconciled', 'rejected')
BEGIN
  SELECT RAISE(ABORT, 'Invalid C2B status');
END;

CREATE TRIGGER IF NOT EXISTS trg_mobile_money_b2c_status_insert
BEFORE INSERT ON "mobile_money_b2c_disbursements"
FOR EACH ROW
WHEN NEW."status" NOT IN ('initiated', 'accepted', 'failed', 'core_disbursed', 'core_failed', 'completed')
BEGIN
  SELECT RAISE(ABORT, 'Invalid B2C status');
END;

CREATE TRIGGER IF NOT EXISTS trg_mobile_money_b2c_status_update
BEFORE UPDATE OF "status" ON "mobile_money_b2c_disbursements"
FOR EACH ROW
WHEN NEW."status" NOT IN ('initiated', 'accepted', 'failed', 'core_disbursed', 'core_failed', 'completed')
BEGIN
  SELECT RAISE(ABORT, 'Invalid B2C status');
END;

CREATE TRIGGER IF NOT EXISTS trg_installments_status_insert
BEFORE INSERT ON "loan_installments"
FOR EACH ROW
WHEN NEW."status" NOT IN ('pending', 'paid', 'overdue')
BEGIN
  SELECT RAISE(ABORT, 'Invalid installment status');
END;

CREATE TRIGGER IF NOT EXISTS trg_installments_status_update
BEFORE UPDATE OF "status" ON "loan_installments"
FOR EACH ROW
WHEN NEW."status" NOT IN ('pending', 'paid', 'overdue')
BEGIN
  SELECT RAISE(ABORT, 'Invalid installment status');
END;

CREATE TRIGGER IF NOT EXISTS trg_collection_action_type_insert
BEFORE INSERT ON "collection_actions"
FOR EACH ROW
WHEN NEW."action_type" NOT IN ('contact_attempt', 'promise_to_pay', 'note', 'status_change')
BEGIN
  SELECT RAISE(ABORT, 'Invalid collection action type');
END;

CREATE TRIGGER IF NOT EXISTS trg_collection_action_type_update
BEFORE UPDATE OF "action_type" ON "collection_actions"
FOR EACH ROW
WHEN NEW."action_type" NOT IN ('contact_attempt', 'promise_to_pay', 'note', 'status_change')
BEGIN
  SELECT RAISE(ABORT, 'Invalid collection action type');
END;

CREATE TRIGGER IF NOT EXISTS trg_collection_action_status_insert
BEFORE INSERT ON "collection_actions"
FOR EACH ROW
WHEN NEW."action_status" NOT IN ('open', 'completed', 'cancelled')
BEGIN
  SELECT RAISE(ABORT, 'Invalid collection action status');
END;

CREATE TRIGGER IF NOT EXISTS trg_collection_action_status_update
BEFORE UPDATE OF "action_status" ON "collection_actions"
FOR EACH ROW
WHEN NEW."action_status" NOT IN ('open', 'completed', 'cancelled')
BEGIN
  SELECT RAISE(ABORT, 'Invalid collection action status');
END;

CREATE TRIGGER IF NOT EXISTS trg_approval_request_type_insert
BEFORE INSERT ON "approval_requests"
FOR EACH ROW
WHEN NEW."request_type" NOT IN ('loan_restructure', 'loan_write_off')
BEGIN
  SELECT RAISE(ABORT, 'Invalid approval request type');
END;

CREATE TRIGGER IF NOT EXISTS trg_approval_request_type_update
BEFORE UPDATE OF "request_type" ON "approval_requests"
FOR EACH ROW
WHEN NEW."request_type" NOT IN ('loan_restructure', 'loan_write_off')
BEGIN
  SELECT RAISE(ABORT, 'Invalid approval request type');
END;

CREATE TRIGGER IF NOT EXISTS trg_approval_status_insert
BEFORE INSERT ON "approval_requests"
FOR EACH ROW
WHEN NEW."status" NOT IN ('pending', 'approved', 'rejected', 'cancelled')
BEGIN
  SELECT RAISE(ABORT, 'Invalid approval status');
END;

CREATE TRIGGER IF NOT EXISTS trg_approval_status_update
BEFORE UPDATE OF "status" ON "approval_requests"
FOR EACH ROW
WHEN NEW."status" NOT IN ('pending', 'approved', 'rejected', 'cancelled')
BEGIN
  SELECT RAISE(ABORT, 'Invalid approval status');
END;

CREATE TRIGGER IF NOT EXISTS trg_gl_accounts_type_insert
BEFORE INSERT ON "gl_accounts"
FOR EACH ROW
WHEN NEW."account_type" NOT IN ('asset', 'liability', 'equity', 'revenue', 'expense')
BEGIN
  SELECT RAISE(ABORT, 'Invalid GL account type');
END;

CREATE TRIGGER IF NOT EXISTS trg_gl_accounts_type_update
BEFORE UPDATE OF "account_type" ON "gl_accounts"
FOR EACH ROW
WHEN NEW."account_type" NOT IN ('asset', 'liability', 'equity', 'revenue', 'expense')
BEGIN
  SELECT RAISE(ABORT, 'Invalid GL account type');
END;

CREATE TRIGGER IF NOT EXISTS trg_gl_accounts_flags_insert
BEFORE INSERT ON "gl_accounts"
FOR EACH ROW
WHEN NEW."is_contra" NOT IN (0, 1) OR NEW."is_active" NOT IN (0, 1)
BEGIN
  SELECT RAISE(ABORT, 'Invalid GL account flags');
END;

CREATE TRIGGER IF NOT EXISTS trg_gl_accounts_flags_update
BEFORE UPDATE OF "is_contra", "is_active" ON "gl_accounts"
FOR EACH ROW
WHEN NEW."is_contra" NOT IN (0, 1) OR NEW."is_active" NOT IN (0, 1)
BEGIN
  SELECT RAISE(ABORT, 'Invalid GL account flags');
END;

CREATE TRIGGER IF NOT EXISTS trg_gl_entries_side_insert
BEFORE INSERT ON "gl_entries"
FOR EACH ROW
WHEN NEW."side" NOT IN ('debit', 'credit')
BEGIN
  SELECT RAISE(ABORT, 'Invalid GL entry side');
END;

CREATE TRIGGER IF NOT EXISTS trg_gl_entries_side_update
BEFORE UPDATE OF "side" ON "gl_entries"
FOR EACH ROW
WHEN NEW."side" NOT IN ('debit', 'credit')
BEGIN
  SELECT RAISE(ABORT, 'Invalid GL entry side');
END;

CREATE TRIGGER IF NOT EXISTS trg_guarantors_is_active_insert
BEFORE INSERT ON "guarantors"
FOR EACH ROW
WHEN NEW."is_active" NOT IN (0, 1)
BEGIN
  SELECT RAISE(ABORT, 'Invalid guarantor active flag');
END;

CREATE TRIGGER IF NOT EXISTS trg_guarantors_is_active_update
BEFORE UPDATE OF "is_active" ON "guarantors"
FOR EACH ROW
WHEN NEW."is_active" NOT IN (0, 1)
BEGIN
  SELECT RAISE(ABORT, 'Invalid guarantor active flag');
END;

CREATE TRIGGER IF NOT EXISTS trg_loan_guarantors_liability_insert
BEFORE INSERT ON "loan_guarantors"
FOR EACH ROW
WHEN NEW."liability_type" NOT IN ('individual', 'joint')
BEGIN
  SELECT RAISE(ABORT, 'Invalid liability type');
END;

CREATE TRIGGER IF NOT EXISTS trg_loan_guarantors_liability_update
BEFORE UPDATE OF "liability_type" ON "loan_guarantors"
FOR EACH ROW
WHEN NEW."liability_type" NOT IN ('individual', 'joint')
BEGIN
  SELECT RAISE(ABORT, 'Invalid liability type');
END;

CREATE TRIGGER IF NOT EXISTS trg_collateral_assets_asset_type_insert
BEFORE INSERT ON "collateral_assets"
FOR EACH ROW
WHEN NEW."asset_type" NOT IN ('chattel', 'vehicle', 'land')
BEGIN
  SELECT RAISE(ABORT, 'Invalid collateral asset type');
END;

CREATE TRIGGER IF NOT EXISTS trg_collateral_assets_asset_type_update
BEFORE UPDATE OF "asset_type" ON "collateral_assets"
FOR EACH ROW
WHEN NEW."asset_type" NOT IN ('chattel', 'vehicle', 'land')
BEGIN
  SELECT RAISE(ABORT, 'Invalid collateral asset type');
END;

CREATE TRIGGER IF NOT EXISTS trg_collateral_assets_ownership_type_insert
BEFORE INSERT ON "collateral_assets"
FOR EACH ROW
WHEN NEW."ownership_type" NOT IN ('client', 'third_party')
BEGIN
  SELECT RAISE(ABORT, 'Invalid ownership type');
END;

CREATE TRIGGER IF NOT EXISTS trg_collateral_assets_ownership_type_update
BEFORE UPDATE OF "ownership_type" ON "collateral_assets"
FOR EACH ROW
WHEN NEW."ownership_type" NOT IN ('client', 'third_party')
BEGIN
  SELECT RAISE(ABORT, 'Invalid ownership type');
END;

CREATE TRIGGER IF NOT EXISTS trg_collateral_assets_status_insert
BEFORE INSERT ON "collateral_assets"
FOR EACH ROW
WHEN NEW."status" NOT IN ('active', 'released', 'liquidated')
BEGIN
  SELECT RAISE(ABORT, 'Invalid collateral status');
END;

CREATE TRIGGER IF NOT EXISTS trg_collateral_assets_status_update
BEFORE UPDATE OF "status" ON "collateral_assets"
FOR EACH ROW
WHEN NEW."status" NOT IN ('active', 'released', 'liquidated')
BEGIN
  SELECT RAISE(ABORT, 'Invalid collateral status');
END;

-- Numeric guards
CREATE TRIGGER IF NOT EXISTS trg_loans_financial_guard_insert
BEFORE INSERT ON "loans"
FOR EACH ROW
WHEN NEW."expected_total" < 0
  OR NEW."repaid_total" < 0
  OR NEW."balance" < 0
  OR NEW."repaid_total" > NEW."expected_total"
BEGIN
  SELECT RAISE(ABORT, 'Invalid loan financial totals');
END;

CREATE TRIGGER IF NOT EXISTS trg_loans_financial_guard_update
BEFORE UPDATE OF "expected_total", "repaid_total", "balance" ON "loans"
FOR EACH ROW
WHEN NEW."expected_total" < 0
  OR NEW."repaid_total" < 0
  OR NEW."balance" < 0
  OR NEW."repaid_total" > NEW."expected_total"
BEGIN
  SELECT RAISE(ABORT, 'Invalid loan financial totals');
END;

CREATE TRIGGER IF NOT EXISTS trg_installments_financial_guard_insert
BEFORE INSERT ON "loan_installments"
FOR EACH ROW
WHEN NEW."amount_due" <= 0
  OR NEW."amount_paid" < 0
  OR NEW."amount_paid" > NEW."amount_due"
BEGIN
  SELECT RAISE(ABORT, 'Invalid installment amounts');
END;

CREATE TRIGGER IF NOT EXISTS trg_installments_financial_guard_update
BEFORE UPDATE OF "amount_due", "amount_paid" ON "loan_installments"
FOR EACH ROW
WHEN NEW."amount_due" <= 0
  OR NEW."amount_paid" < 0
  OR NEW."amount_paid" > NEW."amount_due"
BEGIN
  SELECT RAISE(ABORT, 'Invalid installment amounts');
END;

CREATE TRIGGER IF NOT EXISTS trg_repayment_amount_guard_insert
BEFORE INSERT ON "repayments"
FOR EACH ROW
WHEN NEW."amount" <= 0
BEGIN
  SELECT RAISE(ABORT, 'Repayment amount must be positive');
END;

CREATE TRIGGER IF NOT EXISTS trg_loan_guarantors_amount_guard_insert
BEFORE INSERT ON "loan_guarantors"
FOR EACH ROW
WHEN NEW."guarantee_amount" < 0
BEGIN
  SELECT RAISE(ABORT, 'Guarantee amount cannot be negative');
END;

CREATE TRIGGER IF NOT EXISTS trg_loan_guarantors_amount_guard_update
BEFORE UPDATE OF "guarantee_amount" ON "loan_guarantors"
FOR EACH ROW
WHEN NEW."guarantee_amount" < 0
BEGIN
  SELECT RAISE(ABORT, 'Guarantee amount cannot be negative');
END;

CREATE TRIGGER IF NOT EXISTS trg_collateral_assets_value_guard_insert
BEFORE INSERT ON "collateral_assets"
FOR EACH ROW
WHEN NEW."estimated_value" <= 0
BEGIN
  SELECT RAISE(ABORT, 'Collateral estimated value must be positive');
END;

CREATE TRIGGER IF NOT EXISTS trg_collateral_assets_value_guard_update
BEFORE UPDATE OF "estimated_value" ON "collateral_assets"
FOR EACH ROW
WHEN NEW."estimated_value" <= 0
BEGIN
  SELECT RAISE(ABORT, 'Collateral estimated value must be positive');
END;

CREATE TRIGGER IF NOT EXISTS trg_loan_collaterals_value_guard_insert
BEFORE INSERT ON "loan_collaterals"
FOR EACH ROW
WHEN NEW."forced_sale_value" IS NOT NULL AND NEW."forced_sale_value" <= 0
BEGIN
  SELECT RAISE(ABORT, 'Forced sale value must be positive');
END;

CREATE TRIGGER IF NOT EXISTS trg_loan_collaterals_lien_rank_guard_insert
BEFORE INSERT ON "loan_collaterals"
FOR EACH ROW
WHEN NEW."lien_rank" < 1
BEGIN
  SELECT RAISE(ABORT, 'Lien rank must be at least 1');
END;

CREATE TRIGGER IF NOT EXISTS trg_gl_journals_balance_guard_insert
BEFORE INSERT ON "gl_journals"
FOR EACH ROW
WHEN NEW."total_debit" <= 0
  OR NEW."total_credit" <= 0
  OR ABS(NEW."total_debit" - NEW."total_credit") > 0.005
BEGIN
  SELECT RAISE(ABORT, 'Invalid or unbalanced GL journal');
END;

CREATE TRIGGER IF NOT EXISTS trg_gl_entries_amount_guard_insert
BEFORE INSERT ON "gl_entries"
FOR EACH ROW
WHEN NEW."amount" <= 0
BEGIN
  SELECT RAISE(ABORT, 'GL entry amount must be positive');
END;

-- Append-only/immutability guards
CREATE TRIGGER IF NOT EXISTS trg_gl_journals_immutable_update
BEFORE UPDATE ON "gl_journals"
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'gl_journals table is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_gl_journals_immutable_delete
BEFORE DELETE ON "gl_journals"
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'gl_journals table is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_gl_entries_immutable_update
BEFORE UPDATE ON "gl_entries"
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'gl_entries table is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_gl_entries_immutable_delete
BEFORE DELETE ON "gl_entries"
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'gl_entries table is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_logs_immutable_update
BEFORE UPDATE ON "audit_logs"
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'audit_logs table is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_logs_immutable_delete
BEFORE DELETE ON "audit_logs"
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'audit_logs table is append-only');
END;

-- Non-Prisma indexes (partial/expression)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_normalized_unique
ON "users"(LOWER("email"));

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_national_id_normalized_unique
ON "clients"(LOWER(TRIM("national_id")))
WHERE "national_id" IS NOT NULL AND TRIM("national_id") != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_repayments_external_receipt_unique
ON "repayments"("external_receipt")
WHERE "external_receipt" IS NOT NULL AND TRIM("external_receipt") != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_requests_pending_unique
ON "approval_requests"("request_type", "target_type", "target_id")
WHERE "status" = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_guarantors_national_id_unique
ON "guarantors"(LOWER(TRIM("national_id")))
WHERE "national_id" IS NOT NULL AND TRIM("national_id") != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_collateral_assets_registration_unique
ON "collateral_assets"(LOWER(TRIM("registration_number")))
WHERE "registration_number" IS NOT NULL AND TRIM("registration_number") != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_collateral_assets_logbook_unique
ON "collateral_assets"(LOWER(TRIM("logbook_number")))
WHERE "logbook_number" IS NOT NULL AND TRIM("logbook_number") != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_collateral_assets_title_unique
ON "collateral_assets"(LOWER(TRIM("title_number")))
WHERE "title_number" IS NOT NULL AND TRIM("title_number") != '';
