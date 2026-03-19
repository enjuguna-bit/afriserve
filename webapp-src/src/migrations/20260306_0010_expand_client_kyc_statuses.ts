export default {
  id: "20260306_0010_expand_client_kyc_statuses",
  async up({ run }: any) {
    await run("DROP TRIGGER IF EXISTS trg_clients_kyc_status_insert");
    await run("DROP TRIGGER IF EXISTS trg_clients_kyc_status_update");

    await run(`
      CREATE TRIGGER IF NOT EXISTS trg_clients_kyc_status_insert
      BEFORE INSERT ON clients
      FOR EACH ROW
      WHEN NEW.kyc_status NOT IN ('pending', 'in_review', 'verified', 'rejected', 'suspended')
      BEGIN
        SELECT RAISE(ABORT, 'Invalid KYC status');
      END
    `);

    await run(`
      CREATE TRIGGER IF NOT EXISTS trg_clients_kyc_status_update
      BEFORE UPDATE OF kyc_status ON clients
      FOR EACH ROW
      WHEN NEW.kyc_status NOT IN ('pending', 'in_review', 'verified', 'rejected', 'suspended')
      BEGIN
        SELECT RAISE(ABORT, 'Invalid KYC status');
      END
    `);
  },
  async down() {
    // Forward-only runtime migration.
  },
};
