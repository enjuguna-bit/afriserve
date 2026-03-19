ALTER TABLE "clients" ADD COLUMN "onboarding_status" TEXT NOT NULL DEFAULT 'registered';
ALTER TABLE "clients" ADD COLUMN "fee_payment_status" TEXT NOT NULL DEFAULT 'unpaid';
ALTER TABLE "clients" ADD COLUMN "fees_paid_at" TEXT;

ALTER TABLE "guarantors" ADD COLUMN "client_id" INTEGER REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "collateral_assets" ADD COLUMN "client_id" INTEGER REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "guarantors_client_id_idx"
ON "guarantors"("client_id");

CREATE INDEX "collateral_assets_client_id_idx"
ON "collateral_assets"("client_id");
