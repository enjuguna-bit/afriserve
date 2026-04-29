-- 202603250001_rls_tenant_parity/migration.sql

-- 1. Add tenant_id TEXT NOT NULL DEFAULT 'default' to repayment_idempotency_keys and loan_overpayment_credits
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'repayment_idempotency_keys' AND column_name = 'tenant_id') THEN
        ALTER TABLE "repayment_idempotency_keys" ADD COLUMN "tenant_id" TEXT NOT NULL DEFAULT 'default';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'loan_overpayment_credits' AND column_name = 'tenant_id') THEN
        ALTER TABLE "loan_overpayment_credits" ADD COLUMN "tenant_id" TEXT NOT NULL DEFAULT 'default';
    END IF;
END $$;

-- 2. CREATE TABLE IF NOT EXISTS re-declarations of core tables (users, loans, clients, repayments) using valid Postgres DDL
CREATE TABLE IF NOT EXISTS "users" (
    "id" BIGSERIAL PRIMARY KEY,
    "tenant_id" TEXT NOT NULL DEFAULT 'default',
    "email" TEXT UNIQUE,
    "password_hash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "clients" (
    "id" BIGSERIAL PRIMARY KEY,
    "tenant_id" TEXT NOT NULL DEFAULT 'default',
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "loans" (
    "id" BIGSERIAL PRIMARY KEY,
    "tenant_id" TEXT NOT NULL DEFAULT 'default',
    "client_id" BIGINT,
    "branch_id" BIGINT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "principal" NUMERIC,
    "balance" NUMERIC,
    "repaid_total" NUMERIC,
    "external_reference" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "repayments" (
    "id" BIGSERIAL PRIMARY KEY,
    "tenant_id" TEXT NOT NULL DEFAULT 'default',
    "loan_id" BIGINT,
    "amount" NUMERIC,
    "applied_amount" NUMERIC,
    "penalty_amount" NUMERIC,
    "interest_amount" NUMERIC,
    "principal_amount" NUMERIC,
    "overpayment_amount" NUMERIC,
    "note" TEXT,
    "recorded_by_user_id" BIGINT,
    "payment_channel" TEXT,
    "payment_provider" TEXT,
    "external_receipt" TEXT,
    "external_reference" TEXT,
    "payer_phone" TEXT,
    "paid_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Extend the RLS policy to cover specified tables
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_policy" ON "audit_logs";
CREATE POLICY "tenant_isolation_policy" ON "audit_logs" USING ("tenant_id" = current_setting('app.tenant_id', true));

ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_policy" ON "transactions";
CREATE POLICY "tenant_isolation_policy" ON "transactions" USING ("tenant_id" = current_setting('app.tenant_id', true));

ALTER TABLE "loan_installments" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_policy" ON "loan_installments";
CREATE POLICY "tenant_isolation_policy" ON "loan_installments" USING ("tenant_id" = current_setting('app.tenant_id', true));

ALTER TABLE "repayment_idempotency_keys" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_policy" ON "repayment_idempotency_keys";
CREATE POLICY "tenant_isolation_policy" ON "repayment_idempotency_keys" USING ("tenant_id" = current_setting('app.tenant_id', true));

ALTER TABLE "loan_overpayment_credits" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_policy" ON "loan_overpayment_credits";
CREATE POLICY "tenant_isolation_policy" ON "loan_overpayment_credits" USING ("tenant_id" = current_setting('app.tenant_id', true));

ALTER TABLE "mobile_money_c2b_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_policy" ON "mobile_money_c2b_events";
CREATE POLICY "tenant_isolation_policy" ON "mobile_money_c2b_events" USING ("tenant_id" = current_setting('app.tenant_id', true));

ALTER TABLE "mobile_money_b2c_disbursements" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_policy" ON "mobile_money_b2c_disbursements";
CREATE POLICY "tenant_isolation_policy" ON "mobile_money_b2c_disbursements" USING ("tenant_id" = current_setting('app.tenant_id', true));

ALTER TABLE "domain_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_policy" ON "domain_events";
CREATE POLICY "tenant_isolation_policy" ON "domain_events" USING ("tenant_id" = current_setting('app.tenant_id', true));
