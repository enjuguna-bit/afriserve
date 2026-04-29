# Migration rollback runbook

## When to use this

Use this runbook when a freshly deployed database migration causes startup failures, query regressions, bad data writes, or broken loan workflows.

## Preconditions

- A recent production backup or database snapshot exists.
- The last known-good application release is still available for redeploy.
- The engineer running the rollback has permission to pause traffic and access the primary database.

## Immediate containment

1. Pause rollout traffic to the new release.
2. Stop background workers that could keep writing into partially migrated tables.
3. Capture the failing migration name, error output, and deployment timestamp.

## Decide the rollback mode

### Mode A: code rollback only

Use this when the schema change is backward compatible and the previous application version can still run safely on the new schema.

1. Redeploy the last known-good application build.
2. Keep the migration in place.
3. Open a follow-up task for a compensating migration if cleanup is needed.

### Mode B: database restore

Use this when the migration changed data incorrectly, dropped required behavior, or is not backward compatible.

1. Put the application in maintenance mode.
2. Restore the database from the last clean backup or managed snapshot.
3. Redeploy the last known-good application build.
4. Run smoke tests for:
   - authentication
   - loan creation and approval
   - repayment posting
   - reports and metrics

### Mode C: compensating forward migration

Use this when a full restore would lose too much valid post-deploy data.

1. Write a new reviewed migration that repairs schema or data in place.
2. Test it on a production-like snapshot before touching production.
3. Apply the compensating migration.
4. Redeploy the corrected application build.

## Post-rollback checks

- `/health` and `/ready` return healthy.
- Prometheus alerts for DB pool exhaustion and background-task failures are quiet.
- OpenTelemetry traces show healthy request latency for core endpoints.
- No new payment failures are appearing in `microfinance_payment_failure_total`.

## What to record

- migration identifier
- affected release version
- exact rollback mode used
- backup or snapshot identifier
- data-loss assessment
- follow-up action items
