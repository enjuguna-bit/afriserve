DROP TRIGGER IF EXISTS trg_loan_guarantors_liability_insert;
DROP TRIGGER IF EXISTS trg_loan_guarantors_liability_update;
DROP TRIGGER IF EXISTS trg_collateral_assets_asset_type_insert;
DROP TRIGGER IF EXISTS trg_collateral_assets_asset_type_update;
DROP TRIGGER IF EXISTS trg_collateral_assets_ownership_type_insert;
DROP TRIGGER IF EXISTS trg_collateral_assets_ownership_type_update;

CREATE TRIGGER IF NOT EXISTS trg_loan_guarantors_liability_insert
BEFORE INSERT ON "loan_guarantors"
FOR EACH ROW
WHEN NEW."liability_type" NOT IN ('individual', 'corporate', 'joint')
BEGIN
  SELECT RAISE(ABORT, 'Invalid liability type');
END;

CREATE TRIGGER IF NOT EXISTS trg_loan_guarantors_liability_update
BEFORE UPDATE OF "liability_type" ON "loan_guarantors"
FOR EACH ROW
WHEN NEW."liability_type" NOT IN ('individual', 'corporate', 'joint')
BEGIN
  SELECT RAISE(ABORT, 'Invalid liability type');
END;

CREATE TRIGGER IF NOT EXISTS trg_collateral_assets_asset_type_insert
BEFORE INSERT ON "collateral_assets"
FOR EACH ROW
WHEN NEW."asset_type" NOT IN ('chattel', 'vehicle', 'land', 'equipment', 'machinery', 'inventory', 'livestock', 'savings')
BEGIN
  SELECT RAISE(ABORT, 'Invalid collateral asset type');
END;

CREATE TRIGGER IF NOT EXISTS trg_collateral_assets_asset_type_update
BEFORE UPDATE OF "asset_type" ON "collateral_assets"
FOR EACH ROW
WHEN NEW."asset_type" NOT IN ('chattel', 'vehicle', 'land', 'equipment', 'machinery', 'inventory', 'livestock', 'savings')
BEGIN
  SELECT RAISE(ABORT, 'Invalid collateral asset type');
END;

CREATE TRIGGER IF NOT EXISTS trg_collateral_assets_ownership_type_insert
BEFORE INSERT ON "collateral_assets"
FOR EACH ROW
WHEN NEW."ownership_type" NOT IN ('client', 'guarantor', 'third_party')
BEGIN
  SELECT RAISE(ABORT, 'Invalid ownership type');
END;

CREATE TRIGGER IF NOT EXISTS trg_collateral_assets_ownership_type_update
BEFORE UPDATE OF "ownership_type" ON "collateral_assets"
FOR EACH ROW
WHEN NEW."ownership_type" NOT IN ('client', 'guarantor', 'third_party')
BEGIN
  SELECT RAISE(ABORT, 'Invalid ownership type');
END;