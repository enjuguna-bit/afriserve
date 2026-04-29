-- Migration: 202603200001_gl_accounting_batches
--
-- Production health/details is reporting:
--   accountingPeriodClose.lastError = relation "gl_accounting_batches" does not exist
--
-- SQLite bootstrap already creates this table, but Postgres deployments were
-- missing the equivalent DDL. This migration restores parity and is idempotent
-- so it is safe to run on environments that may already have the table.

CREATE TABLE IF NOT EXISTS gl_accounting_batches (
  id                   BIGSERIAL   PRIMARY KEY,
  batch_type           TEXT        NOT NULL,
  effective_date       TIMESTAMPTZ NOT NULL,
  status               TEXT        NOT NULL DEFAULT 'pending',
  triggered_by_user_id INTEGER,
  note                 TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_gl_accounting_batches_type_effective_date
  ON gl_accounting_batches(batch_type, effective_date);

CREATE INDEX IF NOT EXISTS idx_gl_accounting_batches_type_date
  ON gl_accounting_batches(batch_type, effective_date);

CREATE INDEX IF NOT EXISTS idx_gl_accounting_batches_status
  ON gl_accounting_batches(status);

CREATE INDEX IF NOT EXISTS idx_gl_accounting_batches_triggered_by
  ON gl_accounting_batches(triggered_by_user_id);
