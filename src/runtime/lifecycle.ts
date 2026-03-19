import type { Express } from "express";
import type { ErrorTrackerLike, LoggerLike } from "../types/runtime.js";
import { seedDefaultRolePermissions } from "../services/permissionService.js";
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
    get?: (sql: string, params?: unknown[]) => Promise<Record<string, unknown> | null | undefined>;
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

  /**
   * @returns {Promise<void>}
   */
  async function initializeBackgroundJobs() {
    const runInlineJobs = !config.jobQueueEnabled;

    if (runInlineJobs) {
      try {
        await overdueSyncJob.runOnce();
      } catch (syncError) {
        if (logger && typeof logger.error === "function") {
          logger.error("background.overdue_sync.initial_failed", {
            error: syncError,
          });
        }
      }
      overdueSyncJob.start();
    }

    if (config.backupsRequested && config.isInMemoryDb && logger && typeof logger.warn === "function") {
      logger.warn("database.backup.disabled_in_memory", {
        reason: "DB_PATH is ':memory:'",
      });
    }

    if (runInlineJobs && config.backupsEnabled) {
      try {
        const initialBackup = await backupJob.runOnce() as Record<string, unknown>;
        if (!initialBackup.skipped && logger && typeof logger.info === "function") {
          logger.info("database.backup.initial_completed", {
            backupPath: initialBackup.backupPath,
          });
        }
      } catch (backupError) {
        if (logger && typeof logger.error === "function") {
          logger.error("database.backup.initial_failed", {
            error: backupError,
          });
        }
      }
      backupJob.start();
    }

    if (config.reportDeliveryRequested && !config.reportDeliveryRecipientEmail && logger && typeof logger.warn === "function") {
      logger.warn("reports.delivery.disabled_missing_recipient", {
        reason: "REPORT_DELIVERY_RECIPIENT_EMAIL is not configured",
      });
    }
    if (config.reportDeliveryEnabled && !config.reportDeliveryWebhookUrl && logger && typeof logger.warn === "function") {
      logger.warn("reports.delivery.log_only_mode", {
        reason: "REPORT_DELIVERY_WEBHOOK_URL is not configured",
      });
    }
    if (config.reportDeliveryEnabled && runInlineJobs) {
      reportDeliveryJob.start();
    }

    if (runInlineJobs) {
      try {
        await domainEventDispatchJob.runOnce();
      } catch (dispatchError) {
        if (logger && typeof logger.error === "function") {
          logger.error("domain_events.dispatch.initial_failed", {
            error: dispatchError,
          });
        }
      }
      domainEventDispatchJob.start();
    }

    if (runInlineJobs) {
      try {
        await b2cCoreDisbursementJob.runOnce();
      } catch (coreRetryError) {
        if (logger && typeof logger.error === "function") {
          logger.error("mobile_money.b2c.core_retry.initial_failed", {
            error: coreRetryError,
          });
        }
      }
      b2cCoreDisbursementJob.start();
    }

    if (runInlineJobs) {
      try {
        await maintenanceCleanupJob.runOnce();
      } catch (cleanupError) {
        if (logger && typeof logger.error === "function") {
          logger.error("maintenance.cleanup.initial_failed", {
            error: cleanupError,
          });
        }
      }
      maintenanceCleanupJob.start();
    }

    if (runInlineJobs) {
      try {
        await accountingPeriodCloseJob.runOnce();
      } catch (accountingCloseError) {
        if (logger && typeof logger.error === "function") {
          logger.error("accounting.close.initial_failed", {
            error: accountingCloseError,
          });
        }
      }
      accountingPeriodCloseJob.start();
    }

    if (config.jobQueueEnabled && queueOrchestrator && (config.jobQueueSchedulerEnabled || config.jobQueueWorkerEnabled)) {
      await queueOrchestrator.start();
    }
  }

  /**
   * @returns {Promise<void>}
   */
  async function start() {
    let uptimeHeartbeatTimer: NodeJS.Timeout | null = null;
    let registeredUnhandledRejection: ((reason: unknown) => void) | null = null;
    let registeredUncaughtException: ((error: Error) => void) | null = null;

    async function sendUptimeHeartbeat(event: "started" | "alive" | "shutdown"): Promise<void> {
      if (!config.uptimeHeartbeatUrl) {
        return;
      }

      const heartbeatUrl = new URL(config.uptimeHeartbeatUrl);
      heartbeatUrl.searchParams.set("event", event);
      heartbeatUrl.searchParams.set("service", "microfinance-api");

      try {
        const response = await fetch(heartbeatUrl, {
          method: "GET",
          headers: {
            "User-Agent": "afriserve-uptime-heartbeat",
          },
        });

        if (!response.ok && logger && typeof logger.warn === "function") {
          logger.warn("monitoring.uptime_heartbeat.failed", {
            event,
            statusCode: response.status,
          });
        }
      } catch (error) {
        if (logger && typeof logger.warn === "function") {
          logger.warn("monitoring.uptime_heartbeat.error", {
            event,
            error,
          });
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

      await db.initSchema();
      try {
        await db.runMigrations();
      } catch (migrationError) {
        const dbClient = getConfiguredDbClient();
        const message = String((migrationError as { message?: unknown })?.message || "").toLowerCase();
        const isSqliteLockError = dbClient === "sqlite" && message.includes("database is locked");

        if (!isSqliteLockError) {
          throw migrationError;
        }

        if (logger && typeof logger.warn === "function") {
          logger.warn("database.migration.lock_skipped", {
            reason: "sqlite_database_locked",
          });
        }
      }
      try {
        await seedDefaultRolePermissions();
      } catch (seedError) {
        if (logger && typeof logger.error === "function") {
          logger.error("permissions.seed_failed", {
            error: seedError,
          });
        }
      }

      // ── GL account seeding health check ──────────────────────────────────
      // The penalty engine and interest accrual engine silently skip all work
      // if critical GL accounts are missing.  Surface the gap at startup so
      // operators know immediately rather than discovering it through silent
      // non-accrual days later.
      try {
        const criticalGlAccounts = [
          "CASH", "LOAN_RECEIVABLE", "INTEREST_INCOME", "UNEARNED_INTEREST",
          "FEE_INCOME", "PENALTY_INCOME", "SUSPENSE_FUNDS",
        ];
        const missingAccounts: string[] = [];
        for (const code of criticalGlAccounts) {
          if (!db.get) break; // guard: db.get is optional on this interface
          const row = await db.get(
            getConfiguredDbClient() === "postgres"
              ? "SELECT id FROM gl_accounts WHERE code = $1 AND is_active = 1 LIMIT 1"
              : "SELECT id FROM gl_accounts WHERE code = ? AND is_active = 1 LIMIT 1",
            [code],
          ).catch(() => null);
          if (!row) {
            missingAccounts.push(code);
          }
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

      await initializeBackgroundJobs();

      const server = app.listen(config.port, () => {
        const address = server.address();
        const activePort = typeof address === "object" && address ? address.port : config.port;
        if (logger && typeof logger.info === "function") {
          logger.info("server.started", {
            port: activePort,
          });
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
      });

      registeredUnhandledRejection = (reason: unknown) => {
        if (logger && typeof logger.error === "function") {
          logger.error("process.unhandled_rejection", {
            reason,
          });
        }
        if (errorTracker && typeof errorTracker.captureException === "function") {
          errorTracker.captureException(reason, {
            source: "process.unhandled_rejection",
          });
        }
      };

      registeredUncaughtException = (uncaughtError: Error) => {
        if (logger && typeof logger.error === "function") {
          logger.error("process.uncaught_exception", {
            error: uncaughtError,
          });
        }
        if (errorTracker && typeof errorTracker.captureException === "function") {
          errorTracker.captureException(uncaughtError, {
            source: "process.uncaught_exception",
          });
        }
      };

      process.on("unhandledRejection", registeredUnhandledRejection);
      process.on("uncaughtException", registeredUncaughtException);

      function shutdown(signal: "SIGINT" | "SIGTERM"): void {
        if (logger && typeof logger.info === "function") {
          logger.info("server.shutdown.requested", {
            signal,
          });
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

        // Stop background jobs
        overdueSyncJob.stop();
        backupJob.stop();
        reportDeliveryJob.stop();
        domainEventDispatchJob.stop();
        b2cCoreDisbursementJob.stop();
        maintenanceCleanupJob.stop();
        accountingPeriodCloseJob.stop();

        server.close(() => {
          Promise.resolve()
            .then(async () => {
              if (queueOrchestrator && typeof queueOrchestrator.stop === "function") {
                await queueOrchestrator.stop();
              }
              // Stop message-broker consumers (RabbitMQ notifications + accounting)
              if (typeof stopConsumers === "function") {
                await stopConsumers().catch((consumerStopError: Error) => {
                  if (logger && typeof logger.warn === "function") {
                    logger.warn("server.shutdown.consumers_stop_failed", {
                      error: consumerStopError.message,
                    });
                  }
                });
              }
              if (logger && typeof logger.close === "function") {
                await logger.close();
              }
              if (reportCache && typeof reportCache.close === "function") {
                await reportCache.close();
              }
            })
            .catch((cacheCloseError) => {
              if (logger && typeof logger.warn === "function") {
                logger.warn("server.shutdown.cache_close_failed", {
                  error: cacheCloseError,
                });
              }
            })
            .finally(() => {
              Promise.resolve()
                .then(() => db.closeDb())
                .catch((closeError) => {
                  if (logger && typeof logger.error === "function") {
                    logger.error("server.shutdown.db_close_failed", {
                      error: closeError,
                    });
                  }
                })
                .finally(() => {
                  if (logger && typeof logger.info === "function") {
                    logger.info("server.shutdown.completed");
                  }
                  process.exit(0);
                });
            });
        });

        setTimeout(() => {
          if (logger && typeof logger.error === "function") {
            logger.error("server.shutdown.forced_timeout");
          }
          process.exit(1);
        }, 10000).unref();
      }

      process.on("SIGINT", () => shutdown("SIGINT"));
      process.on("SIGTERM", () => shutdown("SIGTERM"));
    } catch (error) {
      if (logger && typeof logger.error === "function") {
        logger.error("server.start_failed", {
          error,
        });
      }
      if (errorTracker && typeof errorTracker.captureException === "function") {
        errorTracker.captureException(error, {
          source: "server.start_failed",
        });
      }
      process.exit(1);
    }
  }

  return {
    start,
  };
}

export {
  createLifecycle,
};
