/**
 * Migration 0016 – tenant_id on guarantors, collateral_assets, loan_guarantors, loan_collaterals
 *
 * Continues Phase 1 multi-tenant work from migration 0015.
 * These four risk-record tables were missed in 0015 and have no tenant boundary,
 * causing Tenant-A data to bleed into Tenant-B queries.
 *
 * Changes:
 *   1. Add tenant_id TEXT NOT NULL DEFAULT 'default' to all four tables
 *   2. Backfill via DEFAULT (SQLite 3.46+ ships with better-sqlite3 – safe)
 *   3. Composite indexes for fast tenant-scoped reads
 *   4. Unique constraint: guarantor national_id is unique *per tenant*
 *   5. Unique constraint: collateral registration/logbook/title *per tenant*
 */
export default {
  id: "20260318_0016_tenant_id_guarantors_collateral",

  async up({ run, get }: {
    run: (sql: string, params?: unknown[]) => Promise<unknown>;
    get: (sql: string, params?: unknown[]) => Promise<Record<string, unknown> | null | undefined>;
  }) {
    async function columnExists(table: string, column: string): Promise<boolean> {
      try {
        const row = await get(
          `SELECT COUNT(*) AS cnt FROM pragma_table_info(?) WHERE name = ?`,
          [table, column],
        );
        return Number(row?.cnt || 0) > 0;
      } catch {
        try { await get(`SELECT ${column} FROM ${table} LIMIT 0`, []); return true; }
        catch { return false; }
      }
    }

    // -- 1. GUARANTORS --------------------------------------------------------
    if (!await columnExists("guarantors", "tenant_id")) {
      await run(`ALTER TABLE guarantors ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default'`);
    }
    await run(`CREATE INDEX IF NOT EXISTS idx_guarantors_tenant_branch ON guarantors (tenant_id, branch_id)`);
    // Tenant-scoped national_id uniqueness (drop old global constraint if any)
    await run(`DROP INDEX IF EXISTS idx_guarantors_national_id`);
    await run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_guarantors_tenant_national_id
        ON guarantors (tenant_id, LOWER(TRIM(COALESCE(national_id, ''))))
        WHERE national_id IS NOT NULL AND national_id != ''
    `);

    // -- 2. COLLATERAL_ASSETS -------------------------------------------------
    if (!await columnExists("collateral_assets", "tenant_id")) {
      await run(`ALTER TABLE collateral_assets ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default'`);
    }
    await run(`CREATE INDEX IF NOT EXISTS idx_collateral_assets_tenant_branch ON collateral_assets (tenant_id, branch_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_collateral_assets_tenant_status ON collateral_assets (tenant_id, status)`);
    // Tenant-scoped uniqueness for registration identifiers
    await run(`DROP INDEX IF EXISTS idx_collateral_assets_registration_number`);
    await run(`DROP INDEX IF EXISTS idx_collateral_assets_logbook_number`);
    await run(`DROP INDEX IF EXISTS idx_collateral_assets_title_number`);
    await run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_collateral_assets_tenant_reg
        ON collateral_assets (tenant_id, LOWER(TRIM(COALESCE(registration_number, ''))))
        WHERE registration_number IS NOT NULL AND registration_number != ''
    `);
    await run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_collateral_assets_tenant_logbook
        ON collateral_assets (tenant_id, LOWER(TRIM(COALESCE(logbook_number, ''))))
        WHERE logbook_number IS NOT NULL AND logbook_number != ''
    `);
    await run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_collateral_assets_tenant_title
        ON collateral_assets (tenant_id, LOWER(TRIM(COALESCE(title_number, ''))))
        WHERE title_number IS NOT NULL AND title_number != ''
    `);

    // -- 3. LOAN_GUARANTORS ---------------------------------------------------
    if (!await columnExists("loan_guarantors", "tenant_id")) {
      await run(`ALTER TABLE loan_guarantors ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default'`);
    }
    await run(`CREATE INDEX IF NOT EXISTS idx_loan_guarantors_tenant_loan ON loan_guarantors (tenant_id, loan_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_loan_guarantors_tenant_guarantor ON loan_guarantors (tenant_id, guarantor_id)`);

    // -- 4. LOAN_COLLATERALS --------------------------------------------------
    if (!await columnExists("loan_collaterals", "tenant_id")) {
      await run(`ALTER TABLE loan_collaterals ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default'`);
    }
    await run(`CREATE INDEX IF NOT EXISTS idx_loan_collaterals_tenant_loan ON loan_collaterals (tenant_id, loan_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_loan_collaterals_tenant_asset ON loan_collaterals (tenant_id, collateral_asset_id)`);
  },

  async down({ run }: { run: (sql: string, params?: unknown[]) => Promise<unknown> }) {
    await run(`DROP INDEX IF EXISTS idx_guarantors_tenant_branch`);
    await run(`DROP INDEX IF EXISTS idx_guarantors_tenant_national_id`);
    await run(`DROP INDEX IF EXISTS idx_collateral_assets_tenant_branch`);
    await run(`DROP INDEX IF EXISTS idx_collateral_assets_tenant_status`);
    await run(`DROP INDEX IF EXISTS idx_collateral_assets_tenant_reg`);
    await run(`DROP INDEX IF EXISTS idx_collateral_assets_tenant_logbook`);
    await run(`DROP INDEX IF EXISTS idx_collateral_assets_tenant_title`);
    await run(`DROP INDEX IF EXISTS idx_loan_guarantors_tenant_loan`);
    await run(`DROP INDEX IF EXISTS idx_loan_guarantors_tenant_guarantor`);
    await run(`DROP INDEX IF EXISTS idx_loan_collaterals_tenant_loan`);
    await run(`DROP INDEX IF EXISTS idx_loan_collaterals_tenant_asset`);
  },
};
