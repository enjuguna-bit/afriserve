import { createAccountingPeriodCloseJob } from "../jobs/accountingPeriodClose.js";
import { createBackupJob } from "../jobs/backup.js";
import { createB2CCoreDisbursementJob } from "../jobs/b2cCoreDisbursement.js";
import { createDomainEventDispatchJob } from "../jobs/domainEventDispatch.js";
import { createMaintenanceCleanupJob } from "../jobs/maintenanceCleanup.js";
import { createOverdueSyncJob } from "../jobs/overdueSync.js";
import { createQueueOrchestrator } from "../jobs/queueOrchestrator.js";
import { createReportDeliveryJob } from "../jobs/reportDelivery.js";

type SystemJobsOptions = {
  config: Record<string, any>;
  db: Record<string, any>;
  services: Record<string, any>;
  queueRoleOverrides?: {
    schedulerEnabled?: boolean;
    workerEnabled?: boolean;
  };
};

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

  const overdueSyncJob = createOverdueSyncJob({
    run: db.run,
    get: db.get,
    all: db.all,
    executeTransaction: db.executeTransaction,
    logger,
    metrics,
    intervalMs: config.overdueSyncIntervalMs,
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
        runOnce: () => overdueSyncJob.runOnce(),
      },
      {
        name: "database-backup",
        intervalMs: config.backupIntervalMs,
        enabled: config.backupsEnabled,
        runOnce: () => backupJob.runOnce(),
      },
      {
        name: "report-delivery",
        intervalMs: config.reportDeliveryIntervalMs,
        enabled: config.reportDeliveryEnabled,
        runOnce: () => reportDeliveryJob.runOnce(),
      },
      {
        name: "domain-event-dispatch",
        intervalMs: config.domainEventDispatchIntervalMs,
        enabled: config.domainEventDispatchEnabled,
        runOnce: () => domainEventDispatchJob.runOnce(),
      },
      {
        name: "maintenance-cleanup",
        intervalMs: config.maintenanceCleanupIntervalMs,
        enabled: true,
        runOnce: () => maintenanceCleanupJob.runOnce(),
      },
      {
        name: "accounting-period-close",
        intervalMs: config.accountingBatchIntervalMs,
        enabled: config.accountingBatchEnabled,
        runOnce: () => accountingPeriodCloseJob.runOnce(),
      },
      {
        name: "b2c-core-disbursement",
        intervalMs: config.mobileMoneyB2CCoreRetryIntervalMs,
        enabled: config.mobileMoneyB2CCoreRetryEnabled && config.mobileMoneyB2CEnabled,
        runOnce: () => b2cCoreDisbursementJob.runOnce(),
      },
    ],
  });

  return {
    overdueSyncJob,
    backupJob,
    reportDeliveryJob,
    maintenanceCleanupJob,
    accountingPeriodCloseJob,
    domainEventDispatchJob,
    b2cCoreDisbursementJob,
    queueOrchestrator,
  };
}

export {
  createSystemJobs,
};
