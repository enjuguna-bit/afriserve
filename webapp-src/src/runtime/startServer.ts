import { assertEnvironment } from "../config/env.js";
import { createBootstrapContext } from "../config/bootstrap.js";
import { createApp } from "../app/createApp.js";
import { createStatusService } from "./statusService.js";
import { createLifecycle } from "./lifecycle.js";
import { createSystemJobs } from "./systemJobs.js";
type StartServerOptions = {
  env?: NodeJS.ProcessEnv;
};

async function startServer(options: StartServerOptions = {}): Promise<void> {
  const env = options.env || process.env;
  const startedAt = new Date();
  let envValidation: { warnings: unknown[]; errors?: unknown[] } = { warnings: [] };

  const bootstrap = await createBootstrapContext({ env });
  const { config, db, services, middleware, routeDepsBase, buildConfigStatus } = bootstrap;
  const {
    logger,
    errorTracker,
    metrics,
    reportCache,
    documentStorage,
    scheduledReportService,
    domainEventService,
    serviceRegistry,
  } = services;
  const mobileMoneyService = serviceRegistry?.loan?.mobileMoneyService || null;
  const { generalApiLimiter, errorHandler } = middleware;

  const {
    overdueSyncJob,
    backupJob,
    reportDeliveryJob,
    maintenanceCleanupJob,
    accountingPeriodCloseJob,
    domainEventDispatchJob,
    b2cCoreDisbursementJob,
    queueOrchestrator,
  } = createSystemJobs({
    config,
    db,
    services: {
      logger,
      metrics,
      scheduledReportService,
      domainEventService,
      mobileMoneyService,
      serviceRegistry,
    },
  });

  const statusService = createStatusService({
    config,
    dbGet: db.get,
    metrics,
    buildConfigStatus,
    overdueSyncJob,
    backupJob,
    reportDeliveryJob,
    maintenanceCleanupJob,
    accountingPeriodCloseJob,
    domainEventDispatchJob,
    b2cCoreDisbursementJob,
    startedAt,
    env,
    logger,
    getEnvValidation: () => envValidation,
  });

  const routeDeps = {
    ...routeDepsBase,
    getConfigStatus: statusService.getConfigStatus,
    getRuntimeStatus: statusService.getRuntimeStatus,
    runDatabaseBackup: () => backupJob.runOnce(),
  };

  const app = createApp({
    logger,
    metrics,
    documentStorage,
    generalApiLimiter,
    errorHandler,
    routeDeps,
  });

  const lifecycle = createLifecycle({
    app,
    logger,
    config,
    db,
    reportCache,
    overdueSyncJob,
    backupJob,
    reportDeliveryJob,
    maintenanceCleanupJob,
    accountingPeriodCloseJob,
    domainEventDispatchJob,
    b2cCoreDisbursementJob,
    queueOrchestrator,
    errorTracker,
    validateEnvironment: () => assertEnvironment(env),
    onEnvironmentValidated: (validation: { warnings?: unknown[]; errors?: unknown[] }) => {
      envValidation = {
        warnings: Array.isArray(validation?.warnings) ? validation.warnings : [],
        errors: Array.isArray(validation?.errors) ? validation.errors : undefined,
      };
    },
    logEnvironmentStatus: statusService.logEnvironmentStatus,
  });

  await lifecycle.start();
}

export {
  startServer,
};
