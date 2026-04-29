/**
 * Migration 0021 — tenant_id columns on mobile money + idempotency tables
 *
 * Adds tenant_id to the four tables that had it missing from the physical
 * SQLite schema while the application code was already writing it via raw SQL
 * ($executeRaw) and expecting it for query scoping:
 *
 *   1. mobile_money_c2b_events          — C2B webhook events
 *   2. mobile_money_b2c_disbursements   — B2C disbursement records
 *   3. repayment_idempotency_keys       — M-Pesa dedup keys
 *   4. loan_overpayment_credits         — overpayment credit ledger
 *
 * Uses ADD COLUMN … DEFAULT 'default' which is idempotent-safe on re-runs
 * (will throw "duplicate column name" which we swallow, matching the pattern
 * used by migration 0015 for the core tables).
 *
 * Postgres: the equivalent columns + RLS policies are already in the
 * Postgres-specific migration chain at
 *   prisma/postgres/migrations/202603300002_tenant_id_missing_tables
 */
export default {
  id: "20260401_0021_mobile_money_tenant_id",

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

    await addColumnIfMissing("mobile_money_c2b_events");
    await addColumnIfMissing("mobile_money_b2c_disbursements");
    await addColumnIfMissing("repayment_idempotency_keys");
    await addColumnIfMissing("loan_overpayment_credits");

    // Indexes — silently skip if already present
    const tables: Record<string, string> = {
      mobile_money_c2b_events:        "idx_c2b_events_tenant_id",
      mobile_money_b2c_disbursements: "idx_b2c_disbursements_tenant_id",
      repayment_idempotency_keys:     "idx_repayment_idempotency_tenant_id",
      loan_overpayment_credits:       "idx_loan_overpayment_credits_tenant_id",
    };

    for (const [table, idx] of Object.entries(tables)) {
      await run(
        `CREATE INDEX IF NOT EXISTS ${idx} ON ${table}(tenant_id)`,
      );
    }
  },

  async down({ run }: { run: (sql: string, params?: unknown[]) => Promise<unknown> }) {
    // SQLite does not support DROP COLUMN before 3.35 but the project requires
    // ≥ 3.35 (better-sqlite3 ships 3.46+), so this is safe.
    const tables = [
      "mobile_money_c2b_events",
      "mobile_money_b2c_disbursements",
      "repayment_idempotency_keys",
      "loan_overpayment_credits",
    ];

    const indexes: Record<string, string> = {
      mobile_money_c2b_events:        "idx_c2b_events_tenant_id",
      mobile_money_b2c_disbursements: "idx_b2c_disbursements_tenant_id",
      repayment_idempotency_keys:     "idx_repayment_idempotency_tenant_id",
      loan_overpayment_credits:       "idx_loan_overpayment_credits_tenant_id",
    };

    for (const idx of Object.values(indexes)) {
      await run(`DROP INDEX IF EXISTS ${idx}`);
    }

    for (const table of tables) {
      try {
        await run(`ALTER TABLE ${table} DROP COLUMN tenant_id`);
      } catch (_error) {
        // Ignore if column does not exist
      }
    }
  },
};
