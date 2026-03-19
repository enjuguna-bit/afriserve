export default {
  id: "20260308_0013_external_reference_indexes",
  async up({ run }: { run: (sql: string, params?: unknown[]) => Promise<unknown> }) {
    await run("CREATE INDEX IF NOT EXISTS idx_loans_external_reference ON loans(external_reference)");
    await run("CREATE INDEX IF NOT EXISTS idx_repayments_external_reference ON repayments(external_reference)");
  },
  async down() {
    // Forward-only runtime migration.
  },
};
