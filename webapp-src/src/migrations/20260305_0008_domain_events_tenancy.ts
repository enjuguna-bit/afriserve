export default {
  id: "20260305_0008_domain_events_tenancy",
  async up({ run }: { run: (sql: string, params?: unknown[]) => Promise<unknown> }) {
    await run(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    await run(
      `
        INSERT INTO tenants (id, name, status, created_at, updated_at)
        SELECT ?, ?, 'active', datetime('now'), datetime('now')
        WHERE NOT EXISTS (
          SELECT 1
          FROM tenants
          WHERE id = ?
        )
      `,
      ["default", "Default Tenant", "default"],
    );

    await run(`
      CREATE TABLE IF NOT EXISTS domain_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL DEFAULT 'default',
        event_type TEXT NOT NULL,
        aggregate_type TEXT NOT NULL,
        aggregate_id INTEGER,
        payload_json TEXT NOT NULL,
        metadata_json TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        attempt_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        occurred_at TEXT NOT NULL,
        published_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);

    await run(`CREATE INDEX IF NOT EXISTS idx_domain_events_status_id ON domain_events(status, id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_domain_events_tenant_status ON domain_events(tenant_id, status)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_domain_events_type_created_at ON domain_events(event_type, created_at)`);
  },
  async down() {
    // Forward-only runtime migration.
  },
};
