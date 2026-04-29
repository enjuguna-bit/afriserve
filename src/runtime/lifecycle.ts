import type { Server } from "node:http";
import type { Express } from "express";
import type { ErrorTrackerLike, LoggerLike } from "../types/runtime.js";
import { seedDefaultRolePermissions } from "../services/permissionService.js";
import { shutdownTracing } from "../observability/tracing.js";
import { getConfiguredDbClient } from "../utils/env.js";

interface LifecycleOptions {
  app: Express;
  logger?: LoggerLike | null;
  errorTracker?: ErrorTrackerLike | null;
  config: {
    port: number;
    jwtSecrets: string[];
    jobQueueEnabled: boolean;
    jobQueueSchedulerEnabled: boolean;
    jobQueueWorkerEnabled: boolean;
    backupsRequested: boolean;
    isInMemoryDb: boolean;
    backupsEnabled: boolean;
    reportDeliveryRequested: boolean;
    reportDeliveryRecipientEmail: string;
    reportDeliveryEnabled: boolean;
    reportDeliveryWebhookUrl: string;
    accountingBatchEnabled: boolean;
    accountingBatchIntervalMs: number;
    uptimeHeartbeatUrl: string;
    uptimeHeartbeatIntervalMs: number;
  };
  db: {
    initSchema: () => Promise<void>;
    runMigrations: () => Promise<unknown>;
    closeDb: () => Promise<void> | void;
    /** Required for the startup tenant-isolation assertion (PRAGMA table_info). */
    get?: (sql: string, params?: unknown[]) => Promise<Record<string, unknown> | null | undefined>;
    /** Required for the startup tenant-isolation assertion on SQLite (PRAGMA table_info). */
    all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>;
  };
  reportCache: { close?: () => Promise<void> | void } | null | undefined;
  overdueSyncJob: {
    runOnce: () => Promise<unknown>;
    start: () => void;
    stop: () => void;
  };
  backupJob: {
    runOnce: () => Promise<unknown>;
    start: () => void;
    stop: () => void;
  };
  reportDeliveryJob: {
    start: () => void;
    stop: () => void;
  };
  maintenanceCleanupJob: {
    runOnce: () => Promise<unknown>;
    start: () => void;
    stop: () => void;
  };
  accountingPeriodCloseJob: {
    runOnce: () => Promise<unknown>;
    start: () => void;
    stop: () => void;
  };
  domainEventDispatchJob: {
    runOnce: () => Promise<unknown>;
    start: () => void;
    stop: () => void;
  };
  b2cCoreDisbursementJob: {
    runOnce: () => Promise<unknown>;
    start: () => void;
    stop: () => void;
  };
  queueOrchestrator?: { start: () => Promise<void>; stop: () => Promise<void> } | null;
  /**
   * Optional hook to gracefully stop any message-broker consumers that were
   * started during bootstrap (RabbitMQ notifications + accounting queues).
   * Called during SIGINT/SIGTERM shutdown, after jobs are stopped and before
   * the HTTP server closes.
   */
  stopConsumers?: () => Promise<void>;
  validateEnvironment: () => { warnings?: unknown[]; errors?: unknown[] };
  onEnvironmentValidated: (payload: { warnings?: unknown[]; errors?: unknown[] }) => void;
  logEnvironmentStatus: () => void;
}

