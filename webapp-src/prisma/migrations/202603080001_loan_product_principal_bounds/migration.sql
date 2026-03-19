ALTER TABLE "loan_products"
ADD COLUMN "min_principal" REAL NOT NULL DEFAULT 1;

ALTER TABLE "loan_products"
ADD COLUMN "max_principal" REAL NOT NULL DEFAULT 1000000;
