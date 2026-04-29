CREATE TABLE IF NOT EXISTS "loan_overpayment_credits" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "loan_id" INTEGER NOT NULL,
  "client_id" INTEGER,
  "branch_id" INTEGER,
  "repayment_id" INTEGER NOT NULL,
  "amount" REAL NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "note" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  "updated_at" TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY ("repayment_id") REFERENCES "repayments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_loan_overpayment_credit_repayment_id"
ON "loan_overpayment_credits"("repayment_id");

CREATE INDEX IF NOT EXISTS "idx_loan_overpayment_credit_loan_id"
ON "loan_overpayment_credits"("loan_id");

CREATE INDEX IF NOT EXISTS "idx_loan_overpayment_credit_client_id"
ON "loan_overpayment_credits"("client_id");
