-- Hotfix: backfill historical Postgres environments where the loans table was
-- created before the Prisma model added nullable runtime columns used by the
-- current Prisma client.
ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ(3);

ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS written_off_at TIMESTAMPTZ(3);

UPDATE loans
SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
WHERE updated_at IS NULL;
