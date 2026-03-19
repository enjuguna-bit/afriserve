-- Migration: add tenant_id to users table (Postgres)
--
-- This migration brings the Postgres users table into parity with SQLite
-- (where tenant_id was added in 20260317132000_add_tenant_id_to_users).
-- It must be applied BEFORE the RLS policies in docs/sql/apply-rls-azure.sql
-- because the users_tenant_policy references users.tenant_id.
--
-- Safe to re-run: ADD COLUMN IF NOT EXISTS is idempotent.

-- 1. Add the column; backfill existing rows with 'default'.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';

-- 2. Fast lookup for tenant-scoped user queries and for RLS filtering.
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);

-- 3. Uncomment once RLS is confirmed stable to enforce per-tenant uniqueness.
--    Drop the existing global unique index on email first if you enable this.
-- CREATE UNIQUE INDEX IF NOT EXISTS uq_users_tenant_email ON users(tenant_id, email);
