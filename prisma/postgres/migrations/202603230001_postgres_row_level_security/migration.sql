-- Migration: 202603230001_postgres_row_level_security
--
-- Enables database-enforced tenant isolation for every Postgres table that
-- carries a tenant_id column. Application code already propagates app.tenant_id
-- through Prisma and raw pg connections; this migration makes the database
-- enforce that boundary even if a query forgets to add tenant filters.

DO $$
DECLARE
  tenant_table text;
  tenant_tables text[] := ARRAY[
    'users',
    'branches',
    'clients',
    'loan_products',
    'loans',
    'repayments',
    'loan_underwriting_assessments',
    'collection_actions',
    'capital_transactions',
    'gl_journals',
    'gl_entries',
    'gl_coa_versions',
    'gl_coa_accounts',
    'gl_suspense_cases',
    'gl_suspense_allocations',
    'password_resets'
  ];
BEGIN
  FOREACH tenant_table IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tenant_table);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      || 'USING (tenant_id = current_setting(''app.tenant_id'', true)) '
      || 'WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
      tenant_table
    );
  END LOOP;
END $$;
