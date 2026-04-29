-- Migration: 20260401000001_tenant_id_mobile_money_rls
--
-- SQLite-compatible: adds tenant_id columns to the four tables that were
-- already being written with tenant_id in application code but lacked the
-- physical column in the SQLite schema definition.
--
-- NOTE: Postgres-specific policies (row-level security, tenant isolation) for
-- these tables are handled in the Postgres migration chain at
-- prisma/postgres/migrations/202603300002_tenant_id_missing_tables.
-- This file is intentionally SQLite-only (ALTER TABLE / CREATE INDEX).
-- ---------------------------------------------------------------------------

-- 1. mobile_money_c2b_events
ALTER TABLE mobile_money_c2b_events ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_c2b_events_tenant_id
  ON mobile_money_c2b_events(tenant_id);

-- 2. mobile_money_b2c_disbursements
ALTER TABLE mobile_money_b2c_disbursements ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_b2c_disbursements_tenant_id
  ON mobile_money_b2c_disbursements(tenant_id);

-- 3. repayment_idempotency_keys
ALTER TABLE repayment_idempotency_keys ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_repayment_idempotency_tenant_id
  ON repayment_idempotency_keys(tenant_id);

-- 4. loan_overpayment_credits
ALTER TABLE loan_overpayment_credits ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_loan_overpayment_credits_tenant_id
  ON loan_overpayment_credits(tenant_id);
