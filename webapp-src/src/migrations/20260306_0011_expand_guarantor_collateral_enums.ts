export default {
  id: "20260306_0011_expand_guarantor_collateral_enums",
  async up({ run }: any) {
    await run("DROP TRIGGER IF EXISTS trg_loan_guarantors_liability_insert");
    await run("DROP TRIGGER IF EXISTS trg_loan_guarantors_liability_update");
    await run("DROP TRIGGER IF EXISTS trg_collateral_assets_asset_type_insert");
    await run("DROP TRIGGER IF EXISTS trg_collateral_assets_asset_type_update");
    await run("DROP TRIGGER IF EXISTS trg_collateral_assets_ownership_type_insert");
    await run("DROP TRIGGER IF EXISTS trg_collateral_assets_ownership_type_update");

    await run(`
      CREATE TRIGGER IF NOT EXISTS trg_loan_guarantors_liability_insert
      BEFORE INSERT ON loan_guarantors
      FOR EACH ROW
      WHEN NEW.liability_type NOT IN ('individual', 'corporate', 'joint')
      BEGIN
        SELECT RAISE(ABORT, 'Invalid liability type');
      END
    `);

    await run(`
      CREATE TRIGGER IF NOT EXISTS trg_loan_guarantors_liability_update
      BEFORE UPDATE OF liability_type ON loan_guarantors
      FOR EACH ROW
      WHEN NEW.liability_type NOT IN ('individual', 'corporate', 'joint')
      BEGIN
        SELECT RAISE(ABORT, 'Invalid liability type');
      END
    `);

    await run(`
      CREATE TRIGGER IF NOT EXISTS trg_collateral_assets_asset_type_insert
      BEFORE INSERT ON collateral_assets
      FOR EACH ROW
      WHEN NEW.asset_type NOT IN ('chattel', 'vehicle', 'land', 'equipment', 'machinery', 'inventory', 'livestock', 'savings')
      BEGIN
        SELECT RAISE(ABORT, 'Invalid collateral asset type');
      END
    `);

    await run(`
      CREATE TRIGGER IF NOT EXISTS trg_collateral_assets_asset_type_update
      BEFORE UPDATE OF asset_type ON collateral_assets
      FOR EACH ROW
      WHEN NEW.asset_type NOT IN ('chattel', 'vehicle', 'land', 'equipment', 'machinery', 'inventory', 'livestock', 'savings')
      BEGIN
        SELECT RAISE(ABORT, 'Invalid collateral asset type');
      END
    `);

    await run(`
      CREATE TRIGGER IF NOT EXISTS trg_collateral_assets_ownership_type_insert
      BEFORE INSERT ON collateral_assets
      FOR EACH ROW
      WHEN NEW.ownership_type NOT IN ('client', 'guarantor', 'third_party')
      BEGIN
        SELECT RAISE(ABORT, 'Invalid ownership type');
      END
    `);

    await run(`
      CREATE TRIGGER IF NOT EXISTS trg_collateral_assets_ownership_type_update
      BEFORE UPDATE OF ownership_type ON collateral_assets
      FOR EACH ROW
      WHEN NEW.ownership_type NOT IN ('client', 'guarantor', 'third_party')
      BEGIN
        SELECT RAISE(ABORT, 'Invalid ownership type');
      END
    `);
  },
  async down() {
    // Forward-only runtime migration.
  },
};