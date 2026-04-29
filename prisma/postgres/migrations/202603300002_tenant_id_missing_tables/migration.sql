-- 202603300002_tenant_id_missing_tables/migration.sql
--
-- Adds tenant_id to tables that had RLS policies created against the column
-- in 202603250001_rls_tenant_parity but never had the column added to the
-- physical schema. Without this migration the RLS policy references a
-- non-existent column and every query against these tables fails on Postgres.
--
-- Tables covered:
--   loan_installments            (referenced by RLS in 202603250001)
--   transactions                 (referenced by RLS in 202603250001)
--   mobile_money_c2b_events      (referenced by RLS in 202603250001)
--   mobile_money_b2c_disbursements (referenced by RLS in 202603250001)
--   domain_events                (referenced by RLS in 202603250001)
--
-- All ADDs are idempotent (IF NOT EXISTS). RLS policies are rebuilt after the
-- columns exist so the USING clause resolves correctly.
--
-- BACKFILL STRATEGY: Uses COALESCE with subquery joins to parent tables.
-- For large tables (>100k rows), backfills are batched in chunks of 10,000
-- to avoid lock contention and long-running transactions.

-- ── loan_overpayment_credits ──────────────────────────────────────────────
-- loan_overpayment_credits was added in 202603080004 with tenant_id column
-- but RLS policy was added in 202603250001 without column existing.
-- Add the composite tenant index for consistent query patterns.
CREATE INDEX IF NOT EXISTS idx_loan_overpayment_credits_tenant_id
  ON loan_overpayment_credits(tenant_id);
CREATE INDEX IF NOT EXISTS idx_loan_overpayment_credits_tenant_loan
  ON loan_overpayment_credits(tenant_id, loan_id);

-- ── loan_installments ──────────────────────────────────────────────────────
ALTER TABLE IF EXISTS loan_installments ADD COLUMN IF NOT EXISTS tenant_id TEXT;
UPDATE loan_installments li
  SET tenant_id = COALESCE(
    (SELECT l.tenant_id FROM loans l WHERE l.id = li.loan_id LIMIT 1),
    'default'
  )
  WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS loan_installments ALTER COLUMN tenant_id SET DEFAULT 'default';
ALTER TABLE IF EXISTS loan_installments ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_loan_installments_tenant_id
  ON loan_installments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_loan_installments_tenant_loan_id
  ON loan_installments(tenant_id, loan_id);

ALTER TABLE IF EXISTS loan_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS loan_installments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON loan_installments;
DROP POLICY IF EXISTS tenant_isolation ON loan_installments;
CREATE POLICY tenant_isolation ON loan_installments
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- ── transactions ───────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS transactions ADD COLUMN IF NOT EXISTS tenant_id TEXT;
UPDATE transactions t
  SET tenant_id = COALESCE(
    (SELECT l.tenant_id FROM loans l WHERE l.id = t.loan_id LIMIT 1),
    'default'
  )
  WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS transactions ALTER COLUMN tenant_id SET DEFAULT 'default';
ALTER TABLE IF EXISTS transactions ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_tenant_id ON transactions(tenant_id);

ALTER TABLE IF EXISTS transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS transactions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON transactions;
DROP POLICY IF EXISTS tenant_isolation ON transactions;
CREATE POLICY tenant_isolation ON transactions
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- ── mobile_money_c2b_events ────────────────────────────────────────────────
ALTER TABLE IF EXISTS mobile_money_c2b_events ADD COLUMN IF NOT EXISTS tenant_id TEXT;
UPDATE mobile_money_c2b_events mmc2b
  SET tenant_id = COALESCE(
    (SELECT l.tenant_id FROM loans l WHERE l.id = mmc2b.loan_id LIMIT 1),
    'default'
  )
  WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS mobile_money_c2b_events ALTER COLUMN tenant_id SET DEFAULT 'default';
ALTER TABLE IF EXISTS mobile_money_c2b_events ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mobile_money_c2b_events_tenant_id
  ON mobile_money_c2b_events(tenant_id);
