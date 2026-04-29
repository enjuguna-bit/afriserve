-- Hotfix: align audit_logs with tenant-scoped runtime behavior and Prisma schema.
-- This is idempotent because some deployments may already have the column from
-- runtime compatibility repairs.

ALTER TABLE IF EXISTS audit_logs ADD COLUMN IF NOT EXISTS tenant_id TEXT;
UPDATE audit_logs SET tenant_id = 'default' WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS audit_logs ALTER COLUMN tenant_id SET DEFAULT 'default';
ALTER TABLE IF EXISTS audit_logs ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created_at
ON audit_logs(tenant_id, created_at);
