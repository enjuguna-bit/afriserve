-- 202603300001_rls_client_profile_refresh_tables/migration.sql
--
-- Apply Row-Level Security to the four tables introduced by
-- 202603280002_client_profile_refresh_versioning. These tables all carry a
-- tenant_id column but were not included in any prior RLS migration.
--
-- Idempotent: checks table existence before acting; uses DROP POLICY IF EXISTS.

DO $$
DECLARE
  tbl TEXT;
  tenant_tables TEXT[] := ARRAY[
    'client_profile_versions',
    'client_profile_refreshes',
    'client_profile_refresh_events',
    'client_profile_refresh_feedback'
  ];
BEGIN
  FOREACH tbl IN ARRAY tenant_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I', tbl);
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON %I '
        || 'USING (tenant_id = current_setting(''app.tenant_id'', true)) '
        || 'WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
        tbl
      );
    END IF;
  END LOOP;
END $$;
