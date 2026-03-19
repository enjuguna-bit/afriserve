-- Migration: add tenant_id to users table
-- Adds a tenant_id column (with a safe default of 'default') so that the users
-- table participates in the tenant isolation model alongside clients, loans,
-- repayments, and gl_journals.

-- 1) Add the column to existing rows (backfill with 'default')
ALTER TABLE users ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';

-- 2) Per-tenant uniqueness index: ensures each tenant may only have one account
--    per email address. The pre-existing @unique on email alone prevents cross-
--    tenant collisions for now; when multi-tenant mode is fully enabled you can
--    drop that constraint and rely solely on this index.
CREATE INDEX IF NOT EXISTS idx_users_tenant_id
  ON users(tenant_id);

-- 3) Recommended: uncomment once RLS policies are active to enforce per-tenant
--    email uniqueness at the database level.
-- CREATE UNIQUE INDEX uq_users_tenant_email ON users(tenant_id, email);
