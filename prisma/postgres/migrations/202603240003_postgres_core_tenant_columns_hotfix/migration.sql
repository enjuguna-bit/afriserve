-- Hotfix: backfill missing tenant_id columns on Postgres tables that the
-- runtime now scopes by tenant. This is intentionally idempotent because the
-- current checked-in Postgres migration history is not fully deployable.

ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS tenant_id TEXT;
UPDATE users SET tenant_id = 'default' WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS users ALTER COLUMN tenant_id SET DEFAULT 'default';
ALTER TABLE IF EXISTS users ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);

ALTER TABLE IF EXISTS branches ADD COLUMN IF NOT EXISTS tenant_id TEXT;
UPDATE branches SET tenant_id = 'default' WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS branches ALTER COLUMN tenant_id SET DEFAULT 'default';
ALTER TABLE IF EXISTS branches ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_branches_tenant_id ON branches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_branches_tenant_region_id ON branches(tenant_id, region_id);

ALTER TABLE IF EXISTS clients ADD COLUMN IF NOT EXISTS tenant_id TEXT;
UPDATE clients SET tenant_id = 'default' WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS clients ALTER COLUMN tenant_id SET DEFAULT 'default';
ALTER TABLE IF EXISTS clients ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_tenant_id ON clients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clients_tenant_branch_created_at ON clients(tenant_id, branch_id, created_at);

ALTER TABLE IF EXISTS loan_products ADD COLUMN IF NOT EXISTS tenant_id TEXT;
UPDATE loan_products SET tenant_id = 'default' WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS loan_products ALTER COLUMN tenant_id SET DEFAULT 'default';
ALTER TABLE IF EXISTS loan_products ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_loan_products_tenant_id ON loan_products(tenant_id);

ALTER TABLE IF EXISTS loans ADD COLUMN IF NOT EXISTS tenant_id TEXT;
UPDATE loans SET tenant_id = 'default' WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS loans ALTER COLUMN tenant_id SET DEFAULT 'default';
ALTER TABLE IF EXISTS loans ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_loans_tenant_id ON loans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_loans_tenant_branch_status ON loans(tenant_id, branch_id, status);

ALTER TABLE IF EXISTS repayments ADD COLUMN IF NOT EXISTS tenant_id TEXT;
UPDATE repayments SET tenant_id = 'default' WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS repayments ALTER COLUMN tenant_id SET DEFAULT 'default';
ALTER TABLE IF EXISTS repayments ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_repayments_tenant_id ON repayments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_repayments_tenant_loan_paid_at ON repayments(tenant_id, loan_id, paid_at);

ALTER TABLE IF EXISTS gl_journals ADD COLUMN IF NOT EXISTS tenant_id TEXT;
UPDATE gl_journals SET tenant_id = 'default' WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS gl_journals ALTER COLUMN tenant_id SET DEFAULT 'default';
ALTER TABLE IF EXISTS gl_journals ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gl_journals_tenant_id ON gl_journals(tenant_id);

ALTER TABLE IF EXISTS password_resets ADD COLUMN IF NOT EXISTS tenant_id TEXT;
UPDATE password_resets SET tenant_id = 'default' WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS password_resets ALTER COLUMN tenant_id SET DEFAULT 'default';
ALTER TABLE IF EXISTS password_resets ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_password_resets_tenant_id ON password_resets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_tenant_user_id ON password_resets(tenant_id, user_id);

ALTER TABLE IF EXISTS approval_requests ADD COLUMN IF NOT EXISTS tenant_id TEXT;
UPDATE approval_requests SET tenant_id = 'default' WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS approval_requests ALTER COLUMN tenant_id SET DEFAULT 'default';
ALTER TABLE IF EXISTS approval_requests ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_approval_requests_tenant_id ON approval_requests(tenant_id);

ALTER TABLE IF EXISTS collection_actions ADD COLUMN IF NOT EXISTS tenant_id TEXT;
UPDATE collection_actions SET tenant_id = 'default' WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS collection_actions ALTER COLUMN tenant_id SET DEFAULT 'default';
ALTER TABLE IF EXISTS collection_actions ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_collection_actions_tenant_id ON collection_actions(tenant_id);

ALTER TABLE IF EXISTS loan_underwriting_assessments ADD COLUMN IF NOT EXISTS tenant_id TEXT;
UPDATE loan_underwriting_assessments SET tenant_id = 'default' WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS loan_underwriting_assessments ALTER COLUMN tenant_id SET DEFAULT 'default';
ALTER TABLE IF EXISTS loan_underwriting_assessments ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_loan_underwriting_assessments_tenant_id ON loan_underwriting_assessments(tenant_id);

ALTER TABLE IF EXISTS gl_entries ADD COLUMN IF NOT EXISTS tenant_id TEXT;
UPDATE gl_entries SET tenant_id = 'default' WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS gl_entries ALTER COLUMN tenant_id SET DEFAULT 'default';
ALTER TABLE IF EXISTS gl_entries ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gl_entries_tenant_id ON gl_entries(tenant_id);