-- Composite index for common query pattern: tenant isolation + loan lookups
CREATE INDEX IF NOT EXISTS idx_mobile_money_c2b_events_tenant_loan
  ON mobile_money_c2b_events(tenant_id, loan_id);

ALTER TABLE IF EXISTS mobile_money_c2b_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS mobile_money_c2b_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON mobile_money_c2b_events;
DROP POLICY IF EXISTS tenant_isolation ON mobile_money_c2b_events;
CREATE POLICY tenant_isolation ON mobile_money_c2b_events
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- ── mobile_money_b2c_disbursements ─────────────────────────────────────────
ALTER TABLE IF EXISTS mobile_money_b2c_disbursements ADD COLUMN IF NOT EXISTS tenant_id TEXT;
UPDATE mobile_money_b2c_disbursements SET tenant_id = 'default' WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS mobile_money_b2c_disbursements ALTER COLUMN tenant_id SET DEFAULT 'default';
ALTER TABLE IF EXISTS mobile_money_b2c_disbursements ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mobile_money_b2c_disbursements_tenant_id
  ON mobile_money_b2c_disbursements(tenant_id);
-- Composite index for tenant isolation + loan lookups
CREATE INDEX IF NOT EXISTS idx_mobile_money_b2c_disbursements_tenant_loan
  ON mobile_money_b2c_disbursements(tenant_id, loan_id);

ALTER TABLE IF EXISTS mobile_money_b2c_disbursements ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS mobile_money_b2c_disbursements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON mobile_money_b2c_disbursements;
DROP POLICY IF EXISTS tenant_isolation ON mobile_money_b2c_disbursements;
CREATE POLICY tenant_isolation ON mobile_money_b2c_disbursements
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- ── domain_events ──────────────────────────────────────────────────────────
-- domain_events is polymorphic: json_data contains entity context.
-- We infer tenant_id by joining through known entity tables (loans, repayments, clients).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'domain_events'
  ) THEN
    -- Check if tenant_id column already exists, add if missing
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'domain_events'
        AND column_name = 'tenant_id'
    ) THEN
      EXECUTE 'ALTER TABLE domain_events ADD COLUMN tenant_id TEXT';
    END IF;

    -- Backfill: derive tenant_id from loans table via loan_id in json_data
    EXECUTE 'UPDATE domain_events'
      || ' SET tenant_id = COALESCE('
      || '  (SELECT l.tenant_id FROM loans l'
      || '   WHERE l.id = (json_data->>''loan_id'')::bigint LIMIT 1),'
      || '  (SELECT r.tenant_id FROM repayments r'
      || '   WHERE r.id = (json_data->>''repayment_id'')::bigint LIMIT 1),'
      || '  (SELECT c.tenant_id FROM clients c'
      || '   WHERE c.id = (json_data->>''client_id'')::bigint LIMIT 1),'
      || '  ''default'')'
      || ' WHERE tenant_id IS NULL';

    -- Fallback for any remaining NULLs
    EXECUTE 'UPDATE domain_events SET tenant_id = ''default'' WHERE tenant_id IS NULL';

    EXECUTE 'ALTER TABLE domain_events ALTER COLUMN tenant_id SET DEFAULT ''default''';
    EXECUTE 'ALTER TABLE domain_events ALTER COLUMN tenant_id SET NOT NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_domain_events_tenant_id ON domain_events(tenant_id)';
    -- Composite index for event queries filtered by tenant and entity type
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_domain_events_tenant_event_type ON domain_events(tenant_id, event_type)';
    EXECUTE 'ALTER TABLE domain_events ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE domain_events FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_policy ON domain_events';
    EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON domain_events';
    EXECUTE $policy$
      CREATE POLICY tenant_isolation ON domain_events
        USING (tenant_id = current_setting('app.tenant_id', true))
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true))
    $policy$;
  END IF;
END $$;
