-- Expand user-role integrity trigger to include investor and partner roles.
DROP TRIGGER IF EXISTS trg_users_role_check_insert;
DROP TRIGGER IF EXISTS trg_users_role_check_update;

CREATE TRIGGER IF NOT EXISTS trg_users_role_check_insert
BEFORE INSERT ON "users"
FOR EACH ROW
WHEN NEW."role" NOT IN ('admin', 'ceo', 'finance', 'investor', 'partner', 'operations_manager', 'it', 'area_manager', 'loan_officer', 'cashier')
BEGIN
  SELECT RAISE(ABORT, 'Invalid user role');
END;

CREATE TRIGGER IF NOT EXISTS trg_users_role_check_update
BEFORE UPDATE OF "role" ON "users"
FOR EACH ROW
WHEN NEW."role" NOT IN ('admin', 'ceo', 'finance', 'investor', 'partner', 'operations_manager', 'it', 'area_manager', 'loan_officer', 'cashier')
BEGIN
  SELECT RAISE(ABORT, 'Invalid user role');
END;
