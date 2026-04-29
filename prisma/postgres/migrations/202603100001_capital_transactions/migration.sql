-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: capital_transactions
-- Purpose:
--   1. New table to track investor/partner/owner deposits and withdrawal requests
--   2. New GL accounts for product-level interest subdivision (5W / 7W / 10W)
--   3. New GL accounts for capital inflows and outflows
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Capital transactions table ─────────────────────────────────────────────
CREATE TABLE "capital_transactions" (
    "id"                         INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "transaction_type"           TEXT    NOT NULL CHECK(transaction_type IN ('deposit', 'withdrawal')),
    "status"                     TEXT    NOT NULL DEFAULT 'pending'
                                         CHECK(status IN ('pending', 'approved', 'rejected', 'cancelled')),
    "amount"                     REAL    NOT NULL CHECK(amount > 0),
    "currency"                   TEXT    NOT NULL DEFAULT 'KES',

    -- Who submitted
    "submitted_by_user_id"       INTEGER NOT NULL,
    "submitted_by_role"          TEXT    NOT NULL,

    -- RBAC scope: which branch this capital belongs to.
    -- For partners this is their assigned branch. For investors/owners this
    -- may be NULL (organisation-wide) or set to a specific branch.
    "branch_id"                  INTEGER,

    -- Approval tracking (finance-only gate)
    "approved_by_user_id"        INTEGER,
    "approved_at"                TEXT,
    "rejected_by_user_id"        INTEGER,
    "rejected_at"                TEXT,
    "rejection_reason"           TEXT,

    -- Cashflow health snapshot at submission time
    "cashflow_net_at_submission" REAL,
    -- If finance approves despite negative cashflow, they must leave a note
    "cashflow_override_note"     TEXT,

    -- GL journal posted on approval (NULL until approved)
    "gl_journal_id"              INTEGER,

    -- Human-readable purpose / reference
    "reference"                  TEXT,
    "note"                       TEXT,

    "created_at"                 TEXT    NOT NULL,
    "updated_at"                 TEXT    NOT NULL,

    CONSTRAINT "capital_tx_submitted_by_fkey"   FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"      ("id") ON DELETE RESTRICT  ON UPDATE CASCADE,
    CONSTRAINT "capital_tx_approved_by_fkey"    FOREIGN KEY ("approved_by_user_id")  REFERENCES "users"      ("id") ON DELETE SET NULL  ON UPDATE CASCADE,
    CONSTRAINT "capital_tx_rejected_by_fkey"    FOREIGN KEY ("rejected_by_user_id")  REFERENCES "users"      ("id") ON DELETE SET NULL  ON UPDATE CASCADE,
    CONSTRAINT "capital_tx_branch_fkey"         FOREIGN KEY ("branch_id")            REFERENCES "branches"   ("id") ON DELETE SET NULL  ON UPDATE CASCADE,
    CONSTRAINT "capital_tx_gl_journal_fkey"     FOREIGN KEY ("gl_journal_id")        REFERENCES "gl_journals"("id") ON DELETE SET NULL  ON UPDATE CASCADE
);

CREATE INDEX "capital_tx_submitted_by_idx"   ON "capital_transactions"("submitted_by_user_id");
CREATE INDEX "capital_tx_branch_id_idx"      ON "capital_transactions"("branch_id");
CREATE INDEX "capital_tx_status_idx"         ON "capital_transactions"("status");
CREATE INDEX "capital_tx_type_idx"           ON "capital_transactions"("transaction_type");
CREATE INDEX "capital_tx_created_at_idx"     ON "capital_transactions"("created_at");

-- ── New GL accounts ────────────────────────────────────────────────────────
-- Product-level interest income sub-accounts (5W / 7W / 10W)
INSERT OR IGNORE INTO "gl_accounts" ("code", "name", "account_type", "is_contra", "is_active", "created_at")
VALUES
    ('INTEREST_INCOME_5W',  'Interest Income — 5-Week Product',  'revenue', 0, 1, datetime('now')),
    ('INTEREST_INCOME_7W',  'Interest Income — 7-Week Product',  'revenue', 0, 1, datetime('now')),
    ('INTEREST_INCOME_10W', 'Interest Income — 10-Week Product', 'revenue', 0, 1, datetime('now')),
    -- Capital flow accounts
    ('CAPITAL_DEPOSIT',    'Capital Deposit',    'equity',  0, 1, datetime('now')),
    ('CAPITAL_WITHDRAWAL', 'Capital Withdrawal', 'equity',  1, 1, datetime('now'));
