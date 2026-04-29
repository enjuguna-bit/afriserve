DROP TRIGGER IF EXISTS trg_clients_kyc_status_insert;
DROP TRIGGER IF EXISTS trg_clients_kyc_status_update;

CREATE TRIGGER IF NOT EXISTS trg_clients_kyc_status_insert
BEFORE INSERT ON "clients"
FOR EACH ROW
WHEN NEW."kyc_status" NOT IN ('pending', 'in_review', 'verified', 'rejected', 'suspended')
BEGIN
  SELECT RAISE(ABORT, 'Invalid KYC status');
END;

CREATE TRIGGER IF NOT EXISTS trg_clients_kyc_status_update
BEFORE UPDATE OF "kyc_status" ON "clients"
FOR EACH ROW
WHEN NEW."kyc_status" NOT IN ('pending', 'in_review', 'verified', 'rejected', 'suspended')
BEGIN
  SELECT RAISE(ABORT, 'Invalid KYC status');
END;
