-- ============================================================================
-- Postgres tenant Row-Level Security (RLS) policies
-- ============================================================================
-- Apply AFTER migration 0015 (20260317_0015_tenant_id_columns) has run and
-- confirmed tenant_id columns exist on all target tables.
--
-- See docs/runbooks/apply-rls.md for the step-by-step procedure, rollback
-- instructions, and guidance on FORCE ROW LEVEL SECURITY for connection pools.
--
-- Quick apply (after migration 0015):
--   psql $DATABASE_URL -f docs/sql/postgres-tenant-rls.sql
-- ============================================================================

-- ── 1. Session variable  ─────────────────────────────────────────────────────
-- The tenantContext middleware (src/middleware/tenantContext.ts) sets this on
-- every HTTP request via the Prisma $use hook in prismaClient.ts:
--   SELECT set_config('app.tenant_id', $tenantId, false)
--
-- current_setting('app.tenant_id', true)  ← missing_ok = true → returns NULL
--   NULL = NULL evaluates to false → RLS blocks rows when variable is unset.
--   This is the desired safe-fail: an unconfigured connection sees 0 rows.

-- ── 2. Enable RLS on all tenant-scoped tables ────────────────────────────────
ALTER TABLE users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients      ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans        ENABLE ROW LEVEL SECURITY;
ALTER TABLE repayments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_journals  ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs   ENABLE ROW LEVEL SECURITY;
-- domain_events tenant_id column added by migration 0015 (col already existed
-- in migration 0008 but lacked an index + policy). Enable RLS now.
ALTER TABLE domain_events ENABLE ROW LEVEL SECURITY;

-- ── 3. Read/write policies ───────────────────────────────────────────────────
-- USING      = filter for SELECT, UPDATE, DELETE (which rows the session can see)
-- WITH CHECK = filter for INSERT, UPDATE (which rows the session can write)
--
-- Both sides use current_setting with missing_ok = true so the policy fails
-- safely (returns NULL) rather than throwing when the variable is not set.
-- NULL = anything evaluates to false, so unset sessions see / write 0 rows.

CREATE POLICY users_tenant_policy ON users
  USING      (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY clients_tenant_policy ON clients
  USING      (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY loans_tenant_policy ON loans
  USING      (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY repayments_tenant_policy ON repayments
  USING      (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY gl_journals_tenant_policy ON gl_journals
  USING      (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY audit_logs_tenant_policy ON audit_logs
  USING      (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- domain_events: write path (publishDomainEvent) always sets tenant_id explicitly;
-- read path (outbox dispatch job) uses runWithTenant to set context.
CREATE POLICY domain_events_tenant_policy ON domain_events
  USING      (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- ── 4. Per-tenant unique constraints ─────────────────────────────────────────
-- These enforce uniqueness within a tenant, not globally.
-- Migration 0015 adds expression indexes for SQLite; these are the Postgres
-- equivalents that the Prisma migration should also apply.

-- One email per tenant (case-insensitive).
-- Index created if it does not already exist from migration 0015.
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_tenant_email
  ON users (tenant_id, LOWER(email))
  WHERE email IS NOT NULL;

-- One national_id per tenant (strips spaces and hyphens).
CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_tenant_national_id
  ON clients (tenant_id, LOWER(REPLACE(REPLACE(TRIM(national_id), ' ', ''), '-', '')))
  WHERE national_id IS NOT NULL;

-- ── 5. FORCE ROW LEVEL SECURITY (opt-in) ─────────────────────────────────────
-- Uncomment ONLY after verifying ALL connection paths (HTTP requests, background
-- jobs, admin scripts) set app.tenant_id before issuing queries.
--
-- Without FORCE, table owners and superusers bypass RLS — acceptable during
-- the transition phase and for DBA maintenance. With FORCE, even superusers
-- are filtered. Enabling FORCE prematurely will break background jobs and
-- seed scripts that run outside a tenant context.
--
-- ALTER TABLE users         FORCE ROW LEVEL SECURITY;
-- ALTER TABLE clients       FORCE ROW LEVEL SECURITY;
-- ALTER TABLE loans         FORCE ROW LEVEL SECURITY;
-- ALTER TABLE repayments    FORCE ROW LEVEL SECURITY;
-- ALTER TABLE gl_journals   FORCE ROW LEVEL SECURITY;
-- ALTER TABLE audit_logs    FORCE ROW LEVEL SECURITY;
-- ALTER TABLE domain_events FORCE ROW LEVEL SECURITY;

-- ── 6. Rollback script ────────────────────────────────────────────────────────
-- To remove RLS from all tables (e.g. during a hotfix or rollback):
--
-- ALTER TABLE users         DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE clients       DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE loans         DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE repayments    DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE gl_journals   DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE audit_logs    DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE domain_events DISABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS users_tenant_policy        ON users;
-- DROP POLICY IF EXISTS clients_tenant_policy      ON clients;
-- DROP POLICY IF EXISTS loans_tenant_policy        ON loans;
-- DROP POLICY IF EXISTS repayments_tenant_policy   ON repayments;
-- DROP POLICY IF EXISTS gl_journals_tenant_policy  ON gl_journals;
-- DROP POLICY IF EXISTS audit_logs_tenant_policy   ON audit_logs;
-- DROP POLICY IF EXISTS domain_events_tenant_policy ON domain_events;
