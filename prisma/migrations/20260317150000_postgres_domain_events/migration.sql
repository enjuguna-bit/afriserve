-- Migration: create domain_events outbox table for Postgres
--
-- The domain_events table is used by domainEventService.ts as a transactional
-- outbox for at-least-once event delivery. It was created in the SQLite runtime
-- migration (20260305_0008_domain_events_tenancy) but was never added to the
-- Postgres migration set.
--
-- This migration is idempotent (CREATE TABLE IF NOT EXISTS).
--
-- The table is intentionally NOT managed by Prisma (no model in schema.prisma)
-- because domainEventService.ts uses raw SQL for maximum compatibility between
-- SQLite and Postgres.

CREATE TABLE IF NOT EXISTS domain_events (
  id               BIGSERIAL PRIMARY KEY,
  tenant_id        TEXT        NOT NULL DEFAULT 'default',
  event_type       TEXT        NOT NULL,
  aggregate_type   TEXT        NOT NULL,
  aggregate_id     BIGINT,
  payload_json     TEXT        NOT NULL DEFAULT '{}',
  metadata_json    TEXT        NOT NULL DEFAULT '{}',
  status           TEXT        NOT NULL DEFAULT 'pending',
  attempt_count    INTEGER     NOT NULL DEFAULT 0,
  last_error       TEXT,
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes matching the query patterns in domainEventService.dispatchPendingEvents
CREATE INDEX IF NOT EXISTS idx_domain_events_status_id
  ON domain_events(status, id);

CREATE INDEX IF NOT EXISTS idx_domain_events_tenant_status
  ON domain_events(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_domain_events_type_created_at
  ON domain_events(event_type, created_at);

-- Seed the default tenant row that domain_events references via FK in SQLite.
-- In Postgres we keep this as a lightweight reference table; no FK constraint
-- is added to domain_events here to keep the outbox append-only and fast.
CREATE TABLE IF NOT EXISTS tenants (
  id         TEXT        PRIMARY KEY,
  name       TEXT        NOT NULL,
  status     TEXT        NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO tenants (id, name, status)
VALUES ('default', 'Default Tenant', 'active')
ON CONFLICT (id) DO NOTHING;
