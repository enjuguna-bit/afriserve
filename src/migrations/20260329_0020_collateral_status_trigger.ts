export default {
  id: "20260329_0020_collateral_status_trigger",
  async up({ run }: any) {
    await run("DROP TRIGGER IF EXISTS trg_collateral_assets_status_insert");
    await run("DROP TRIGGER IF EXISTS trg_collateral_assets_status_update");

    await run(`
      CREATE TRIGGER IF NOT EXISTS trg_collateral_assets_status_insert
      BEFORE INSERT ON collateral_assets
      FOR EACH ROW
      WHEN NEW.status NOT IN ('active', 'released', 'liquidated')
      BEGIN
        SELECT RAISE(ABORT, 'Invalid collateral status: must be one of active, released, liquidated');
      END
    `);

    await run(`
      CREATE TRIGGER IF NOT EXISTS trg_collateral_assets_status_update
      BEFORE UPDATE OF status ON collateral_assets
      FOR EACH ROW
      WHEN NEW.status NOT IN ('active', 'released', 'liquidated')
      BEGIN
        SELECT RAISE(ABORT, 'Invalid collateral status: must be one of active, released, liquidated');
      END
    `);
  },
  async down() {
    // Forward-only runtime migration.
  },
};
