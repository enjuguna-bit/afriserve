/**
 * Migration 0022 — tenant_id columns on transactions, loan_installments, approval_requests
 *
 * Adds `tenant_id TEXT NOT NULL DEFAULT 'default'` to the three remaining
 * high-volume tables that were missing the column, closing the last known
 * tenant-isolation gaps in the query layer:
 *
 *   1. transactions         — penalty charges, disbursements, repayments
 *   2. loan_installments    — repayment schedule rows per loan
 *   3. approval_requests    — maker-checker workflow records
 *
 * Existing rows are backfilled to 'default' via the column DEFAULT — no
 * separate UPDATE sweep is needed (mirrors the pattern from migrations
 * 0015 and 0021).
 *
 * Companion Prisma schema changes:
 *   prisma/schema.prisma            — adds tenant_id + @@index to all three models
 *   prisma/postgres/schema.prisma   — same with @db.Timestamptz decorators preserved
 *
 * Application-layer changes populate tenant_id from getCurrentTenantId()
 * on every new INSERT in:
 *   services/approvalWorkflowService.ts
 *   services/loanLifecycle/shared/contextHelpers.ts
 *   services/loanLifecycle/operations/disburseLoan.ts
 *   services/repaymentService.ts
 *   services/penaltyEngine.ts
 */
export default {
  id: "20260404_0022_tenant_id_transactions_installments_approvals",

  async up({ run }: { run: (sql: string, params?: unknown[]) => Promise<unknown> }) {
    const addColumnIfMissing = async (table: string) => {
      try {
        await run(
          `ALTER TABLE ${table} ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default'`,
        );
      } catch (error) {
        const message = String(
          error instanceof Error ? error.message : error || "",
        ).toLowerCase();
        if (!message.includes("duplicate column name") && !message.includes("already exists")) {
          throw error;
        }
        // Column already exists — idempotent no-op
      }
    };

    await addColumnIfMissing("transactions");
    await addColumnIfMissing("loan_installments");
    await addColumnIfMissing("approval_requests");

    await run(`
      UPDATE loan_installments
      SET tenant_id = COALESCE(
        (SELECT l.tenant_id FROM loans l WHERE l.id = loan_installments.loan_id LIMIT 1),
        'default'
      )
      WHERE COALESCE(tenant_id, 'default') = 'default'
    `);
    await run(`
      UPDATE transactions
      SET tenant_id = COALESCE(
        (SELECT l.tenant_id FROM loans l WHERE l.id = transactions.loan_id LIMIT 1),
        'default'
      )
      WHERE COALESCE(tenant_id, 'default') = 'default'
    `);
    await run(`
      UPDATE approval_requests
      SET tenant_id = COALESCE(
        (SELECT l.tenant_id FROM loans l WHERE l.id = approval_requests.loan_id LIMIT 1),
        'default'
      )
      WHERE COALESCE(tenant_id, 'default') = 'default'
    `);

    // Simple tenant indexes
    await run(`CREATE INDEX IF NOT EXISTS idx_transactions_tenant_id ON transactions(tenant_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_loan_installments_tenant_id ON loan_installments(tenant_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_approval_requests_tenant_id ON approval_requests(tenant_id)`);

    // Composite indexes for the most common tenant-scoped query shapes
    await run(`CREATE INDEX IF NOT EXISTS idx_transactions_tenant_loan ON transactions(tenant_id, loan_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_loan_installments_tenant_loan ON loan_installments(tenant_id, loan_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_approval_requests_tenant_status ON approval_requests(tenant_id, status)`);
  },

  async down({ run }: { run: (sql: string, params?: unknown[]) => Promise<unknown> }) {
    await run(`DROP INDEX IF EXISTS idx_transactions_tenant_loan`);
    await run(`DROP INDEX IF EXISTS idx_transactions_tenant_id`);
    await run(`DROP INDEX IF EXISTS idx_loan_installments_tenant_loan`);
    await run(`DROP INDEX IF EXISTS idx_loan_installments_tenant_id`);
    await run(`DROP INDEX IF EXISTS idx_approval_requests_tenant_status`);
    await run(`DROP INDEX IF EXISTS idx_approval_requests_tenant_id`);

    // SQLite >= 3.35 supports DROP COLUMN (project ships better-sqlite3 => sqlite 3.46+)
    for (const table of ["transactions", "loan_installments", "approval_requests"]) {
      try {
        await run(`ALTER TABLE ${table} DROP COLUMN tenant_id`);
      } catch (_error) {
        // Column may not exist if up() was never run
      }
    }
  },
};
