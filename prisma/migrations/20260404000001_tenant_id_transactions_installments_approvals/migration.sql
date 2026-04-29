-- Migration: 20260404000001_tenant_id_transactions_installments_approvals
--
-- SQLite-compatible tenant-isolation parity for the last three operational
-- tables that were still being scoped at the query layer without a physical
-- tenant_id column.

ALTER TABLE loan_installments ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
UPDATE loan_installments
SET tenant_id = COALESCE(
  (SELECT l.tenant_id FROM loans l WHERE l.id = loan_installments.loan_id LIMIT 1),
  'default'
)
WHERE COALESCE(tenant_id, 'default') = 'default';
CREATE INDEX IF NOT EXISTS idx_loan_installments_tenant_id
  ON loan_installments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_loan_installments_tenant_loan
  ON loan_installments(tenant_id, loan_id);

ALTER TABLE transactions ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
UPDATE transactions
SET tenant_id = COALESCE(
  (SELECT l.tenant_id FROM loans l WHERE l.id = transactions.loan_id LIMIT 1),
  'default'
)
WHERE COALESCE(tenant_id, 'default') = 'default';
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_id
  ON transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_loan
  ON transactions(tenant_id, loan_id);

ALTER TABLE approval_requests ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
UPDATE approval_requests
SET tenant_id = COALESCE(
  (SELECT l.tenant_id FROM loans l WHERE l.id = approval_requests.loan_id LIMIT 1),
  'default'
)
WHERE COALESCE(tenant_id, 'default') = 'default';
CREATE INDEX IF NOT EXISTS idx_approval_requests_tenant_id
  ON approval_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_tenant_status
  ON approval_requests(tenant_id, status);
