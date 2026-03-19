import type { LoggerLike, MetricsLike } from "../types/runtime.js";

type BackupJobOptions = {
  backupDatabase: (options: { backupDirectory: string; retentionCount: number }) => Promise<Record<string, any>>;
  logger?: LoggerLike | null;
  metrics?: MetricsLike | null;
  enabled: boolean;
  intervalMs: number;
  retentionCount: number;
  backupDirectory: string;
};

function createBackupJob(options: BackupJobOptions) {
  const {
    backupDatabase,
    logger,
    metrics,
    enabled,
    intervalMs,
    retentionCount,
    backupDirectory,
  } = options;

  const baseIntervalMs = Math.max(60000, Math.floor(intervalMs || (6 * 60 * 60 * 1000)));
  const maxBackoffMs = Math.max(baseIntervalMs, 6 * 60 * 60 * 1000);

  const runtimeState: {
    enabled: boolean;
    inProgress: boolean;
    lastRunAt: string | null;
    lastBackupPath: string | null;
    deletedFiles: string[];
    lastError: string | null;
  } = {
    enabled: Boolean(enabled),
    inProgress: false,
    lastRunAt: null,
    lastBackupPath: null,
    deletedFiles: [],
    lastError: null,
  };

  /** @type {NodeJS.Timeout | null} */
  let timer: NodeJS.Timeout | null = null;
  let consecutiveFailures = 0;

  /**
   * @returns {Promise<Record<string, any>>}
   */
  async function runOnce() {
    if (!runtimeState.enabled) {
      return {
        skipped: true,
        reason: "backup_disabled",
      };
    }

    if (runtimeState.inProgress) {
      return {
        skipped: true,
        reason: "backup_in_progress",
      };
    }

    runtimeState.inProgress = true;
    const startedAtMs = Date.now();
    try {
      const backupResult = await backupDatabase({
        backupDirectory,
        retentionCount,
      });

      if (backupResult.skipped) {
        return backupResult;
      }

      runtimeState.lastRunAt = backupResult.createdAt || new Date().toISOString();
      runtimeState.lastBackupPath = backupResult.backupPath || null;
      runtimeState.deletedFiles = backupResult.deletedFiles || [];
      runtimeState.lastError = null;

      if (metrics && typeof metrics.observeBackgroundTask === "function") {
        metrics.observeBackgroundTask("database_backup", {
          success: true,
          durationMs: Date.now() - startedAtMs,
        });
      }

      return backupResult;
    } catch (error) {
      runtimeState.lastError = error instanceof Error ? error.message : String(error);
      if (metrics && typeof metrics.observeBackgroundTask === "function") {
        metrics.observeBackgroundTask("database_backup", {
          success: false,
          durationMs: Date.now() - startedAtMs,
          errorMessage: runtimeState.lastError,
        });
      }
      throw error;
    } finally {
      runtimeState.inProgress = false;
    }
  }

  /**
   * @param {number} [delayMs]
   * @returns {void}
   */
  function schedule(delayMs = baseIntervalMs) {
    const normalizedDelayMs = Math.max(60000, Math.floor(delayMs));
    timer = setTimeout(() => {
      runOnce()
        .then((backupResult) => {
          consecutiveFailures = 0;
          if (!backupResult.skipped && logger && typeof logger.info === "function") {
            logger.info("database.backup.scheduled_completed", {
              backupPath: backupResult.backupPath,
            });
          }
          schedule(baseIntervalMs);
        })
        .catch((backupError) => {
          runtimeState.lastError = backupError instanceof Error ? backupError.message : String(backupError);
          consecutiveFailures += 1;
          const retryDelayMs = Math.min(
            baseIntervalMs * (2 ** Math.min(consecutiveFailures, 5)),
            maxBackoffMs,
          );
          if (logger && typeof logger.error === "function") {
            logger.error("database.backup.scheduled_failed", {
              consecutiveFailures,
              nextRetryInMs: retryDelayMs,
              error: backupError,
            });
          }
          schedule(retryDelayMs);
        });
    }, normalizedDelayMs);
    timer.unref();
  }

  /**
   * @returns {void}
   */
  function start() {
    if (!runtimeState.enabled) {
      return;
    }
    stop();
    consecutiveFailures = 0;
    schedule(baseIntervalMs);
  }

  /**
   * @returns {void}
   */
  function stop() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  /**
   * @returns {Record<string, any>}
   */
  function getState() {
    return {
      ...runtimeState,
    };
  }

  return {
    runOnce,
    start,
    stop,
    getState,
  };
}

export {
  createBackupJob,
};
