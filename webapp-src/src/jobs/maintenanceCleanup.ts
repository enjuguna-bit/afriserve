import type { DbRunResult } from "../types/dataLayer.js";
import type { LoggerLike, MetricsLike } from "../types/runtime.js";

type MaintenanceCleanupJobOptions = {
  run: (sql: string, params?: unknown[]) => Promise<DbRunResult>;
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  logger?: LoggerLike | null;
  metrics?: MetricsLike | null;
  enabled: boolean;
  intervalMs: number;
  archiveClosedLoansOlderThanYears: number;
  purgeSoftDeletedClientsOlderThanDays: number;
};

function createMaintenanceCleanupJob(options: MaintenanceCleanupJobOptions) {
  const {
    run,
    get,
    all,
    logger,
    metrics,
    enabled,
    intervalMs,
    archiveClosedLoansOlderThanYears,
    purgeSoftDeletedClientsOlderThanDays,
  } = options;

  const baseIntervalMs = Math.max(5 * 60 * 1000, Math.floor(intervalMs || (24 * 60 * 60 * 1000)));
  const maxBackoffMs = Math.max(baseIntervalMs, 24 * 60 * 60 * 1000);

  const runtimeState: {
    enabled: boolean;
    inProgress: boolean;
    lastRunAt: string | null;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastDurationMs: number | null;
    lastError: string | null;
    consecutiveFailures: number;
    nextRunAt: string | null;
  } = {
    enabled: Boolean(enabled),
    inProgress: false,
    lastRunAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastDurationMs: null,
    lastError: null,
    consecutiveFailures: 0,
    nextRunAt: null,
  };

  /** @type {NodeJS.Timeout | null} */
  let timer: NodeJS.Timeout | null = null;

  function isSqliteMissingSchemaError(error: unknown) {
    const message = String(error instanceof Error ? error.message : error || "").toLowerCase();
    return message.includes("no such table") || message.includes("no such column");
  }

  async function sqliteTableExists(tableName: string): Promise<boolean> {
    const row = await get(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
      [tableName],
    );
    return Boolean(row?.name);
  }

  async function sqliteColumnExists(tableName: string, columnName: string): Promise<boolean> {
    const columns = await all(`PRAGMA table_info(${tableName})`);
    return columns.some((column) => String(column.name || "").toLowerCase() === columnName.toLowerCase());
  }

  async function runOnce() {
    if (!runtimeState.enabled) {
      return {
        skipped: true,
        reason: "maintenance_cleanup_disabled",
      };
    }

    if (runtimeState.inProgress) {
      return {
        skipped: true,
        reason: "maintenance_cleanup_in_progress",
      };
    }

    runtimeState.inProgress = true;
    const startedAtMs = Date.now();

    try {
      const now = Date.now();
      const archiveCutoffIso = new Date(now - (Math.max(1, archiveClosedLoansOlderThanYears) * 365 * 24 * 60 * 60 * 1000)).toISOString();
      const softDeleteCutoffIso = new Date(now - (Math.max(1, purgeSoftDeletedClientsOlderThanDays) * 24 * 60 * 60 * 1000)).toISOString();

      let expiredResetsChanges = 0;
      const passwordResetsTableExists = await sqliteTableExists("password_resets");
      if (passwordResetsTableExists) {
        const expiredResets = await run(
          `
            DELETE FROM password_resets
            WHERE
              (expires_at IS NOT NULL AND expires_at < ?)
              OR (used_at IS NOT NULL AND used_at < ?)
          `,
          [new Date().toISOString(), softDeleteCutoffIso],
        );
        expiredResetsChanges = Number(expiredResets?.changes || 0);
      }

      let archivedLoansChanges = 0;
      const loansTableExists = await sqliteTableExists("loans");
      const loansHasArchivedAt = loansTableExists && await sqliteColumnExists("loans", "archived_at");
      const loansHasStatus = loansTableExists && await sqliteColumnExists("loans", "status");
      const loansHasDisbursedAt = loansTableExists && await sqliteColumnExists("loans", "disbursed_at");
      const loansHasCreatedAt = loansTableExists && await sqliteColumnExists("loans", "created_at");
      if (loansHasArchivedAt && loansHasStatus && loansHasDisbursedAt && loansHasCreatedAt) {
        const archivedLoans = await run(
          `
            UPDATE loans
            SET archived_at = ?
            WHERE
              status = 'closed'
              AND archived_at IS NULL
              AND COALESCE(disbursed_at, created_at) < ?
          `,
          [new Date().toISOString(), archiveCutoffIso],
        );
        archivedLoansChanges = Number(archivedLoans?.changes || 0);
      } else {
        if (logger && typeof logger.warn === "function") {
          logger.warn("maintenance.cleanup.archive_skipped_schema_incomplete", {
            reason: "missing_loans_archive_columns",
          });
        }
      }

      let purgedClientsChanges = 0;
      const clientsTableExists = await sqliteTableExists("clients");
      const loansExistsForPurge = await sqliteTableExists("loans");
      const transactionsExistsForPurge = await sqliteTableExists("transactions");
      const glJournalsExistsForPurge = await sqliteTableExists("gl_journals");
      const clientsHasDeletedAt = clientsTableExists && await sqliteColumnExists("clients", "deleted_at");
      if (clientsHasDeletedAt && loansExistsForPurge && transactionsExistsForPurge && glJournalsExistsForPurge) {
        const purgedClients = await run(
          `
            DELETE FROM clients
            WHERE deleted_at IS NOT NULL
              AND deleted_at < ?
              AND NOT EXISTS (SELECT 1 FROM loans l WHERE l.client_id = clients.id)
              AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.client_id = clients.id)
              AND NOT EXISTS (SELECT 1 FROM gl_journals g WHERE g.client_id = clients.id)
          `,
          [softDeleteCutoffIso],
        );
        purgedClientsChanges = Number(purgedClients?.changes || 0);
      } else {
        if (logger && typeof logger.warn === "function") {
          logger.warn("maintenance.cleanup.purge_skipped_schema_incomplete", {
            reason: "missing_client_purge_schema",
          });
        }
      }

      const durationMs = Date.now() - startedAtMs;
      const nowIso = new Date().toISOString();
      runtimeState.lastRunAt = nowIso;
      runtimeState.lastSuccessAt = nowIso;
      runtimeState.lastFailureAt = null;
      runtimeState.lastDurationMs = durationMs;
      runtimeState.lastError = null;
      runtimeState.consecutiveFailures = 0;

      if (metrics && typeof metrics.observeBackgroundTask === "function") {
        metrics.observeBackgroundTask("maintenance_cleanup", {
          success: true,
          durationMs,
          deletedPasswordResets: expiredResetsChanges,
          archivedLoans: archivedLoansChanges,
          purgedClients: purgedClientsChanges,
        });
      }

      return {
        skipped: false,
        success: true,
        durationMs,
        deletedPasswordResets: expiredResetsChanges,
        archivedLoans: archivedLoansChanges,
        purgedClients: purgedClientsChanges,
      };
    } catch (error) {
      const durationMs = Date.now() - startedAtMs;
      const nowIso = new Date().toISOString();
      runtimeState.lastRunAt = nowIso;
      runtimeState.lastFailureAt = nowIso;
      runtimeState.lastDurationMs = durationMs;
      runtimeState.lastError = error instanceof Error ? error.message : String(error);
      runtimeState.consecutiveFailures += 1;

      if (metrics && typeof metrics.observeBackgroundTask === "function") {
        metrics.observeBackgroundTask("maintenance_cleanup", {
          success: false,
          durationMs,
          errorMessage: runtimeState.lastError,
        });
      }

      throw error;
    } finally {
      runtimeState.inProgress = false;
    }
  }

  function schedule(delayMs = baseIntervalMs) {
    const normalizedDelayMs = Math.max(1000, Math.floor(delayMs));
    runtimeState.nextRunAt = new Date(Date.now() + normalizedDelayMs).toISOString();
    timer = setTimeout(() => {
      runOnce()
        .then((result) => {
          if (!result.skipped && logger && typeof logger.info === "function") {
            logger.info("maintenance.cleanup.completed", {
              deletedPasswordResets: result.deletedPasswordResets,
              archivedLoans: result.archivedLoans,
              purgedClients: result.purgedClients,
            });
          }
          schedule(baseIntervalMs);
        })
        .catch((cleanupError) => {
          const retryDelayMs = Math.min(
            baseIntervalMs * (2 ** Math.min(runtimeState.consecutiveFailures, 5)),
            maxBackoffMs,
          );
          if (logger && typeof logger.error === "function") {
            logger.error("maintenance.cleanup.failed", {
              consecutiveFailures: runtimeState.consecutiveFailures,
              nextRetryInMs: retryDelayMs,
              error: cleanupError,
            });
          }
          schedule(retryDelayMs);
        });
    }, normalizedDelayMs);
    timer.unref();
  }

  function start() {
    if (!runtimeState.enabled) {
      return;
    }
    stop();
    schedule(baseIntervalMs);
  }

  function stop() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    runtimeState.nextRunAt = null;
  }

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
  createMaintenanceCleanupJob,
};
