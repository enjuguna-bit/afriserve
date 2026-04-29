# Migration strategy

## Canonical path

Production schema changes should ship through reviewed Prisma SQL migrations under:

- `prisma/migrations/` for SQLite compatibility
- `prisma/postgres/migrations/` for Postgres production deployments

Runtime compatibility helpers in `src/db/schema.ts` and legacy JS migrations in `src/migrations/` still exist to keep local bootstraps and older environments working, but they are not the source of truth for production rollout planning.

## Deployment order

1. Build artifacts and generate Prisma clients.
2. Review the forward migration SQL for both SQLite and Postgres paths.
3. Apply migrations in staging with production-like data volume.
4. Verify application startup, health checks, and critical loan workflows.
5. Promote the same migration set to production.

## Rollback stance

Prisma migrations are append-only by default. The rollback plan is therefore operational, not automatic:

1. Stop rollout traffic to the affected version.
2. Restore application code to the last known-good release.
3. Follow the runbook in [`docs/runbooks/migration-rollback.md`](./runbooks/migration-rollback.md).
4. Ship a compensating forward migration if the failed migration cannot be safely reversed in place.

## Release checklist

- Confirm a recent database backup or snapshot exists.
- Confirm the migration has a tested rollback path.
- Confirm `ci.yml` passed against Postgres, not just SQLite.
- Confirm any new tenant-scoped tables include `tenant_id`, indexes, and RLS coverage.
- Confirm on-call engineers know which dashboards, traces, and alert rules to watch during rollout.
