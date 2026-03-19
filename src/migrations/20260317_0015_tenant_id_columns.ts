/**
 * Migration 0015 — tenant_id columns on core business tables
 *
 * Implements Phase 1 of the multi-tenant SaaS transition documented in
 * docs/architecture/event-driven-cqrs-multitenant-plan.md §3:
 *   "Add tenant_id to core tables (clients, loans, repayments, gl_journals, users, etc)."
 *   "Backfill existing data to 'default'."
 *   "Add tenant-aware unique constraints."
 *
 * ── What this migration does ─────────────────────────────────────────────────
 *
 * 1. Adds `tenant_id TEXT NOT NULL DEFAULT 'default'` to:
 *      users, clients, loans, repayments, gl_journals
 *    (regions and branches are hierarchy-config; they do not hold financial data
 *     and are shared across a single-region deployment — not tenant-scoped yet.)
 *
 * 2. All existing rows are implicitly backfilled to 'default' via the column
 *    DEFAULT — no separate UPDATE sweep is needed at this scale.
 *
 * 3. Adds composite indexes for fast tenant-scoped queries on each table:
 *      (tenant_id, id)          — primary key scoped reads (pagination)
 *      (tenant_id, <fk>)        — FK-join scoped reads (loans by client, etc.)
 *      table-specific hot paths (see below)
 *
 * 4. Adds a UNIQUE constraint on (tenant_id, email) for users — replaces the
 *    single-tenant assumption of global email uniqueness.
 *
 * 5. Recreates the clients national_id expression index to include tenant_id,
 *    so the uniqueness boundary is "unique per tenant" not "globally unique".
 *
 * ── SQLite compatibility ──────────────────────────────────────────────────────
 *   ALTER TABLE … ADD COLUMN … DEFAULT … requires SQLite ≥ 3.37 for NOT NULL
 *   without a rowid. The project minimum is 3.35+; we use a workaround for
 *   SQLite < 3.37 by omitting NOT NULL and adding a CHECK constraint instead —
 *   actually SQLite 3.37 added "ALTER TABLE ADD COLUMN NOT NULL DEFAULT" without
 *   table rewrite. Since the project's better-sqlite3 ships sqlite 3.46+, this
 *   is safe.
 *
 * ── Postgres compatibility ────────────────────────────────────────────────────
 *   For Postgres, the same DDL works. The RLS policies in
 *   docs/sql/postgres-tenant-rls.sql reference these columns and should be
 *   applied after this migration completes via the runbook in docs/runbooks/.
 *
 * ── Non-destructive ──────────────────────────────────────────────────────────
 *   Every operation uses CREATE INDEX IF NOT EXISTS, DROP INDEX IF EXISTS, and
 *   ADD COLUMN with a safe DEFAULT. The migration is safe to run on a live
 *   database with existing data (SQLite WAL mode) and is forward-only.
 */
