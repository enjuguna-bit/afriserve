/**
 * Migration 0018 – client profile refresh drafts, feedback loop, and immutable versions
 *
 * Adds the shadow/draft profile workflow required for KYC refresh operations:
 *   - open draft refresh records
 *   - field-level update event trail with GPS + timestamps
 *   - manager push-back feedback
 *   - immutable approved profile versions
 */
export default {
  id: "20260328_0018_client_profile_refresh_versioning",

  async up({ run }: {
    run: (sql: string, params?: unknown[]) => Promise<unknown>;
  }) {
    async function tryAlter(sql: string) {
      try {
        await run(sql);
      } catch {
        // Existing databases may already include the column.
      }
    }

    await tryAlter(`ALTER TABLE clients ADD COLUMN photo_metadata_json TEXT`);
    await tryAlter(`ALTER TABLE collateral_assets ADD COLUMN image_urls_json TEXT`);

    await run(`
      CREATE TABLE IF NOT EXISTS client_profile_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL DEFAULT 'default',
        client_id INTEGER NOT NULL,
        version_number INTEGER NOT NULL,
        based_on_refresh_id INTEGER,
        snapshot_json TEXT NOT NULL,
        note TEXT,
        created_by_user_id INTEGER,
        approved_by_user_id INTEGER,
        effective_from TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
        UNIQUE (client_id, version_number)
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS client_profile_refreshes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL DEFAULT 'default',
        client_id INTEGER NOT NULL,
        based_on_version_id INTEGER,
        based_on_version_number INTEGER,
        approved_version_id INTEGER,
        status TEXT NOT NULL DEFAULT 'draft',
        priority_status TEXT NOT NULL DEFAULT 'normal',
        requested_by_user_id INTEGER,
        assigned_to_user_id INTEGER,
        submitted_by_user_id INTEGER,
        reviewed_by_user_id INTEGER,
        requested_note TEXT,
        submission_note TEXT,
        review_note TEXT,
        locked_fields_json TEXT,
        editable_fields_json TEXT,
        active_snapshot_json TEXT NOT NULL,
        draft_snapshot_json TEXT NOT NULL,
        requested_at TEXT NOT NULL,
        submitted_at TEXT,
        reviewed_at TEXT,
        approved_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        pushback_count INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
        FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS client_profile_refresh_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL DEFAULT 'default',
        refresh_id INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        field_path TEXT,
        actor_user_id INTEGER,
        previous_value_json TEXT,
        next_value_json TEXT,
        reason TEXT,
        gps_latitude REAL,
        gps_longitude REAL,
        gps_accuracy_meters REAL,
        device_captured_at TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (refresh_id) REFERENCES client_profile_refreshes(id) ON DELETE CASCADE,
        FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS client_profile_refresh_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL DEFAULT 'default',
        refresh_id INTEGER NOT NULL,
        field_path TEXT NOT NULL,
        reason_code TEXT,
        comment TEXT,
        flagged_by_user_id INTEGER,
        resolved_by_user_id INTEGER,
        flagged_at TEXT NOT NULL,
        resolved_at TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        FOREIGN KEY (refresh_id) REFERENCES client_profile_refreshes(id) ON DELETE CASCADE,
        FOREIGN KEY (flagged_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (resolved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await run(`
      CREATE INDEX IF NOT EXISTS idx_client_profile_versions_client_effective
      ON client_profile_versions (client_id, effective_from)
    `);
    await run(`
      CREATE INDEX IF NOT EXISTS idx_client_profile_versions_tenant_client
      ON client_profile_versions (tenant_id, client_id)
    `);
    await run(`
      CREATE INDEX IF NOT EXISTS idx_client_profile_refreshes_tenant_status
      ON client_profile_refreshes (tenant_id, status, priority_status)
    `);
    await run(`
      CREATE INDEX IF NOT EXISTS idx_client_profile_refreshes_assigned_status
      ON client_profile_refreshes (assigned_to_user_id, status)
    `);
    await run(`
      CREATE INDEX IF NOT EXISTS idx_client_profile_refresh_events_refresh_created
      ON client_profile_refresh_events (refresh_id, created_at)
    `);
    await run(`
      CREATE INDEX IF NOT EXISTS idx_client_profile_refresh_feedback_refresh_status
      ON client_profile_refresh_feedback (refresh_id, status, field_path)
    `);
    await run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_client_profile_refreshes_open_refresh
      ON client_profile_refreshes (client_id)
      WHERE status IN ('draft', 'pending_review', 'pushed_back')
    `);
  },

  async down({ run }: { run: (sql: string, params?: unknown[]) => Promise<unknown> }) {
    await run(`DROP INDEX IF EXISTS idx_client_profile_refreshes_open_refresh`);
    await run(`DROP INDEX IF EXISTS idx_client_profile_refresh_feedback_refresh_status`);
    await run(`DROP INDEX IF EXISTS idx_client_profile_refresh_events_refresh_created`);
    await run(`DROP INDEX IF EXISTS idx_client_profile_refreshes_assigned_status`);
    await run(`DROP INDEX IF EXISTS idx_client_profile_refreshes_tenant_status`);
    await run(`DROP INDEX IF EXISTS idx_client_profile_versions_tenant_client`);
    await run(`DROP INDEX IF EXISTS idx_client_profile_versions_client_effective`);
    await run(`DROP TABLE IF EXISTS client_profile_refresh_feedback`);
    await run(`DROP TABLE IF EXISTS client_profile_refresh_events`);
    await run(`DROP TABLE IF EXISTS client_profile_refreshes`);
    await run(`DROP TABLE IF EXISTS client_profile_versions`);
  },
};
