# Runbook: Apply Postgres RLS Tenant Policies

## Purpose

This runbook walks through applying Row-Level Security (RLS) tenant isolation
policies to the Afriserve Postgres database after the `tenant_id` columns are
in place. RLS ensures that each tenant's data is invisible to other tenants at
the database engine level, even if application-layer filters are bypassed.

## Prerequisites

Before running this script, verify all of the following:

1. **Migration 0015 has run.**
   ```
   SELECT id FROM schema_migrations WHERE id = '20260317_0015_tenant_id_columns';
   ```
   If this returns no row, run `npm run migrate` first.

2. **Every business table has a `tenant_id` column.**
   ```sql
   SELECT table_name, column_name
   FROM information_schema.columns
   WHERE column_name = 'tenant_id'
     AND table_schema = 'public'
   ORDER BY table_name;
   ```
   Expected tables: `users`, `clients`, `loans`, `repayments`, `gl_journals`,
   `audit_logs`, `domain_events`.

3. **All existing rows are backfilled to `'default'`.**
   ```sql
   SELECT COUNT(*) FROM users WHERE tenant_id IS NULL OR tenant_id = '';
   -- Should return 0
   SELECT COUNT(*) FROM clients WHERE tenant_id IS NULL OR tenant_id = '';
   -- Should return 0
   ```

4. **The app is NOT yet sending `X-Tenant-ID` headers to this database** (if you
   are doing a staged rollout). The RLS policies are safe to apply while the app
   is running in single-tenant mode — the session variable will simply always be
   `'default'` and all rows will be visible as before.

---

## Apply the policies

```bash
psql "$DATABASE_URL" -f docs/sql/postgres-tenant-rls.sql
```

Expected output — no errors, each `ALTER TABLE` and `CREATE POLICY` succeeds:

```
ALTER TABLE
ALTER TABLE
...
CREATE POLICY
CREATE POLICY
...
CREATE INDEX
CREATE INDEX
```

---

## Verification

After applying, confirm RLS is active:

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('users', 'clients', 'loans', 'repayments', 'gl_journals',
                    'audit_logs', 'domain_events');
```

All `rowsecurity` values should be `true`.

Confirm policies are created:

```sql
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

Smoke-test isolation (as a non-superuser DB role the app uses):

```sql
-- Should return 0 rows when tenant variable is not set (safe failure)
RESET app.tenant_id;
SELECT COUNT(*) FROM clients;

-- Should return all 'default' rows
SET app.tenant_id = 'default';
SELECT COUNT(*) FROM clients;
```

---

## Background jobs and seeds

Background jobs that run outside an HTTP request (overdue sync, domain event
dispatch, accounting batch) must call `runWithTenant(tenantId, fn)` from
`src/utils/tenantStore.ts` to establish a tenant context before issuing
database queries. Without this, the job will see 0 rows.

The `domainEventDispatchJob` processes the `domain_events` table. It should
loop over each distinct `tenant_id` and call `runWithTenant` for each batch.

Single-tenant deployments can set `DEFAULT_TENANT_ID=default` in `.env` and
rely on the fallback in `getCurrentTenantId()`, which returns `'default'` when
the AsyncLocalStorage context is empty. This keeps all background jobs working
without code changes for single-tenant installations.

---

## Enabling FORCE ROW LEVEL SECURITY

`FORCE ROW LEVEL SECURITY` makes RLS apply to table owners and superusers too.
It is **not** applied by the SQL script by default because it will break:

- Seed scripts that run without a tenant context (`prisma db seed`)
- DBA maintenance tasks (manual SQL from `psql` without `SET app.tenant_id`)
- Prisma `migrate deploy` if it issues DDL under the table owner role

To enable FORCE after you have verified all paths set the session variable:

```sql
ALTER TABLE users         FORCE ROW LEVEL SECURITY;
ALTER TABLE clients       FORCE ROW LEVEL SECURITY;
ALTER TABLE loans         FORCE ROW LEVEL SECURITY;
ALTER TABLE repayments    FORCE ROW LEVEL SECURITY;
ALTER TABLE gl_journals   FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs    FORCE ROW LEVEL SECURITY;
ALTER TABLE domain_events FORCE ROW LEVEL SECURITY;
```

---

## Rollback

To remove all RLS policies and disable tenant enforcement:

```bash
psql "$DATABASE_URL" <<'SQL'
ALTER TABLE users         DISABLE ROW LEVEL SECURITY;
ALTER TABLE clients       DISABLE ROW LEVEL SECURITY;
ALTER TABLE loans         DISABLE ROW LEVEL SECURITY;
ALTER TABLE repayments    DISABLE ROW LEVEL SECURITY;
ALTER TABLE gl_journals   DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs    DISABLE ROW LEVEL SECURITY;
ALTER TABLE domain_events DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_tenant_policy         ON users;
DROP POLICY IF EXISTS clients_tenant_policy       ON clients;
DROP POLICY IF EXISTS loans_tenant_policy         ON loans;
DROP POLICY IF EXISTS repayments_tenant_policy    ON repayments;
DROP POLICY IF EXISTS gl_journals_tenant_policy   ON gl_journals;
DROP POLICY IF EXISTS audit_logs_tenant_policy    ON audit_logs;
DROP POLICY IF EXISTS domain_events_tenant_policy ON domain_events;
SQL
```

Rollback does **not** remove the `tenant_id` columns — those are structural and
must stay for migration compatibility. The app continues to work correctly in
single-tenant mode after rollback because all rows have `tenant_id = 'default'`
and the application code sets `app.tenant_id = 'default'` on every connection.

---

## Staged rollout checklist

| Step | Status |
|---|---|
| Migration 0015 applied | ✅ run at startup |
| All rows backfilled to `'default'` | ✅ auto via column DEFAULT |
| `tenantContext` middleware reads `X-Tenant-ID` header | ✅ `src/middleware/tenantContext.ts` |
| Prisma `$use` hook sets `app.tenant_id` before each query | ✅ `src/db/prismaClient.ts` |
| Frontend sends `X-Tenant-ID` header on every request | ✅ `frontend-next/src/services/apiClient.ts` |
| Tenant CRUD API live | ✅ `src/routes/tenantRoutes.ts` |
| Admin UI `TenantSwitcher` component wired | ✅ `src/components/layout/TenantSwitcher.tsx` |
| RLS SQL script applied to Postgres | ⬜ **this runbook** |
| Background jobs call `runWithTenant` | ⬜ pending (safe to defer — single-tenant default works) |
| `FORCE ROW LEVEL SECURITY` enabled | ⬜ optional — enable after verifying all paths |
