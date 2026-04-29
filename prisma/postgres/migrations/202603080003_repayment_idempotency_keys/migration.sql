CREATE TABLE IF NOT EXISTS "repayment_idempotency_keys" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "loan_id" INTEGER NOT NULL,
  "client_idempotency_key" TEXT NOT NULL,
  "request_amount" REAL NOT NULL,
  "repayment_id" INTEGER,
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  "updated_at" TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("repayment_id") REFERENCES "repayments"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_repayment_idempotency_unique"
ON "repayment_idempotency_keys"("loan_id", "client_idempotency_key");

CREATE INDEX IF NOT EXISTS "idx_repayment_idempotency_repayment_id"
ON "repayment_idempotency_keys"("repayment_id");
