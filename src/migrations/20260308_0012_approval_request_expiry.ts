export default {
  id: "20260308_0012_approval_request_expiry",
  async up({ run }: { run: (sql: string, params?: unknown[]) => Promise<unknown> }) {
    async function runSafe(sql: string, params?: unknown[]) {
      try {
        await run(sql, params);
      } catch (error) {
        const message = String(error instanceof Error ? error.message : error || "").toLowerCase();
        if (message.includes("duplicate column name")) {
          return;
        }
        throw error;
      }
    }

    await runSafe(`
      ALTER TABLE approval_requests
      ADD COLUMN expires_at TEXT
    `);

    await run(`
      UPDATE approval_requests
      SET expires_at = datetime(COALESCE(requested_at, created_at), '+7 days')
      WHERE expires_at IS NULL
        AND status = 'pending'
    `);

    await run(`
      UPDATE approval_requests
      SET
        status = 'expired',
        updated_at = datetime('now')
      WHERE status = 'pending'
        AND expires_at IS NOT NULL
        AND expires_at < datetime('now')
    `);

    await run("DROP TRIGGER IF EXISTS trg_approval_status_insert");
    await run("DROP TRIGGER IF EXISTS trg_approval_status_update");

    await run(`
      CREATE TRIGGER IF NOT EXISTS trg_approval_status_insert
      BEFORE INSERT ON approval_requests
      FOR EACH ROW
      WHEN NEW.status NOT IN ('pending', 'approved', 'rejected', 'cancelled', 'expired')
      BEGIN
        SELECT RAISE(ABORT, 'Invalid approval status');
      END
    `);

    await run(`
      CREATE TRIGGER IF NOT EXISTS trg_approval_status_update
      BEFORE UPDATE OF status ON approval_requests
      FOR EACH ROW
      WHEN NEW.status NOT IN ('pending', 'approved', 'rejected', 'cancelled', 'expired')
      BEGIN
        SELECT RAISE(ABORT, 'Invalid approval status');
      END
    `);

    await run(`
      CREATE INDEX IF NOT EXISTS idx_approval_requests_expires_at
      ON approval_requests(expires_at)
    `);
  },
  async down() {
    // Forward-only runtime migration.
  },
};
