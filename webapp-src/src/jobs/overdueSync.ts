import type { LoggerLike, MetricsLike } from "../types/runtime.js";
import type { DbRunResult } from "../types/dataLayer.js";
import { createPenaltyEngine } from "../services/penaltyEngine.js";
import { createInterestAccrualEngine } from "../services/interestAccrualEngine.js";

type OverdueSyncJobOptions = {
  run: (sql: string, params?: unknown[]) => Promise<DbRunResult>;
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  executeTransaction: (callback: (tx: {
    run: (sql: string, params?: unknown[]) => Promise<DbRunResult>;
    get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
    all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  }) => Promise<unknown> | unknown) => Promise<unknown>;
  logger?: LoggerLike | null;
  metrics?: MetricsLike | null;
  intervalMs: number;
};

function createOverdueSyncJob(options: OverdueSyncJobOptions) {
  const {
    run,
    get,
    all,
    executeTransaction,
    logger,
    metrics,
    intervalMs,
  } = options;
  const baseIntervalMs = Math.max(100, Math.floor(intervalMs || 60000));
  const maxBackoffMs = Math.max(baseIntervalMs, 15 * 60 * 1000);
  const penaltyEngine = createPenaltyEngine({
    get,
    all,
    executeTransaction,
    logger,
    metrics,
  });
  const interestAccrualEngine = createInterestAccrualEngine({
    get,
    all,
    executeTransaction,
    logger,
    metrics,
  });

  const runtimeState: {
    inProgress: boolean;
    lastRunAt: string | null;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastDurationMs: number | null;
    consecutiveFailures: number;
    lastError: string | null;
    degraded: boolean;
    nextRunAt: string | null;
    currentIntervalMs: number;
  } = {
    inProgress: false,
    lastRunAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastDurationMs: null,
    consecutiveFailures: 0,
    lastError: null,
    degraded: false,
    nextRunAt: null,
    currentIntervalMs: baseIntervalMs,
  };

  /** @type {NodeJS.Timeout | null} */
  let timer: NodeJS.Timeout | null = null;
  let warnedMissingCoreSchema = false;
  let warnedMissingPenaltySchema = false;
  let warnedMissingInterestAccrualSchema = false;

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

  async function sqliteHasColumns(tableName: string, columnNames: string[]): Promise<boolean> {
    const columns = await all(`PRAGMA table_info(${tableName})`);
    const available = new Set(columns.map((column) => String(column.name || "").toLowerCase()));
    return columnNames.every((columnName) => available.has(columnName.toLowerCase()));
  }

  async function hasCoreSyncSchema(): Promise<boolean> {
    const requiredTables = ["loan_installments", "loans"];
    const checks = await Promise.all(requiredTables.map((tableName) => sqliteTableExists(tableName)));
    return checks.every(Boolean);
  }

  async function hasPenaltySchema(): Promise<boolean> {
    const requiredTables = ["loan_installments", "loans", "loan_products", "gl_accounts"];
    const checks = await Promise.all(requiredTables.map((tableName) => sqliteTableExists(tableName)));
    if (!checks.every(Boolean)) {
      return false;
    }

    const [
      installmentColumnsOk,
      loansColumnsOk,
      productColumnsOk,
      accountColumnsOk,
    ] = await Promise.all([
      sqliteHasColumns("loan_installments", [
        "id",
        "loan_id",
        "installment_number",
        "due_date",
        "status",
        "amount_due",
        "amount_paid",
        "penalty_amount_accrued",
        "penalty_last_applied_at",
        "penalty_rate_daily",
        "penalty_flat_amount",
        "penalty_grace_days",
        "penalty_cap_amount",
        "penalty_compounding_method",
        "penalty_base_amount",
        "penalty_cap_percent_of_outstanding",
      ]),
      sqliteHasColumns("loans", ["id", "status", "product_id", "client_id", "branch_id"]),
      sqliteHasColumns("loan_products", [
        "id",
        "penalty_rate_daily",
        "penalty_flat_amount",
        "penalty_grace_days",
        "penalty_cap_amount",
        "penalty_compounding_method",
        "penalty_base_amount",
        "penalty_cap_percent_of_outstanding",
      ]),
      sqliteHasColumns("gl_accounts", ["id", "code", "is_active"]),
    ]);

    return installmentColumnsOk && loansColumnsOk && productColumnsOk && accountColumnsOk;
  }

  async function hasInterestAccrualSchema(): Promise<boolean> {
    const requiredTables = ["loan_interest_profiles", "loan_interest_accrual_events", "loans", "gl_accounts"];
    const checks = await Promise.all(requiredTables.map((tableName) => sqliteTableExists(tableName)));
    if (!checks.every(Boolean)) {
      return false;
    }

    const [profileColumnsOk, eventColumnsOk, accountColumnsOk] = await Promise.all([
      sqliteHasColumns("loan_interest_profiles", [
        "loan_id",
        "accrual_method",
        "accrual_start_at",
        "maturity_at",
        "total_contractual_interest",
        "accrued_interest",
        "last_accrual_at",
      ]),
      sqliteHasColumns("loan_interest_accrual_events", [
        "loan_id",
        "accrual_date",
        "amount",
      ]),
      sqliteHasColumns("gl_accounts", ["id", "code", "is_active"]),
    ]);

    return profileColumnsOk && eventColumnsOk && accountColumnsOk;
  }

  /**
   * @returns {Promise<void>}
   */
  async function syncOverdueInstallments() {
    const nowIso = new Date().toISOString();
    const markOverdueResult = await executeTransaction(async (tx) => {
      return tx.run(
        `
          UPDATE loan_installments
          SET status = 'overdue'
          WHERE status = 'pending'
            AND date(due_date) < date(?)
            AND loan_id IN (
              SELECT id
              FROM loans
              WHERE status IN ('active', 'restructured')
            )
        `,
        [nowIso.slice(0, 10)],
      );
    });
  }

  /**
   * @returns {Promise<{ skipped: boolean; success?: boolean; durationMs?: number; reason?: string }>}
   */
  async function runOnce() {
    if (runtimeState.inProgress) {
      return {
        skipped: true,
        reason: "sync_in_progress",
      };
    }

    runtimeState.inProgress = true;
    const startedAtMs = Date.now();

    try {
      const coreSchemaAvailable = await hasCoreSyncSchema();
      if (!coreSchemaAvailable) {
        const durationMs = Date.now() - startedAtMs;
        runtimeState.lastRunAt = new Date().toISOString();
        runtimeState.lastSuccessAt = runtimeState.lastRunAt;
        runtimeState.lastDurationMs = durationMs;
        runtimeState.consecutiveFailures = 0;
        runtimeState.lastError = null;
        runtimeState.degraded = false;

        if (!warnedMissingCoreSchema && logger && typeof logger.warn === "function") {
          logger.warn("background.overdue_sync.skipped_schema_incomplete", {
            reason: "missing_core_tables",
          });
          warnedMissingCoreSchema = true;
        }

        return {
          skipped: true,
          reason: "missing_core_tables",
        };
      }

      warnedMissingCoreSchema = false;

      await syncOverdueInstallments();
      let penaltySummary = {
        scannedInstallments: 0,
        chargedInstallments: 0,
        chargedAmount: 0,
      };
      let accrualSummary = {
        scannedLoans: 0,
        accruedLoans: 0,
        accruedAmount: 0,
      };
      const penaltySchemaAvailable = await hasPenaltySchema();
      if (!penaltySchemaAvailable) {
        if (!warnedMissingPenaltySchema && logger && typeof logger.info === "function") {
          logger.info("background.overdue_sync.penalty_skipped_schema_incomplete", {
            reason: "missing_penalty_tables",
          });
          warnedMissingPenaltySchema = true;
        }
      } else {
        warnedMissingPenaltySchema = false;
        try {
          penaltySummary = await penaltyEngine.applyPenalties();
        } catch (penaltyError) {
          if (!isSqliteMissingSchemaError(penaltyError)) {
            throw penaltyError;
          }

          if (logger && typeof logger.warn === "function") {
            logger.warn("background.overdue_sync.penalty_skipped_schema_mismatch", {
              reason: "sql_schema_mismatch",
            });
          }
        }
      }

      const interestAccrualSchemaAvailable = await hasInterestAccrualSchema();
      if (!interestAccrualSchemaAvailable) {
        if (!warnedMissingInterestAccrualSchema && logger && typeof logger.info === "function") {
          logger.info("background.overdue_sync.interest_accrual_skipped_schema_incomplete", {
            reason: "missing_interest_accrual_tables",
          });
          warnedMissingInterestAccrualSchema = true;
        }
      } else {
        warnedMissingInterestAccrualSchema = false;
        try {
          accrualSummary = await interestAccrualEngine.applyDailyAccruals();
        } catch (accrualError) {
          if (!isSqliteMissingSchemaError(accrualError)) {
            throw accrualError;
          }

          if (logger && typeof logger.warn === "function") {
            logger.warn("background.overdue_sync.interest_accrual_skipped_schema_mismatch", {
              reason: "sql_schema_mismatch",
            });
          }
        }
      }
      const durationMs = Date.now() - startedAtMs;

      runtimeState.lastRunAt = new Date().toISOString();
      runtimeState.lastSuccessAt = runtimeState.lastRunAt;
      runtimeState.lastDurationMs = durationMs;
      runtimeState.consecutiveFailures = 0;
      runtimeState.lastError = null;
      runtimeState.degraded = false;

      if (metrics && typeof metrics.observeBackgroundTask === "function") {
        metrics.observeBackgroundTask("overdue_installment_sync", {
          success: true,
          durationMs,
          penaltyScannedInstallments: penaltySummary.scannedInstallments,
          penaltyChargedInstallments: penaltySummary.chargedInstallments,
          penaltyChargedAmount: penaltySummary.chargedAmount,
          interestAccrualScannedLoans: accrualSummary.scannedLoans,
          interestAccrualAccruedLoans: accrualSummary.accruedLoans,
          interestAccrualAccruedAmount: accrualSummary.accruedAmount,
        });
      }

      return {
        skipped: false,
        success: true,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startedAtMs;
      runtimeState.lastRunAt = new Date().toISOString();
      runtimeState.lastFailureAt = runtimeState.lastRunAt;
      runtimeState.lastDurationMs = durationMs;
      runtimeState.consecutiveFailures += 1;
      runtimeState.lastError = error instanceof Error ? error.message : String(error);
      runtimeState.degraded = true;

      if (metrics && typeof metrics.observeBackgroundTask === "function") {
        metrics.observeBackgroundTask("overdue_installment_sync", {
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

  /**
   * @param {number} [delayMs]
   * @returns {void}
   */
  function schedule(delayMs = baseIntervalMs) {
    const normalizedDelayMs = Math.max(100, Math.floor(delayMs));
    runtimeState.currentIntervalMs = normalizedDelayMs;
    runtimeState.nextRunAt = new Date(Date.now() + normalizedDelayMs).toISOString();

    timer = setTimeout(async () => {
      try {
        await runOnce();
        schedule(baseIntervalMs);
      } catch (syncError) {
        const retryDelayMs = Math.min(
          baseIntervalMs * (2 ** Math.min(runtimeState.consecutiveFailures, 5)),
          maxBackoffMs,
        );
        if (logger && typeof logger.error === "function") {
          logger.error("background.overdue_sync.failed", {
            consecutiveFailures: runtimeState.consecutiveFailures,
            nextRetryInMs: retryDelayMs,
            error: syncError,
          });
        }
        schedule(retryDelayMs);
      }
    }, normalizedDelayMs);
    timer.unref();
  }

  /**
   * @returns {void}
   */
  function start() {
    stop();
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
    runtimeState.nextRunAt = null;
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
  createOverdueSyncJob,
};
