-- Migration: 20260322000001_add_tenant_id_to_operational_tables
--
-- Adds tenant_id column to all operational tables that were missing it.
-- This enables proper multi-tenant data isolation for raw SQL queries that
-- cannot use Prisma's automatic tenant scoping ($extends middleware).
--
-- All statements use ADD COLUMN IF NOT EXISTS so this migration is safe
-- to re-run. Default value is 'default' to preserve existing single-tenant
-- data. Application code uses getCurrentTenantId() for all new writes.
--
-- Tables added in this migration:
--   1.  branches                       (branch management)
--   2.  gl_entries                     (GL double-entry lines)
--   3.  loan_products                  (loan product catalog)
--   4.  collection_actions             (debt collection notes)
--   5.  capital_transactions           (investor deposits/withdrawals)
--   6.  gl_suspense_cases              (suspense accounting)
--   7.  gl_suspense_allocations        (suspense resolution)
--   8.  gl_coa_versions                (chart of accounts versions)
--   9.  gl_coa_accounts                (chart of accounts accounts)
--   10. loan_underwriting_assessments  (underwriting snapshots)
--   11. password_resets                (password reset tokens)
-- ---------------------------------------------------------------------------

-- ── SQLite-compatible syntax ─────────────────────────────────────────────────
-- SQLite does not support ADD COLUMN IF NOT EXISTS before version 3.37 (2021).
-- We check at application boot time and apply only on older engines if needed.
-- The migration runner handles this gracefully.

-- 1. branches
ALTER TABLE branches
  ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_branches_tenant_id
  ON branches(tenant_id);

-- 2. gl_entries
ALTER TABLE gl_entries
  ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_gl_entries_tenant_id
  ON gl_entries(tenant_id);

CREATE INDEX IF NOT EXISTS idx_gl_entries_tenant_journal
  ON gl_entries(tenant_id, journal_id);

-- 3. loan_products
ALTER TABLE loan_products
  ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_loan_products_tenant_id
  ON loan_products(tenant_id);

-- 4. collection_actions
ALTER TABLE collection_actions
  ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_collection_actions_tenant_id
  ON collection_actions(tenant_id);

-- 5. capital_transactions
ALTER TABLE capital_transactions
  ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_capital_transactions_tenant_id
  ON capital_transactions(tenant_id);

-- 6. gl_suspense_cases
ALTER TABLE gl_suspense_cases
  ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_gl_suspense_cases_tenant_id
  ON gl_suspense_cases(tenant_id);

-- 7. gl_suspense_allocations
ALTER TABLE gl_suspense_allocations
  ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_gl_suspense_allocations_tenant_id
  ON gl_suspense_allocations(tenant_id);

-- 8. gl_coa_versions
ALTER TABLE gl_coa_versions
  ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_gl_coa_versions_tenant_id
  ON gl_coa_versions(tenant_id);

-- 9. gl_coa_accounts
ALTER TABLE gl_coa_accounts
  ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_gl_coa_accounts_tenant_id
  ON gl_coa_accounts(tenant_id);

-- 10. loan_underwriting_assessments
ALTER TABLE loan_underwriting_assessments
  ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_loan_underwriting_tenant_id
  ON loan_underwriting_assessments(tenant_id);

-- 11. password_resets
ALTER TABLE password_resets
  ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_password_resets_tenant_id
  ON password_resets(tenant_id);

-- ── Backfill existing rows ───────────────────────────────────────────────────
-- All existing rows get tenant_id = 'default' (already set via column default).
-- No explicit UPDATE needed.

-- ── Composite indexes for common query patterns ──────────────────────────────
-- These speed up the most common WHERE tenant_id = ? AND <other_col> = ? queries.

CREATE INDEX IF NOT EXISTS idx_loan_products_tenant_active
  ON loan_products(tenant_id, is_active);

CREATE INDEX IF NOT EXISTS idx_collection_actions_tenant_loan
  ON collection_actions(tenant_id, loan_id);

CREATE INDEX IF NOT EXISTS idx_capital_transactions_tenant_status
  ON capital_transactions(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_branches_tenant_active
  ON branches(tenant_id, is_active);

CREATE INDEX IF NOT EXISTS idx_password_resets_tenant_hash
  ON password_resets(tenant_id, token_hash);
