CREATE INDEX IF NOT EXISTS "idx_loans_external_reference"
ON "loans" ("external_reference");

CREATE INDEX IF NOT EXISTS "idx_repayments_external_reference"
ON "repayments" ("external_reference");
