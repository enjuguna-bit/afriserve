-- 20260404000001_tenant_id_transactions_installments_approvals/migration.sql
--
-- Completes tenant column parity for the remaining operational tables and
-- rebuilds the associated RLS policies so app.tenant_id protects them in
-- Postgres as well as at the application query layer.

ALTER TABLE IF EXISTS loan_installments ADD COLUMN IF NOT EXISTS tenant_id TEXT;
UPDATE loan_installments
SET tenant_id = COALESCE(
  (SELECT l.tenant_id FROM loans l WHERE l.id = loan_installments.loan_id LIMIT 1),
  'default'
)
WHERE tenant_id IS NULL OR tenant_id = 'default';
ALTER TABLE IF EXISTS loan_installments ALTER COLUMN tenant_id SET DEFAULT 'default';
ALTER TABLE IF EXISTS loan_installments ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_loan_installments_tenant_id
  ON loan_installments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_loan_installments_tenant_loan
  ON loan_installments(tenant_id, loan_id);
ALTER TABLE IF EXISTS loan_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS loan_installments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON loan_installments;
DROP POLICY IF EXISTS tenant_isolation ON loan_installments;
CREATE POLICY tenant_isolation ON loan_installments
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE IF EXISTS transactions ADD COLUMN IF NOT EXISTS tenant_id TEXT;
UPDATE transactions
SET tenant_id = COALESCE(
  (SELECT l.tenant_id FROM loans l WHERE l.id = transactions.loan_id LIMIT 1),
  'default'
)
WHERE tenant_id IS NULL OR tenant_id = 'default';
ALTER TABLE IF EXISTS transactions ALTER COLUMN tenant_id SET DEFAULT 'default';
ALTER TABLE IF EXISTS transactions ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_id
  ON transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_loan
  ON transactions(tenant_id, loan_id);
ALTER TABLE IF EXISTS transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS transactions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON transactions;
DROP POLICY IF EXISTS tenant_isolation ON transactions;
CREATE POLICY tenant_isolation ON transactions
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE IF EXISTS approval_requests ADD COLUMN IF NOT EXISTS tenant_id TEXT;
UPDATE approval_requests
SET tenant_id = COALESCE(
  (SELECT l.tenant_id FROM loans l WHERE l.id = approval_requests.loan_id LIMIT 1),
  'default'
)
WHERE tenant_id IS NULL OR tenant_id = 'default';
ALTER TABLE IF EXISTS approval_requests ALTER COLUMN tenant_id SET DEFAULT 'default';
ALTER TABLE IF EXISTS approval_requests ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_approval_requests_tenant_id
  ON approval_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_tenant_status
  ON approval_requests(tenant_id, status);
ALTER TABLE IF EXISTS approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS approval_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON approval_requests;
DROP POLICY IF EXISTS tenant_isolation ON approval_requests;
CREATE POLICY tenant_isolation ON approval_requests
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
