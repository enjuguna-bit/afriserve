-- =============================================================================
-- AfriserveBackend — Postgres Row-Level Security deployment script
-- Target: Azure Database for PostgreSQL Flexible Server
-- =============================================================================
--
-- PREREQUISITES (run in order):
--   1. All Prisma migrations have been applied
--      (prisma migrate deploy, or the equivalent runtime migration runner)
--   2. This script is idempotent — safe to re-run on an existing database
--
-- WHAT THIS SCRIPT DOES:
--   Step 1  — Ensures users.tenant_id exists (catches databases that haven't
--             had the Prisma migration applied yet)
--   Step 2  — Enables RLS on all five tenant-scoped tables
--   Step 3  — Drops and recreates policies (fully idempotent)
--   Step 4  — Verifies the policies are registered (informational)
--
-- AFTER RUNNING:
--   • Restart or redeploy the API so the updated prismaClient.ts (which calls
--     set_config('app.tenant_id', ...) before every query) is active.
--   • Test with: SET app.tenant_id = 'default'; SELECT count(*) FROM users;
--   • If the count is 0 on a populated DB something is wrong with the app hook.
--
-- ROLLBACK:
--   To disable RLS without losing the policies:
--     ALTER TABLE users       DISABLE ROW LEVEL SECURITY;
--     ALTER TABLE clients     DISABLE ROW LEVEL SECURITY;
--     ALTER TABLE loans       DISABLE ROW LEVEL SECURITY;
--     ALTER TABLE repayments  DISABLE ROW LEVEL SECURITY;
--     ALTER TABLE gl_journals DISABLE ROW LEVEL SECURITY;
--
-- =============================================================================


-- -----------------------------------------------------------------------------
-- STEP 1 — Ensure users.tenant_id column exists
-- (idempotent — ADD COLUMN IF NOT EXISTS does nothing if already present)
-- -----------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);


-- -----------------------------------------------------------------------------
-- STEP 2 — Enable Row-Level Security on tenant-scoped tables
-- (idempotent — enabling RLS on an already-RLS-enabled table is a no-op)
-- -----------------------------------------------------------------------------
ALTER TABLE users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients     ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans       ENABLE ROW LEVEL SECURITY;
ALTER TABLE repayments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_journals ENABLE ROW LEVEL SECURITY;


-- -----------------------------------------------------------------------------
-- STEP 3 — Drop existing policies then recreate (fully idempotent)
--
-- current_setting('app.tenant_id', true):
--   The second argument (missing_ok = true) means the function returns NULL
--   instead of raising an error if the setting hasn't been set on this
--   connection.  When NULL is returned, the USING clause evaluates to NULL
--   (not TRUE), so no rows are returned — a safe default.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS users_tenant_policy       ON users;
DROP POLICY IF EXISTS clients_tenant_policy     ON clients;
DROP POLICY IF EXISTS loans_tenant_policy       ON loans;
DROP POLICY IF EXISTS repayments_tenant_policy  ON repayments;
DROP POLICY IF EXISTS gl_journals_tenant_policy ON gl_journals;

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


-- -----------------------------------------------------------------------------
-- STEP 4 — Verification query (returns the 5 policies just created)
-- -----------------------------------------------------------------------------
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  qual AS using_expr
FROM pg_policies
WHERE tablename IN ('users', 'clients', 'loans', 'repayments', 'gl_journals')
ORDER BY tablename, policyname;


-- =============================================================================
-- OPTIONAL — Uncomment section below only after RLS is confirmed stable in prod.
--
-- FORCE ROW LEVEL SECURITY makes the policy apply even to the table owner /
-- superuser.  Do NOT enable this until you are certain every background job,
-- migration runner, and admin tool sets app.tenant_id before querying.
-- =============================================================================
-- ALTER TABLE users       FORCE ROW LEVEL SECURITY;
-- ALTER TABLE clients     FORCE ROW LEVEL SECURITY;
-- ALTER TABLE loans       FORCE ROW LEVEL SECURITY;
-- ALTER TABLE repayments  FORCE ROW LEVEL SECURITY;
-- ALTER TABLE gl_journals FORCE ROW LEVEL SECURITY;

-- =============================================================================
-- OPTIONAL — Per-tenant email uniqueness index.
-- Drop the existing global unique index on users.email before enabling.
-- =============================================================================
-- DROP INDEX IF EXISTS users_email_key;
-- CREATE UNIQUE INDEX IF NOT EXISTS uq_users_tenant_email ON users(tenant_id, email);