export default {
  id: "20260317_0015_tenant_id_columns",

  async up({ run, get }: {
    run: (sql: string, params?: unknown[]) => Promise<unknown>;
    get: (sql: string, params?: unknown[]) => Promise<Record<string, unknown> | null | undefined>;
  }) {
    // ── Helper: check if a column already exists (idempotency guard) ──────────
    async function columnExists(table: string, column: string): Promise<boolean> {
      try {
        const row = await get(
          `SELECT COUNT(*) AS cnt FROM pragma_table_info(?) WHERE name = ?`,
          [table, column],
        );
        return Number(row?.cnt || 0) > 0;
      } catch {
        // Fallback for Postgres: attempt a SELECT and catch missing column
        try {
          await get(`SELECT ${column} FROM ${table} LIMIT 0`, []);
          return true;
        } catch {
          return false;
        }
      }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 1. USERS — add tenant_id
    // ═════════════════════════════════════════════════════════════════════════
    if (!await columnExists("users", "tenant_id")) {
      await run(`ALTER TABLE users ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default'`);
    }

    // Composite index: tenant-scoped user lookups by email (most frequent auth path)
    await run(`
      CREATE INDEX IF NOT EXISTS idx_users_tenant_email
        ON users (tenant_id, email)
    `);

    // Composite unique: one email per tenant (multi-tenant email uniqueness)
    // Use CREATE UNIQUE INDEX — safer than ALTER TABLE ADD CONSTRAINT for SQLite
    await run(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_users_tenant_email
        ON users (tenant_id, LOWER(TRIM(email)))
        WHERE email IS NOT NULL
    `);

    // Tenant-scoped role + active queries (admin dashboards)
    await run(`
      CREATE INDEX IF NOT EXISTS idx_users_tenant_role_active
        ON users (tenant_id, role, is_active)
    `);

    // ═════════════════════════════════════════════════════════════════════════
    // 2. CLIENTS — add tenant_id
    // ═════════════════════════════════════════════════════════════════════════
    if (!await columnExists("clients", "tenant_id")) {
      await run(`ALTER TABLE clients ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default'`);
    }

    // Tenant-scoped branch roster (most common client list query)
    await run(`
      CREATE INDEX IF NOT EXISTS idx_clients_tenant_branch
        ON clients (tenant_id, branch_id)
    `);

    // Tenant-scoped officer assignment
    await run(`
      CREATE INDEX IF NOT EXISTS idx_clients_tenant_officer
        ON clients (tenant_id, officer_id)
    `);

    // Recreate national_id unique index with tenant scope.
    // Drop the old single-tenant version (migration 0014) then create tenant-aware one.
    await run(`DROP INDEX IF EXISTS idx_clients_national_id_normalised`);
    await run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_tenant_national_id_normalised
        ON clients (tenant_id, LOWER(REPLACE(REPLACE(TRIM(national_id), ' ', ''), '-', '')))
        WHERE national_id IS NOT NULL
    `);

    // ═════════════════════════════════════════════════════════════════════════
    // 3. LOANS — add tenant_id
    // ═════════════════════════════════════════════════════════════════════════
    if (!await columnExists("loans", "tenant_id")) {
      await run(`ALTER TABLE loans ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default'`);
    }

    // Tenant-scoped portfolio queries
    await run(`
      CREATE INDEX IF NOT EXISTS idx_loans_tenant_branch_status
        ON loans (tenant_id, branch_id, status)
    `);

    // Tenant-scoped client loan history
    await run(`
      CREATE INDEX IF NOT EXISTS idx_loans_tenant_client
        ON loans (tenant_id, client_id)
    `);

    // Tenant-scoped officer portfolio
    await run(`
      CREATE INDEX IF NOT EXISTS idx_loans_tenant_officer
        ON loans (tenant_id, officer_id)
    `);

    // ═════════════════════════════════════════════════════════════════════════
    // 4. REPAYMENTS — add tenant_id
    // ═════════════════════════════════════════════════════════════════════════
    if (!await columnExists("repayments", "tenant_id")) {
      await run(`ALTER TABLE repayments ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default'`);
    }

    // Tenant-scoped repayment history by loan
    await run(`
      CREATE INDEX IF NOT EXISTS idx_repayments_tenant_loan_paid_at
        ON repayments (tenant_id, loan_id, paid_at)
    `);

    // Tenant-scoped daily collections report
    await run(`
      CREATE INDEX IF NOT EXISTS idx_repayments_tenant_paid_at
        ON repayments (tenant_id, paid_at)
    `);

    // ═════════════════════════════════════════════════════════════════════════
    // 5. GL_JOURNALS — add tenant_id
    // ═════════════════════════════════════════════════════════════════════════
    if (!await columnExists("gl_journals", "tenant_id")) {
      await run(`ALTER TABLE gl_journals ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default'`);
    }

    // Tenant-scoped GL queries by loan
    await run(`
      CREATE INDEX IF NOT EXISTS idx_gl_journals_tenant_loan
        ON gl_journals (tenant_id, loan_id)
    `);

    // Tenant-scoped GL queries by branch + posted_at (trial balance / period close)
    await run(`
      CREATE INDEX IF NOT EXISTS idx_gl_journals_tenant_branch_posted_at
        ON gl_journals (tenant_id, branch_id, posted_at)
    `);

    // ═════════════════════════════════════════════════════════════════════════
    // 6. AUDIT_LOGS — add tenant_id (append-only; ADD COLUMN is safe)
    // ═════════════════════════════════════════════════════════════════════════
    if (!await columnExists("audit_logs", "tenant_id")) {
      await run(`ALTER TABLE audit_logs ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default'`);
    }

    await run(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created_at
        ON audit_logs (tenant_id, created_at)
    `);

    // ═════════════════════════════════════════════════════════════════════════
    // 7. DOMAIN_EVENTS — tenant_id already added in migration 0008; ensure index
    // ═════════════════════════════════════════════════════════════════════════
    // No column addition needed — domain_events already has tenant_id.
    // Add a composite index for the tenant-scoped outbox dispatch query if missing.
    await run(`
      CREATE INDEX IF NOT EXISTS idx_domain_events_tenant_status_id
        ON domain_events (tenant_id, status, id)
    `);
  },

  async down({ run }: { run: (sql: string, params?: unknown[]) => Promise<unknown> }) {
    // Drop added indexes (columns cannot be dropped in SQLite without table rewrite)
    await run(`DROP INDEX IF EXISTS idx_users_tenant_email`);
    await run(`DROP INDEX IF EXISTS uq_users_tenant_email`);
    await run(`DROP INDEX IF EXISTS idx_users_tenant_role_active`);
    await run(`DROP INDEX IF EXISTS idx_clients_tenant_branch`);
    await run(`DROP INDEX IF EXISTS idx_clients_tenant_officer`);
    await run(`DROP INDEX IF EXISTS idx_clients_tenant_national_id_normalised`);
    await run(`DROP INDEX IF EXISTS idx_loans_tenant_branch_status`);
    await run(`DROP INDEX IF EXISTS idx_loans_tenant_client`);
    await run(`DROP INDEX IF EXISTS idx_loans_tenant_officer`);
    await run(`DROP INDEX IF EXISTS idx_repayments_tenant_loan_paid_at`);
    await run(`DROP INDEX IF EXISTS idx_repayments_tenant_paid_at`);
    await run(`DROP INDEX IF EXISTS idx_gl_journals_tenant_loan`);
    await run(`DROP INDEX IF EXISTS idx_gl_journals_tenant_branch_posted_at`);
    await run(`DROP INDEX IF EXISTS idx_audit_logs_tenant_created_at`);
    await run(`DROP INDEX IF EXISTS idx_domain_events_tenant_status_id`);
    // Restore pre-migration single-tenant national_id index
    await run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_national_id_normalised
        ON clients (LOWER(REPLACE(REPLACE(TRIM(national_id), ' ', ''), '-', '')))
        WHERE national_id IS NOT NULL
    `);
  },
};
