export default {
  id: "20260225_0002_audit_log_indexes",
  async up({ run }: { run: (sql: string, params?: unknown[]) => Promise<unknown> }) {
    await run("CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created_at ON audit_logs(tenant_id, created_at)");
    await run("CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)");
  },
  async down({ run }: { run: (sql: string, params?: unknown[]) => Promise<unknown> }) {
    await run("DROP INDEX IF EXISTS idx_audit_logs_user_id");
    await run("DROP INDEX IF EXISTS idx_audit_logs_tenant_created_at");
  },
};
