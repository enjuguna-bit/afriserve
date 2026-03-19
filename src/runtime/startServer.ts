import { assertEnvironment } from "../config/env.js";
import { createBootstrapContext } from "../config/bootstrap.js";
import { createApp } from "../app/createApp.js";
import { createStatusService } from "./statusService.js";
import { createLifecycle } from "./lifecycle.js";
import { createSystemJobs } from "./systemJobs.js";

function createRedisConnectivityCheck(redisUrl: string) {
  return async function checkRedisConnectivity() {
    const startedAtMs = Date.now();
    try {
      const { Redis } = await import("ioredis");
      const client = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 3000,
      });
      await client.connect();
      await client.ping();
      const durationMs = Date.now() - startedAtMs;
      await client.quit();
      return { ok: true, durationMs, checkedAt: new Date().toISOString(), error: null };
    } catch (error: unknown) {
      const durationMs = Date.now() - startedAtMs;
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { ok: false, durationMs, checkedAt: new Date().toISOString(), error: errorMessage };
    }
  };
}

type StartServerOptions = {
  env?: NodeJS.ProcessEnv;
};

async function startServer(options: StartServerOptions = {}): Promise<void> {
  const env = options.env || process.env;
  const startedAt = new Date();
  let envValidation: { warnings: unknown[]; errors?: unknown[] } = { warnings: [] };

  const bootstrap = await createBootstrapContext({ env });
  const {
    config,
    db,
    services,
    middleware,
    routeDepsBase,
    buildConfigStatus,
    stopConsumers,
  } = bootstrap;
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

  const primaryRedisUrl = String(
    env.AUTH_TOKEN_STORE_REDIS_URL || env.REDIS_URL || "",
  ).trim();
  const queueRedisUrl = String(
    env.JOB_QUEUE_REDIS_URL || env.REDIS_URL || env.AUTH_TOKEN_STORE_REDIS_URL || "",
  ).trim();
  const queueConnectivityCheck = config.jobQueueEnabled
    ? (queueRedisUrl
      ? createRedisConnectivityCheck(queueRedisUrl)
      : async () => ({
        ok: false,
        durationMs: 0,
        checkedAt: new Date().toISOString(),
        error: "JOB_QUEUE_REDIS_URL is not configured",
      }))
    : null;

  const statusService = createStatusService({
    config: {
      ...config,
      accountingGlShadowMode: config.accountingGlShadowMode,
    },
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
    ...(primaryRedisUrl
      ? { checkRedisConnectivity: createRedisConnectivityCheck(primaryRedisUrl) }
      : {}),
    ...(queueConnectivityCheck ? { checkQueueConnectivity: queueConnectivityCheck } : {}),
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
    stopConsumers,
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
