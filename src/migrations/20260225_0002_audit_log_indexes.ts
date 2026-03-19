export default {
  id: "20260225_0002_audit_log_indexes",
  async up({ run }: { run: (sql: string, params?: unknown[]) => Promise<unknown> }) {
    await run("CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)");
    await run("CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created_at ON audit_logs(action, created_at)");
    await run("CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created_at ON audit_logs(user_id, created_at)");
  },
  async down({ run }: { run: (sql: string, params?: unknown[]) => Promise<unknown> }) {
    await run("DROP INDEX IF EXISTS idx_audit_logs_user_created_at");
    await run("DROP INDEX IF EXISTS idx_audit_logs_action_created_at");
    await run("DROP INDEX IF EXISTS idx_audit_logs_created_at");
  },
};
