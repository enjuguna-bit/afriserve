-- Migration: 20260318000001_postgres_schema_parity
--
-- Brings the Postgres schema into full parity with the SQLite schema and the
-- updated prisma/postgres/schema.prisma.  Every statement is idempotent
-- (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS) so it is safe to re-run.
--
-- Changes:
--   1. loans.purpose              — CBK regulatory reporting field (TEXT nullable)
--   2. loan_products.max_graduated_principal — graduated credit limit cap (DECIMAL nullable)
--   3. repayment_idempotency_keys — M-Pesa dedup table (Postgres-native DDL)
--   4. loan_overpayment_credits   — overpayment credit ledger (Postgres-native DDL)
--
-- Why separate from earlier SQLite migrations:
--   migrations/202603080003 and 202603080004 were written in SQLite syntax
--   (AUTOINCREMENT, REAL, TEXT, datetime()) and cannot run on Postgres.
--   This migration supersedes them for Postgres deployments using proper
--   Postgres types (BIGSERIAL, DECIMAL(18,4), TIMESTAMPTZ).
-- ---------------------------------------------------------------------------

-- ── 1. loans.purpose ────────────────────────────────────────────────────────
ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS purpose TEXT;

-- ── 2. loan_products.max_graduated_principal ────────────────────────────────
ALTER TABLE loan_products
  ADD COLUMN IF NOT EXISTS max_graduated_principal DECIMAL(18,4);

-- ── 3. repayment_idempotency_keys ───────────────────────────────────────────
-- Guarantees that M-Pesa / mobile-money callbacks firing more than once
-- cannot create duplicate repayment records.  The unique constraint on
-- (loan_id, client_idempotency_key) is the source-of-truth dedup lock.
CREATE TABLE IF NOT EXISTS repayment_idempotency_keys (
  id                     BIGSERIAL    PRIMARY KEY,
  loan_id                INTEGER      NOT NULL,
  client_idempotency_key TEXT         NOT NULL,
  repayment_id           INTEGER,
  request_amount         DECIMAL(18,4) NOT NULL,
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_repayment_idempotency_loan
    FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
  CONSTRAINT fk_repayment_idempotency_repayment
    FOREIGN KEY (repayment_id) REFERENCES repayments(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_repayment_idempotency_unique
  ON repayment_idempotency_keys(loan_id, client_idempotency_key);

CREATE INDEX IF NOT EXISTS idx_repayment_idempotency_repayment_id
  ON repayment_idempotency_keys(repayment_id);

-- ── 4. loan_overpayment_credits ─────────────────────────────────────────────
-- When a repayment exceeds the loan balance the surplus is held here as
-- a credit that can be applied to a future loan or refunded.
CREATE TABLE IF NOT EXISTS loan_overpayment_credits (
  id           BIGSERIAL    PRIMARY KEY,
  loan_id      INTEGER      NOT NULL,
  client_id    INTEGER,
  branch_id    INTEGER,
  repayment_id INTEGER      NOT NULL,
  amount       DECIMAL(18,4) NOT NULL,
  status       TEXT         NOT NULL DEFAULT 'open',
  note         TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_overpayment_loan
    FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
  CONSTRAINT fk_overpayment_repayment
    FOREIGN KEY (repayment_id) REFERENCES repayments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_overpayment_credits_loan_id
  ON loan_overpayment_credits(loan_id);

CREATE INDEX IF NOT EXISTS idx_overpayment_credits_repayment_id
  ON loan_overpayment_credits(repayment_id);

CREATE INDEX IF NOT EXISTS idx_overpayment_credits_client_id
  ON loan_overpayment_credits(client_id);

CREATE INDEX IF NOT EXISTS idx_overpayment_credits_status
  ON loan_overpayment_credits(status);