function createLifecycle(options: LifecycleOptions) {
  const {
    app,
    logger,
    config,
    db,
    reportCache,
    errorTracker,
    overdueSyncJob,
    backupJob,
    reportDeliveryJob,
    maintenanceCleanupJob,
    accountingPeriodCloseJob,
    domainEventDispatchJob,
    b2cCoreDisbursementJob,
    queueOrchestrator = null,
    stopConsumers,
    validateEnvironment,
    onEnvironmentValidated,
    logEnvironmentStatus,
  } = options;

  async function initializeBackgroundJobs() {
    const runInlineJobs = !config.jobQueueEnabled;

    if (runInlineJobs) {
      try {
        await overdueSyncJob.runOnce();
      } catch (syncError) {
        if (logger && typeof logger.error === "function") {
          logger.error("background.overdue_sync.initial_failed", { error: syncError });
        }
      }
      overdueSyncJob.start();
    }

    if (config.backupsRequested && config.isInMemoryDb && logger && typeof logger.warn === "function") {
      logger.warn("database.backup.disabled_in_memory", { reason: "DB_PATH is ':memory:'" });
    }

    if (runInlineJobs && config.backupsEnabled) {
      try {
        const initialBackup = await backupJob.runOnce() as Record<string, unknown>;
        if (!initialBackup.skipped && logger && typeof logger.info === "function") {
          logger.info("database.backup.initial_completed", { backupPath: initialBackup.backupPath });
        }
      } catch (backupError) {
        if (logger && typeof logger.error === "function") {
          logger.error("database.backup.initial_failed", { error: backupError });
        }
      }
      backupJob.start();
    }

    if (config.reportDeliveryRequested && !config.reportDeliveryRecipientEmail && logger && typeof logger.warn === "function") {
      logger.warn("reports.delivery.disabled_missing_recipient", { reason: "REPORT_DELIVERY_RECIPIENT_EMAIL is not configured" });
    }
    if (config.reportDeliveryEnabled && !config.reportDeliveryWebhookUrl && logger && typeof logger.warn === "function") {
      logger.warn("reports.delivery.log_only_mode", { reason: "REPORT_DELIVERY_WEBHOOK_URL is not configured" });
    }
    if (config.reportDeliveryEnabled && runInlineJobs) {
      reportDeliveryJob.start();
    }

    if (runInlineJobs) {
      try {
        await domainEventDispatchJob.runOnce();
      } catch (dispatchError) {
        if (logger && typeof logger.error === "function") {
          logger.error("domain_events.dispatch.initial_failed", { error: dispatchError });
        }
      }
      domainEventDispatchJob.start();
    }

    if (runInlineJobs) {
      try {
        await b2cCoreDisbursementJob.runOnce();
      } catch (coreRetryError) {
        if (logger && typeof logger.error === "function") {
          logger.error("mobile_money.b2c.core_retry.initial_failed", { error: coreRetryError });
        }
      }
      b2cCoreDisbursementJob.start();
    }

    if (runInlineJobs) {
      try {
        await maintenanceCleanupJob.runOnce();
      } catch (cleanupError) {
        if (logger && typeof logger.error === "function") {
          logger.error("maintenance.cleanup.initial_failed", { error: cleanupError });
        }
      }
      maintenanceCleanupJob.start();
    }

    if (runInlineJobs) {
      try {
        await accountingPeriodCloseJob.runOnce();
      } catch (accountingCloseError) {
        if (logger && typeof logger.error === "function") {
          logger.error("accounting.close.initial_failed", { error: accountingCloseError });
        }
      }
      accountingPeriodCloseJob.start();
    }

    if (config.jobQueueEnabled && queueOrchestrator && (config.jobQueueSchedulerEnabled || config.jobQueueWorkerEnabled)) {
      await queueOrchestrator.start();
    }
  }

  async function start() {
    let uptimeHeartbeatTimer: NodeJS.Timeout | null = null;
    let registeredUnhandledRejection: ((reason: unknown) => void) | null = null;
    let registeredUncaughtException: ((error: Error) => void) | null = null;
    let forcedShutdownTimer: NodeJS.Timeout | null = null;
    let shuttingDown = false;

    async function sendUptimeHeartbeat(event: "started" | "alive" | "shutdown"): Promise<void> {
      if (!config.uptimeHeartbeatUrl) return;

      const heartbeatUrl = new URL(config.uptimeHeartbeatUrl);
      heartbeatUrl.searchParams.set("event", event);
      heartbeatUrl.searchParams.set("service", "microfinance-api");

      try {
        const response = await fetch(heartbeatUrl, {
          method: "GET",
          headers: { "User-Agent": "afriserve-uptime-heartbeat" },
        });
        if (!response.ok && logger && typeof logger.warn === "function") {
          logger.warn("monitoring.uptime_heartbeat.failed", { event, statusCode: response.status });
        }
      } catch (error) {
        if (logger && typeof logger.warn === "function") {
          logger.warn("monitoring.uptime_heartbeat.error", { event, error });
        }
      }
    }

    try {
      const validation = validateEnvironment();
      onEnvironmentValidated(validation);
      logEnvironmentStatus();

      if (!config.jwtSecrets[0]) {
        throw new Error("JWT_SECRET is required. Set it in environment before starting the server.");
      }

      if (getConfiguredDbClient() === "postgres") {
        const { initializePool } = await import("../db/postgresConnection.js");
        await initializePool();
      }

      await db.initSchema();
      try {
        await db.runMigrations();
      } catch (migrationError) {
        const dbClient = getConfiguredDbClient();
        const message = String((migrationError as { message?: unknown })?.message || "").toLowerCase();
        const isSqliteLockError = dbClient === "sqlite" && message.includes("database is locked");
        if (!isSqliteLockError) throw migrationError;
        if (logger && typeof logger.warn === "function") {
          logger.warn("database.migration.lock_skipped", { reason: "sqlite_database_locked" });
        }
      }

      try {
        await seedDefaultRolePermissions();
      } catch (seedError) {
        if (logger && typeof logger.error === "function") {
          logger.error("permissions.seed_failed", { error: seedError });
        }
      }

      // ── GL account seeding health check ──────────────────────────────────
      // The penalty engine and interest accrual engine silently skip all work
      // if critical GL accounts are missing. Surface the gap at startup so
      // operators know immediately rather than discovering it through silent
      // non-accrual days later.
      try {
        const criticalGlAccounts = [
          "CASH", "LOAN_RECEIVABLE", "INTEREST_INCOME", "UNEARNED_INTEREST",
          "FEE_INCOME", "PENALTY_INCOME", "SUSPENSE_FUNDS",
        ];
        const missingAccounts: string[] = [];
        for (const code of criticalGlAccounts) {
          if (!db.get) break;
          const row = await db.get(
            getConfiguredDbClient() === "postgres"
              ? "SELECT id FROM gl_accounts WHERE code = $1 AND is_active = 1 LIMIT 1"
              : "SELECT id FROM gl_accounts WHERE code = ? AND is_active = 1 LIMIT 1",
            [code],
          ).catch(() => null);
          if (!row) missingAccounts.push(code);
        }
        if (missingAccounts.length > 0) {
          if (logger && typeof logger.warn === "function") {
            logger.warn("gl_accounts.seed_check.missing", {
              missingAccounts,
              message:
                "Critical GL accounts are not seeded. Penalty accrual, interest recognition, " +
                "and fee posting will be silently skipped until these accounts are created. " +
                "Run the GL account seed script before accepting production traffic.",
            });
          }
        } else if (logger && typeof logger.info === "function") {
          logger.info("gl_accounts.seed_check.ok", { checkedAccounts: criticalGlAccounts.length });
        }
      } catch (glCheckError) {
        if (logger && typeof logger.warn === "function") {
          logger.warn("gl_accounts.seed_check.failed", { error: glCheckError });
        }
      }

      // ── Tenant isolation startup assertion ───────────────────────────────
      // loan_guarantors and loan_collaterals had a migration window where
      // tenant_id was missing. Any instance started before that migration ran
      // would silently serve cross-tenant data.
      //
      // On SQLite: fatal — throws and aborts startup before the server binds.
      // On Postgres: warning-only — RLS provides a secondary isolation layer,
      //   but operators must still apply the migration.
      {
        const tenantCheckTables = ["loan_guarantors", "loan_collaterals"];
        const dbClient = getConfiguredDbClient();
        if (dbClient === "sqlite") {
          for (const table of tenantCheckTables) {
            try {
              const columns = await db.all(`PRAGMA table_info(${table})`);
              const hasTenantId = columns.some(
                (c) => String(c["name"] || "").toLowerCase() === "tenant_id",
              );
              if (!hasTenantId) {
                throw new Error(
                  `FATAL: ${table}.tenant_id is missing. ` +
                  "Tenant isolation is broken — run the required schema migration before starting.",
                );
              }
            } catch (tenantCheckError) {
              if (
                tenantCheckError instanceof Error &&
                tenantCheckError.message.startsWith("FATAL:")
              ) {
                throw tenantCheckError;
              }
              if (logger && typeof logger.warn === "function") {
                logger.warn("tenant_isolation.startup_check.failed", { table, error: tenantCheckError });
              }
            }
          }
          if (logger && typeof logger.info === "function") {
            logger.info("tenant_isolation.startup_check.ok", { tables: tenantCheckTables });
          }
        } else if (dbClient === "postgres" && db.get) {
          for (const table of tenantCheckTables) {
            const row = await db.get(
              "SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = 'tenant_id' LIMIT 1",
              [table],
            ).catch(() => null);
            if (!row && logger && typeof logger.warn === "function") {
              logger.warn("tenant_isolation.startup_check.missing_column", {
                table,
                message: `${table}.tenant_id is missing — run the required schema migration.`,
              });
            }
          }
        }
      }

      await initializeBackgroundJobs();

      const server = await new Promise<Server>((resolve, reject) => {
        const listeningServer = app.listen(config.port);

        const cleanupListeners = () => {
          listeningServer.off("listening", handleListening);
          listeningServer.off("error", handleError);
        };

        const handleListening = () => {
          cleanupListeners();
          resolve(listeningServer);
        };

        const handleError = (error: Error) => {
          cleanupListeners();
          reject(error);
        };

        listeningServer.once("listening", handleListening);
        listeningServer.once("error", handleError);
      });

      const address = server.address();
      const activePort = typeof address === "object" && address ? address.port : config.port;
      if (logger && typeof logger.info === "function") {
        logger.info("server.started", { port: activePort });
      }

      void sendUptimeHeartbeat("started");
      if (config.uptimeHeartbeatUrl) {
        uptimeHeartbeatTimer = setInterval(() => {
          void sendUptimeHeartbeat("alive");
        }, config.uptimeHeartbeatIntervalMs);
        if (typeof uptimeHeartbeatTimer.unref === "function") {
          uptimeHeartbeatTimer.unref();
        }
      }

      registeredUnhandledRejection = (reason: unknown) => {
        if (logger && typeof logger.error === "function") {
          logger.error("process.unhandled_rejection", { reason });
        }
        if (errorTracker && typeof errorTracker.captureException === "function") {
          errorTracker.captureException(reason, { source: "process.unhandled_rejection" });
        }
      };

      registeredUncaughtException = (uncaughtError: Error) => {
        if (logger && typeof logger.error === "function") {
          logger.error("process.uncaught_exception", { error: uncaughtError });
        }
        if (errorTracker && typeof errorTracker.captureException === "function") {
          errorTracker.captureException(uncaughtError, { source: "process.uncaught_exception" });
        }
      };

      process.on("unhandledRejection", registeredUnhandledRejection);
      process.on("uncaughtException", registeredUncaughtException);

      async function completeShutdown(exitCode: 0 | 1): Promise<void> {
        let resolvedExitCode: 0 | 1 = exitCode;

        try {
          if (queueOrchestrator && typeof queueOrchestrator.stop === "function") {
            await queueOrchestrator.stop();
          }
        } catch (queueStopError) {
          resolvedExitCode = 1;
          if (logger && typeof logger.warn === "function") {
            logger.warn("server.shutdown.queue_stop_failed", { error: queueStopError });
          }
        }

        try {
          if (typeof stopConsumers === "function") {
            await stopConsumers();
          }
        } catch (consumerStopError) {
          resolvedExitCode = 1;
          if (logger && typeof logger.warn === "function") {
            logger.warn("server.shutdown.consumers_stop_failed", { error: consumerStopError });
          }
        }

        try {
          if (reportCache && typeof reportCache.close === "function") {
            await reportCache.close();
          }
        } catch (reportCacheCloseError) {
          resolvedExitCode = 1;
          if (logger && typeof logger.warn === "function") {
            logger.warn("server.shutdown.cache_close_failed", { error: reportCacheCloseError });
          }
        }

        try {
          await Promise.resolve(db.closeDb());
        } catch (closeError) {
          resolvedExitCode = 1;
          if (logger && typeof logger.error === "function") {
            logger.error("server.shutdown.db_close_failed", { error: closeError });
          }
        }

        await shutdownTracing(logger || null);

        if (forcedShutdownTimer) {
          clearTimeout(forcedShutdownTimer);
          forcedShutdownTimer = null;
        }

        if (logger && typeof logger.info === "function") {
          logger.info("server.shutdown.completed", { exitCode: resolvedExitCode });
        }

        if (logger && typeof logger.close === "function") {
          try {
            await logger.close();
          } catch {
            resolvedExitCode = 1;
          }
        }

        process.exit(resolvedExitCode);
      }

      function shutdown(signal: "SIGINT" | "SIGTERM"): void {
        if (shuttingDown) return;
        shuttingDown = true;

        if (logger && typeof logger.info === "function") {
          logger.info("server.shutdown.requested", { signal });
        }

        if (registeredUnhandledRejection) {
          process.off("unhandledRejection", registeredUnhandledRejection);
        }
        if (registeredUncaughtException) {
          process.off("uncaughtException", registeredUncaughtException);
        }
        if (uptimeHeartbeatTimer) {
          clearInterval(uptimeHeartbeatTimer);
          uptimeHeartbeatTimer = null;
        }
        void sendUptimeHeartbeat("shutdown");

        overdueSyncJob.stop();
        backupJob.stop();
        reportDeliveryJob.stop();
        domainEventDispatchJob.stop();
        b2cCoreDisbursementJob.stop();
        maintenanceCleanupJob.stop();
        accountingPeriodCloseJob.stop();

        server.close((closeError?: Error) => {
          if (closeError && logger && typeof logger.warn === "function") {
            logger.warn("server.shutdown.http_close_failed", { error: closeError });
          }
          void completeShutdown(closeError ? 1 : 0);
        });

        if (typeof server.closeIdleConnections === "function") {
          server.closeIdleConnections();
        }

        forcedShutdownTimer = setTimeout(() => {
          if (logger && typeof logger.error === "function") {
            logger.error("server.shutdown.forced_timeout");
          }
          if (typeof server.closeAllConnections === "function") {
            server.closeAllConnections();
          }
          process.exit(1);
        }, 10000);
        if (typeof forcedShutdownTimer.unref === "function") {
          forcedShutdownTimer.unref();
        }
      }

      process.on("SIGINT", () => shutdown("SIGINT"));
      process.on("SIGTERM", () => shutdown("SIGTERM"));
    } catch (error) {
      if (logger && typeof logger.error === "function") {
        logger.error("server.start_failed", { error });
      }
      if (errorTracker && typeof errorTracker.captureException === "function") {
        errorTracker.captureException(error, { source: "server.start_failed" });
      }
      await shutdownTracing(logger || null);
      process.exit(1);
    }
  }

  return { start };
}

export { createLifecycle };
