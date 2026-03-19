/**
 * systemJobs.ts — wires all background jobs and the queue orchestrator.
 *
 * ── Tenant context for background jobs ──────────────────────────────────────
 * Every job's runOnce() is wrapped in runWithTenant(defaultTenantId, fn).
 * This ensures that:
 *   1. The AsyncLocalStorage tenant context is set before any DB query fires.
 *   2. The Prisma $use hook (prismaClient.ts) can call getCurrentTenantId() and
 *      SET app.tenant_id on the Postgres connection for RLS enforcement.
 *   3. In single-tenant deployments, defaultTenantId is 'default' — all rows
 *      visible, no behaviour change.
 *   4. When RLS is active (docs/sql/postgres-tenant-rls.sql applied), a job
 *      that runs without tenant context would see 0 rows and silently do
 *      nothing — this wrap prevents that failure mode.
 *
 * For true multi-tenant deployments where each tenant needs its own job run
 * (e.g. run overdueSync per-tenant), the orchestrator loop should be extended
 * to enumerate tenants from the tenants table and call runWithTenant per
 * tenant. That is tracked separately. This fix provides the single-tenant
 * and 'default' tenant correctness baseline.
 */
import { createAccountingPeriodCloseJob } from "../jobs/accountingPeriodClose.js";
import { createBackupJob } from "../jobs/backup.js";
import { createB2CCoreDisbursementJob } from "../jobs/b2cCoreDisbursement.js";
import { createDomainEventDispatchJob } from "../jobs/domainEventDispatch.js";
import { createMaintenanceCleanupJob } from "../jobs/maintenanceCleanup.js";
import { createOverdueSyncJob } from "../jobs/overdueSync.js";
import { createQueueOrchestrator } from "../jobs/queueOrchestrator.js";
import { createReportDeliveryJob } from "../jobs/reportDelivery.js";
import { runWithTenant, DEFAULT_TENANT } from "../utils/tenantStore.js";

type SystemJobsOptions = {
  config: Record<string, any>;
  db: Record<string, any>;
  services: Record<string, any>;
  queueRoleOverrides?: {
    schedulerEnabled?: boolean;
    workerEnabled?: boolean;
  };
};

/**
 * Wraps a no-arg async function so it always executes inside a tenant context.
 * Uses the configured default tenant ID (falls back to the module constant).
 */
function withTenantContext(
  tenantId: string,
  fn: () => Promise<unknown>,
): () => Promise<unknown> {
  return () => runWithTenant(tenantId, fn);
}

