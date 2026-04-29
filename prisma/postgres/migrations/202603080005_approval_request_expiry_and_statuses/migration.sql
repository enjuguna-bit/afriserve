ALTER TABLE "approval_requests"
ADD COLUMN "expires_at" TEXT;

UPDATE "approval_requests"
SET "expires_at" = DATETIME(COALESCE("requested_at", "created_at"), '+7 days')
WHERE "expires_at" IS NULL
  AND "status" = 'pending';

UPDATE "approval_requests"
SET
  "status" = 'expired',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "status" = 'pending'
  AND "expires_at" IS NOT NULL
  AND "expires_at" < CURRENT_TIMESTAMP;

DROP TRIGGER IF EXISTS trg_approval_status_insert;
DROP TRIGGER IF EXISTS trg_approval_status_update;

CREATE TRIGGER IF NOT EXISTS trg_approval_status_insert
BEFORE INSERT ON "approval_requests"
FOR EACH ROW
WHEN NEW."status" NOT IN ('pending', 'approved', 'rejected', 'cancelled', 'expired')
BEGIN
  SELECT RAISE(ABORT, 'Invalid approval status');
END;

CREATE TRIGGER IF NOT EXISTS trg_approval_status_update
BEFORE UPDATE OF "status" ON "approval_requests"
FOR EACH ROW
WHEN NEW."status" NOT IN ('pending', 'approved', 'rejected', 'cancelled', 'expired')
BEGIN
  SELECT RAISE(ABORT, 'Invalid approval status');
END;

CREATE INDEX IF NOT EXISTS "approval_requests_expires_at_idx"
ON "approval_requests" ("expires_at");
