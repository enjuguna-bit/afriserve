export default {
  id: "20260225_0003_startup_data_fixes",
  async up({ run }: { run: (sql: string, params?: unknown[]) => Promise<unknown> }) {
    await run(
      "UPDATE users SET deactivated_at = CASE WHEN is_active = 0 THEN COALESCE(deactivated_at, created_at, datetime('now')) ELSE NULL END",
    );

    await run("UPDATE clients SET is_active = 1 WHERE is_active IS NULL");
    await run(
      "UPDATE clients SET deleted_at = CASE WHEN is_active = 0 THEN COALESCE(deleted_at, updated_at, created_at, datetime('now')) ELSE NULL END",
    );
    await run("UPDATE clients SET kyc_status = LOWER(TRIM(COALESCE(kyc_status, 'pending')))");
    await run("UPDATE clients SET kyc_status = 'pending' WHERE kyc_status NOT IN ('pending', 'in_review', 'verified', 'rejected', 'suspended')");
    await run("UPDATE clients SET updated_at = COALESCE(updated_at, created_at, datetime('now')) WHERE updated_at IS NULL");

    await run("UPDATE loan_products SET is_active = 1 WHERE is_active IS NULL");
    await run("UPDATE loan_products SET updated_at = COALESCE(updated_at, created_at, datetime('now')) WHERE updated_at IS NULL");

    await run("UPDATE loans SET created_at = COALESCE(created_at, disbursed_at, datetime('now')) WHERE created_at IS NULL");
    await run(
      "UPDATE loans SET disbursed_at = NULL, disbursed_by_user_id = NULL WHERE status IN ('pending_approval', 'approved', 'rejected')",
    );
    await run(`
      UPDATE loans
      SET branch_id = (
        SELECT c.branch_id
        FROM clients c
        WHERE c.id = loans.client_id
      )
      WHERE branch_id IS NULL
        AND client_id IS NOT NULL
    `);
    await run(`
      UPDATE transactions
      SET branch_id = (
        SELECT l.branch_id
        FROM loans l
        WHERE l.id = transactions.loan_id
      )
      WHERE branch_id IS NULL
        AND loan_id IS NOT NULL
    `);
    await run(`
      UPDATE collection_actions
      SET branch_id = (
        SELECT l.branch_id
        FROM loans l
        WHERE l.id = collection_actions.loan_id
      )
      WHERE branch_id IS NULL
        AND loan_id IS NOT NULL
    `);
  },
  async down() {
    // Data-fix migration is intentionally irreversible.
  },
};
