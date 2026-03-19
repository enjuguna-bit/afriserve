CREATE INDEX IF NOT EXISTS "idx_users_role_active"
ON "users"("role", "is_active");

CREATE INDEX IF NOT EXISTS "idx_clients_kyc_status"
ON "clients"("kyc_status");

CREATE INDEX IF NOT EXISTS "idx_clients_onboarding_status"
ON "clients"("onboarding_status");

CREATE INDEX IF NOT EXISTS "idx_clients_fee_payment_status"
ON "clients"("fee_payment_status");

CREATE INDEX IF NOT EXISTS "idx_clients_branch_created_at"
ON "clients"("branch_id", "created_at");

CREATE INDEX IF NOT EXISTS "idx_loans_status"
ON "loans"("status");

CREATE INDEX IF NOT EXISTS "idx_loans_created_at"
ON "loans"("created_at");

CREATE INDEX IF NOT EXISTS "idx_loans_branch_status"
ON "loans"("branch_id", "status");

CREATE INDEX IF NOT EXISTS "idx_loans_branch_disbursed_at"
ON "loans"("branch_id", "disbursed_at");

CREATE INDEX IF NOT EXISTS "idx_loans_created_by_disbursed_at"
ON "loans"("created_by_user_id", "disbursed_at");

CREATE INDEX IF NOT EXISTS "idx_repayments_paid_at"
ON "repayments"("paid_at");

CREATE INDEX IF NOT EXISTS "idx_repayments_loan_paid_at"
ON "repayments"("loan_id", "paid_at");

CREATE INDEX IF NOT EXISTS "idx_repayments_recorded_by_paid_at"
ON "repayments"("recorded_by_user_id", "paid_at");

CREATE INDEX IF NOT EXISTS "idx_installments_loan_status_due_date"
ON "loan_installments"("loan_id", "status", "due_date");

CREATE INDEX IF NOT EXISTS "idx_installments_due_status_loan_id"
ON "loan_installments"("due_date", "status", "loan_id");