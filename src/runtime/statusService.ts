import type { LoggerLike } from "../types/runtime.js";

interface StatusServiceOptions {
  config: {
    appVersion: string;
    backupDirectory: string;
    backupIntervalMs: number;
    backupRetentionCount: number;
    accountingGlShadowMode: boolean;
  };
  dbGet: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  metrics: { getSnapshot?: () => Record<string, any> } | null | undefined;
  buildConfigStatus: (options?: { envValidationWarnings?: number }) => Record<string, any>;
  overdueSyncJob: { getState: () => Record<string, any> };
  backupJob: { getState: () => Record<string, any> };
  reportDeliveryJob: { getState: () => Record<string, any> };
  maintenanceCleanupJob: { getState: () => Record<string, any> };
  accountingPeriodCloseJob: { getState: () => Record<string, any> };
  domainEventDispatchJob: { getState: () => Record<string, any> };
  b2cCoreDisbursementJob: { getState: () => Record<string, any> };
  startedAt: Date;
  env: NodeJS.ProcessEnv;
  logger: LoggerLike | null | undefined;
  getEnvValidation: () => { warnings?: unknown[] } | null | undefined;
  checkRedisConnectivity?: () => Promise<{ ok: boolean; durationMs: number; checkedAt: string; error: string | null }>;
  checkQueueConnectivity?: () => Promise<{ ok: boolean; durationMs: number; checkedAt: string; error: string | null }>;

}

function createStatusService(options: StatusServiceOptions) {
  const {
    config,
    dbGet,
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
    getEnvValidation,
    checkRedisConnectivity,
    checkQueueConnectivity,
  } = options;

  const isGlShadowMode = Boolean(config.accountingGlShadowMode);

  /**
   * @returns {Promise<{ ok: boolean; durationMs: number; checkedAt: string; error: string | null }>}
   */
  async function checkDatabaseConnectivity() {
    const startedAtMs = Date.now();
    try {
      const row = await dbGet("SELECT 1 AS healthy");
      const durationMs = Date.now() - startedAtMs;
      return {
        ok: Number(row?.healthy || 0) === 1,
        durationMs,
        checkedAt: new Date().toISOString(),
        error: null,
      };
    } catch (error: unknown) {
      const durationMs = Date.now() - startedAtMs;
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        durationMs,
        checkedAt: new Date().toISOString(),
        error: errorMessage,
      };
    }
  }

  /**
   * @returns {Record<string, any>}
   */
  function getConfigStatus() {
    const envValidation = getEnvValidation();
    return buildConfigStatus({
      envValidationWarnings: Array.isArray(envValidation?.warnings) ? envValidation.warnings.length : 0,
    });
  }

  /**
   * @returns {Promise<Record<string, any>>}
   */
  async function getRuntimeStatus() {
  const databaseCheck = await checkDatabaseConnectivity();
  const redisCheck = typeof checkRedisConnectivity === "function"
    ? await checkRedisConnectivity()
    : null;
  const queueCheck = typeof checkQueueConnectivity === "function"
    ? await checkQueueConnectivity()
    : null;
  const metricsSnapshot = metrics && typeof metrics.getSnapshot === "function"
    ? metrics.getSnapshot()
    : null;

  const overdueSyncRuntimeState = overdueSyncJob.getState();
  const backupRuntimeState = backupJob.getState();
  const reportDeliveryRuntimeState = reportDeliveryJob.getState();
  const maintenanceCleanupRuntimeState = maintenanceCleanupJob.getState();
  const accountingPeriodCloseRuntimeState = accountingPeriodCloseJob.getState();
  const domainEventDispatchRuntimeState = domainEventDispatchJob.getState();
  const b2cCoreDisbursementRuntimeState = b2cCoreDisbursementJob.getState();
  const degraded = !databaseCheck.ok
    || (redisCheck !== null && !redisCheck.ok)
    || (queueCheck !== null && !queueCheck.ok)
    || Boolean(overdueSyncRuntimeState.degraded);

  return {
    status: degraded ? "degraded" : "ok",
    service: "microfinance-api",
    version: config.appVersion,
    environment: env.NODE_ENV || "development",
    uptimeSeconds: Number(process.uptime().toFixed(2)),
    startedAt: startedAt.toISOString(),
    checks: {
      database: databaseCheck,
      ...(redisCheck !== null ? { redis: redisCheck } : {}),
      ...(queueCheck !== null ? { queue: queueCheck } : {}),
    },
    accounting: {
      glShadowMode: isGlShadowMode,
      glShadowModeWarning: isGlShadowMode
        ? "GL subscriber is running in shadow (reconcile-only) mode. Journal entries are NOT being posted."
        : null,
    },
    backgroundTasks: {
      overdueInstallmentSync: {
        ...overdueSyncRuntimeState,
      },
      databaseBackup: {
        enabled: backupRuntimeState.enabled,
        inProgress: backupRuntimeState.inProgress,
        lastRunAt: backupRuntimeState.lastRunAt,
        lastBackupPath: backupRuntimeState.lastBackupPath,
        deletedFiles: backupRuntimeState.deletedFiles,
        lastError: backupRuntimeState.lastError,
      },
      reportDelivery: {
        ...reportDeliveryRuntimeState,
      },
      domainEventDispatch: {
        ...domainEventDispatchRuntimeState,
      },
      b2cCoreDisbursement: {
        ...b2cCoreDisbursementRuntimeState,
      },
      maintenanceCleanup: {
        ...maintenanceCleanupRuntimeState,
      },
      accountingPeriodClose: {
        ...accountingPeriodCloseRuntimeState,
      },
    },
    backups: {
      enabled: backupRuntimeState.enabled,
      inProgress: backupRuntimeState.inProgress,
      directory: config.backupDirectory,
      intervalMs: config.backupIntervalMs,
      retentionCount: config.backupRetentionCount,
      lastRunAt: backupRuntimeState.lastRunAt,
      lastBackupPath: backupRuntimeState.lastBackupPath,
      deletedFiles: backupRuntimeState.deletedFiles,
      lastError: backupRuntimeState.lastError,
    },
    metrics: metricsSnapshot,
    timestamp: new Date().toISOString(),
  };
}

  /**
   * @returns {void}
   */
  function logEnvironmentStatus() {
    if (logger && typeof logger.info === "function") {
      logger.info("environment.config", getConfigStatus());
    }
    const envValidation = getEnvValidation();
    const warn = logger?.warn;
    if (Array.isArray(envValidation?.warnings) && typeof warn === "function") {
      envValidation.warnings.forEach((warning: unknown) => {
        warn("environment.warning", { warning });
      });
    }
    // Prominent startup warning when GL is in shadow mode — operators must
    // consciously flip ACCOUNTING_GL_SHADOW_MODE=false after parity is verified.
    if (isGlShadowMode && logger && typeof logger.warn === "function") {
      logger.warn(
        "accounting.gl_shadow_mode.active",
        {
          message:
            "ACCOUNTING_GL_SHADOW_MODE=true: the GL subscriber is logging events but NOT posting " +
            "real journal entries. Set ACCOUNTING_GL_SHADOW_MODE=false once staging parity is confirmed.",
        },
      );
    }
  }

  return {
    getConfigStatus,
    getRuntimeStatus,
    logEnvironmentStatus,
  };
}

export {
  createStatusService,
};






