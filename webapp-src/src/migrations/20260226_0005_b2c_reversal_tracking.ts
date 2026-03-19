export default {
  id: "20260226_0005_b2c_reversal_tracking",
  async up({ run }: { run: (sql: string, params?: unknown[]) => Promise<unknown> }) {
    async function runSafe(sql: string) {
      try {
        await run(sql);
      } catch (error) {
        const message = String(error instanceof Error ? error.message : error || "").toLowerCase();
        if (message.includes("duplicate column name")) {
          return;
        }
        throw error;
      }
    }

    await runSafe("ALTER TABLE mobile_money_b2c_disbursements ADD COLUMN reversal_attempts INTEGER NOT NULL DEFAULT 0");
    await runSafe("ALTER TABLE mobile_money_b2c_disbursements ADD COLUMN reversal_last_requested_at TEXT");
  },
  async down() {
    // SQLite does not support dropping columns safely without table rebuild.
  },
};
