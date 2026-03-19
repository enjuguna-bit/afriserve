import { assertEnvironment } from "../config/env.js";
import { createBootstrapContext } from "../config/bootstrap.js";
import { createSystemJobs } from "./systemJobs.js";
import { getConfiguredDbClient } from "../utils/env.js";

type StartQueueWorkerOptions = {
  env?: NodeJS.ProcessEnv;
};

async function startQueueWorker(options: StartQueueWorkerOptions = {}): Promise<void> {
  const env = options.env || process.env;
  let envValidation: { warnings: unknown[]; errors?: unknown[] } = { warnings: [] };

  const bootstrap = await createBootstrapContext({ env });
  const { config, db, services, buildConfigStatus } = bootstrap;
  const {
    logger,
    errorTracker,
    metrics,
    reportCache,
    scheduledReportService,
    domainEventService,
    serviceRegistry,
  } = services;
  const mobileMoneyService = serviceRegistry?.loan?.mobileMoneyService || null;

  const {
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
    queueRoleOverrides: {
      schedulerEnabled: false,
      workerEnabled: true,
    },
  });

  let registeredUnhandledRejection: ((reason: unknown) => void) | null = null;
  let registeredUncaughtException: ((error: Error) => void) | null = null;
  let shuttingDown = false;

  async function shutdown(signal: "SIGINT" | "SIGTERM"): Promise<void> {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    if (logger && typeof logger.info === "function") {
      logger.info("queue.worker.shutdown.requested", {
        signal,
      });
    }

    if (registeredUnhandledRejection) {
      process.off("unhandledRejection", registeredUnhandledRejection);
    }
    if (registeredUncaughtException) {
      process.off("uncaughtException", registeredUncaughtException);
    }

    try {
      await queueOrchestrator.stop();
      if (reportCache && typeof reportCache.close === "function") {
        await reportCache.close();
      }
      await Promise.resolve(db.closeDb());
      if (logger && typeof logger.close === "function") {
        await logger.close();
      }
      process.exit(0);
    } catch (error) {
      if (logger && typeof logger.error === "function") {
        logger.error("queue.worker.shutdown.failed", {
          error,
        });
      }
      process.exit(1);
    }
  }

  try {
    const validation = assertEnvironment(env);
    envValidation = {
      warnings: Array.isArray(validation?.warnings) ? validation.warnings : [],
      errors: Array.isArray(validation?.errors) ? validation.errors : undefined,
    };

    if (!config.jobQueueEnabled) {
      throw new Error("Queue worker requires JOB_QUEUE_ENABLED=true.");
    }

    if (logger && typeof logger.info === "function") {
      logger.info("queue.worker.environment", buildConfigStatus({
        envValidationWarnings: envValidation.warnings.length,
      }));
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

    await queueOrchestrator.start();

    if (logger && typeof logger.info === "function") {
      logger.info("queue.worker.started", {
        queueName: config.jobQueueName,
        deadLetterQueueName: config.jobQueueDeadLetterQueueName,
        configuredRole: config.jobQueueRole,
      });
    }

    registeredUnhandledRejection = (reason: unknown) => {
      if (logger && typeof logger.error === "function") {
        logger.error("queue.worker.unhandled_rejection", {
          reason,
        });
      }
      if (errorTracker && typeof errorTracker.captureException === "function") {
        errorTracker.captureException(reason, {
          source: "queue.worker.unhandled_rejection",
        });
      }
    };

    registeredUncaughtException = (error: Error) => {
      if (logger && typeof logger.error === "function") {
        logger.error("queue.worker.uncaught_exception", {
          error,
        });
      }
      if (errorTracker && typeof errorTracker.captureException === "function") {
        errorTracker.captureException(error, {
          source: "queue.worker.uncaught_exception",
        });
      }
    };

    process.on("unhandledRejection", registeredUnhandledRejection);
    process.on("uncaughtException", registeredUncaughtException);
    process.on("SIGINT", () => {
      void shutdown("SIGINT");
    });
    process.on("SIGTERM", () => {
      void shutdown("SIGTERM");
    });
  } catch (error) {
    if (logger && typeof logger.error === "function") {
      logger.error("queue.worker.start_failed", {
        error,
      });
    }
    if (errorTracker && typeof errorTracker.captureException === "function") {
      errorTracker.captureException(error, {
        source: "queue.worker.start_failed",
      });
    }
    process.exit(1);
  }
}

export {
  startQueueWorker,
};