function createSystemJobs(options: SystemJobsOptions) {
  const {
    config,
    db,
    services,
    queueRoleOverrides = {},
  } = options;

  const {
    logger,
    metrics,
    scheduledReportService,
    domainEventService,
    serviceRegistry,
    mobileMoneyService,
  } = services;

  const resolvedMobileMoneyService = mobileMoneyService
    || serviceRegistry?.loan?.mobileMoneyService
    || null;

  const schedulerEnabled = typeof queueRoleOverrides.schedulerEnabled === "boolean"
    ? queueRoleOverrides.schedulerEnabled
    : Boolean(config.jobQueueSchedulerEnabled);

  const workerEnabled = typeof queueRoleOverrides.workerEnabled === "boolean"
    ? queueRoleOverrides.workerEnabled
    : Boolean(config.jobQueueWorkerEnabled);

  // The tenant ID used for all background jobs.
  // In single-tenant mode this is always 'default'.
  // In multi-tenant mode, override via DEFAULT_TENANT_ID env var or extend
  // the orchestrator to loop per-tenant (see module comment above).
  const jobTenantId: string = String(config.defaultTenantId || DEFAULT_TENANT).trim() || DEFAULT_TENANT;

  // Gap 12: inject loanRepository + eventBus so overdueSync promotes loans
  // through the Loan aggregate and emits LoanMarkedOverdue domain events.
  const loanRepository = serviceRegistry?.loan?.loanRepository ?? null;
  const eventBus       = serviceRegistry?.loan?.eventBus ?? null;

  const overdueSyncJob = createOverdueSyncJob({
    run: db.run,
    get: db.get,
    all: db.all,
    executeTransaction: db.executeTransaction,
    logger,
    metrics,
    intervalMs: config.overdueSyncIntervalMs,
    loanRepository,
    eventBus,
  });

  const backupJob = createBackupJob({
    backupDatabase: db.backupDatabase,
    logger,
    metrics,
    enabled: config.backupsEnabled,
    intervalMs: config.backupIntervalMs,
    retentionCount: config.backupRetentionCount,
    backupDirectory: config.backupDirectory,
  });

  const reportDeliveryJob = createReportDeliveryJob({
    scheduledReportService,
    logger,
    metrics,
    enabled: config.reportDeliveryEnabled,
    requested: config.reportDeliveryRequested,
    intervalMs: config.reportDeliveryIntervalMs,
    recipientEmail: config.reportDeliveryRecipientEmail,
    webhookUrl: config.reportDeliveryWebhookUrl,
    webhookTimeoutMs: config.reportDeliveryWebhookTimeoutMs,
  });

  const maintenanceCleanupJob = createMaintenanceCleanupJob({
    run: db.run,
    get: db.get,
    all: db.all,
    logger,
    metrics,
    enabled: true,
    intervalMs: config.maintenanceCleanupIntervalMs,
    archiveClosedLoansOlderThanYears: config.archiveClosedLoansAfterYears,
    purgeSoftDeletedClientsOlderThanDays: config.purgeSoftDeletedClientsAfterDays,
  });

  const accountingPeriodCloseJob = createAccountingPeriodCloseJob({
    run: db.run,
    get: db.get,
    all: db.all,
    executeTransaction: db.executeTransaction,
    logger,
    metrics,
    enabled: config.accountingBatchEnabled,
    intervalMs: config.accountingBatchIntervalMs,
    systemUserId: null,
  });

  const domainEventDispatchJob = createDomainEventDispatchJob({
    domainEventService,
    logger,
    metrics,
    enabled: Boolean(config.domainEventDispatchEnabled),
    intervalMs: config.domainEventDispatchIntervalMs,
    batchSize: config.domainEventDispatchBatchSize,
  });

  const b2cCoreDisbursementJob = createB2CCoreDisbursementJob({
    mobileMoneyService: resolvedMobileMoneyService,
    logger,
    metrics,
    enabled: Boolean(config.mobileMoneyB2CCoreRetryEnabled) && Boolean(config.mobileMoneyB2CEnabled),
    intervalMs: config.mobileMoneyB2CCoreRetryIntervalMs,
    batchSize: config.mobileMoneyB2CCoreRetryBatchSize,
    minAgeMs: config.mobileMoneyB2CCoreRetryMinAgeMs,
  });

  // ── Tenant-aware runOnce wrappers ────────────────────────────────────────
  // These are what the queue orchestrator (and any direct callers) should use.
  // Each one wraps the underlying job's runOnce in a tenant context so all DB
  // queries issued by the job run under the correct app.tenant_id session
  // variable for Postgres RLS.
  //
  // The original job objects are returned below as-is so their start()/stop()
  // methods work for standalone (non-queue) timer-based deployments. Their
  // runOnce() methods are also wrapped here and shadowed on the returned
  // objects so standalone invocations are also tenant-aware.
  const tenantAwareRunOnce = {
    overdueSyncJob:           withTenantContext(jobTenantId, () => overdueSyncJob.runOnce()),
    backupJob:                withTenantContext(jobTenantId, () => backupJob.runOnce()),
    reportDeliveryJob:        withTenantContext(jobTenantId, () => reportDeliveryJob.runOnce()),
    maintenanceCleanupJob:    withTenantContext(jobTenantId, () => maintenanceCleanupJob.runOnce()),
    accountingPeriodCloseJob: withTenantContext(jobTenantId, () => accountingPeriodCloseJob.runOnce()),
    domainEventDispatchJob:   withTenantContext(jobTenantId, () => domainEventDispatchJob.runOnce()),
    b2cCoreDisbursementJob:   withTenantContext(jobTenantId, () => b2cCoreDisbursementJob.runOnce()),
  };

  const queueOrchestrator = createQueueOrchestrator({
    enabled: config.jobQueueEnabled,
    schedulerEnabled,
    workerEnabled,
    redisUrl: config.jobQueueRedisUrl,
    queueName: config.jobQueueName,
    deadLetterQueueName: config.jobQueueDeadLetterQueueName,
    concurrency: config.jobQueueConcurrency,
    attempts: config.jobQueueAttempts,
    deadLetterInspectIntervalMs: config.jobQueueDlqInspectIntervalMs,
    deadLetterAlertThreshold: config.jobQueueDlqAlertThreshold,
    deadLetterAutoRetryBatchSize: config.jobQueueDlqRetryBatchSize,
    logger,
    metrics,
    jobs: [
      {
        name: "overdue-sync",
        intervalMs: config.overdueSyncIntervalMs,
        enabled: true,
        runOnce: tenantAwareRunOnce.overdueSyncJob,
      },
      {
        name: "database-backup",
        intervalMs: config.backupIntervalMs,
        enabled: config.backupsEnabled,
        runOnce: tenantAwareRunOnce.backupJob,
      },
      {
        name: "report-delivery",
        intervalMs: config.reportDeliveryIntervalMs,
        enabled: config.reportDeliveryEnabled,
        runOnce: tenantAwareRunOnce.reportDeliveryJob,
      },
      {
        name: "domain-event-dispatch",
        intervalMs: config.domainEventDispatchIntervalMs,
        enabled: config.domainEventDispatchEnabled,
        runOnce: tenantAwareRunOnce.domainEventDispatchJob,
      },
      {
        name: "maintenance-cleanup",
        intervalMs: config.maintenanceCleanupIntervalMs,
        enabled: true,
        runOnce: tenantAwareRunOnce.maintenanceCleanupJob,
      },
      {
        name: "accounting-period-close",
        intervalMs: config.accountingBatchIntervalMs,
        enabled: config.accountingBatchEnabled,
        runOnce: tenantAwareRunOnce.accountingPeriodCloseJob,
      },
      {
        name: "b2c-core-disbursement",
        intervalMs: config.mobileMoneyB2CCoreRetryIntervalMs,
        enabled: config.mobileMoneyB2CCoreRetryEnabled && config.mobileMoneyB2CEnabled,
        runOnce: tenantAwareRunOnce.b2cCoreDisbursementJob,
      },
    ],
  });

  // Return jobs with runOnce shadowed to the tenant-aware version so that
  // callers using start()/stop() for standalone timer-based scheduling also
  // get the tenant context on every tick.
  return {
    overdueSyncJob:           { ...overdueSyncJob,           runOnce: tenantAwareRunOnce.overdueSyncJob },
    backupJob:                { ...backupJob,                runOnce: tenantAwareRunOnce.backupJob },
    reportDeliveryJob:        { ...reportDeliveryJob,        runOnce: tenantAwareRunOnce.reportDeliveryJob },
    maintenanceCleanupJob:    { ...maintenanceCleanupJob,    runOnce: tenantAwareRunOnce.maintenanceCleanupJob },
    accountingPeriodCloseJob: { ...accountingPeriodCloseJob, runOnce: tenantAwareRunOnce.accountingPeriodCloseJob },
    domainEventDispatchJob:   { ...domainEventDispatchJob,   runOnce: tenantAwareRunOnce.domainEventDispatchJob },
    b2cCoreDisbursementJob:   { ...b2cCoreDisbursementJob,   runOnce: tenantAwareRunOnce.b2cCoreDisbursementJob },
    queueOrchestrator,
  };
}

export {
  createSystemJobs,
};
