/**
 * overdueSync — background job that marks overdue installments and loans.
 *
 * Gap 12 fix:
 *   The previous version updated `loans.status` directly via raw SQL, which
 *   bypassed the Loan aggregate and therefore never emitted the
 *   `LoanMarkedOverdue` domain event.
 *
 *   This version:
 *     1. Still uses a bulk SQL UPDATE for `loan_installments` (efficient).
 *     2. Queries which loan IDs were just promoted (have overdue installments
 *        AND are currently in active/restructured status in the DB).
 *     3. For each such loan, loads the aggregate via `loanRepository.findById`,
 *        calls `loan.markOverdue()`, and persists via `loanRepository.save()`.
 *     4. Publishes uncommitted events via `eventBus.publishAll()` so the
 *        `LoanMarkedOverdue` event reaches the outbox and all subscribers.
 *
 *   `loanRepository` and `eventBus` are optional in the options type for
 *   backwards compatibility. When omitted, the job falls back to a direct
 *   SQL UPDATE of the loans table (legacy behaviour, no domain event emitted).
 */
import type { LoggerLike, MetricsLike } from "../types/runtime.js";
import { getCurrentTenantId } from "../utils/tenantStore.js";
import type { DbRunResult } from "../types/dataLayer.js";
import type { ILoanRepository } from "../domain/loan/repositories/ILoanRepository.js";
import type { IEventBus } from "../infrastructure/events/IEventBus.js";
import { LoanId } from "../domain/loan/value-objects/LoanId.js";
import { createPenaltyEngine } from "../services/penaltyEngine.js";
import { createInterestAccrualEngine } from "../services/interestAccrualEngine.js";
import { getConfiguredDbClient } from "../utils/env.js";

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
  /** Gap 12: inject loanRepository + eventBus to emit LoanMarkedOverdue events */
  loanRepository?: ILoanRepository | null;
  eventBus?: IEventBus | null;
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
    loanRepository = null,
    eventBus = null,
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
  const dbClient = getConfiguredDbClient();
  const verifiedExistingTables = new Set<string>();
  const verifiedColumnSets = new Map<string, Set<string>>();

  function isSqliteMissingSchemaError(error: unknown) {
    const message = String(error instanceof Error ? error.message : error || "").toLowerCase();
    return message.includes("no such table") || message.includes("no such column");
  }

  async function tableExists(tableName: string): Promise<boolean> {
    if (verifiedExistingTables.has(tableName)) {
      return true;
    }

    let exists = false;
    if (dbClient === "postgres") {
      const row = await get(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1",
        [tableName],
      );
      exists = Boolean(row?.table_name);
    } else {
      const row = await get(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
        [tableName],
      );
      exists = Boolean(row?.name);
    }

    if (exists) {
      verifiedExistingTables.add(tableName);
    }

    return exists;
  }

  async function hasColumns(tableName: string, columnNames: string[]): Promise<boolean> {
    const normalizedColumnNames = columnNames.map((columnName) => columnName.toLowerCase());
    const verifiedColumns = verifiedColumnSets.get(tableName);
    if (verifiedColumns && normalizedColumnNames.every((columnName) => verifiedColumns.has(columnName))) {
      return true;
    }

    let available: Set<string>;
    if (dbClient === "postgres") {
      const columns = await all(
        "SELECT column_name AS name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1",
        [tableName],
      );
      available = new Set(columns.map((column) => String(column.name || "").toLowerCase()));
    } else {
      const columns = await all(`PRAGMA table_info(${tableName})`);
      available = new Set(columns.map((column) => String(column.name || "").toLowerCase()));
    }

    const hasAllColumns = normalizedColumnNames.every((columnName) => available.has(columnName));
    if (hasAllColumns) {
      const cache = verifiedColumns ?? new Set<string>();
      normalizedColumnNames.forEach((columnName) => cache.add(columnName));
      verifiedColumnSets.set(tableName, cache);
    }

    return hasAllColumns;
  }

  const sqliteTableExists = tableExists;
  const sqliteHasColumns = hasColumns;

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
   * Core sync: marks installments overdue, then promotes loan-level status
   * through the Loan aggregate so the LoanMarkedOverdue event is emitted.
   *
   * Returns the count of loans whose status was promoted in this run.
   */
  async function syncOverdueInstallments(): Promise<number> {
    const nowIso = new Date().toISOString();
    const today  = nowIso.slice(0, 10);

    // Step 1: bulk mark individual installments overdue (SQL is efficient here;
    // installments are not aggregate roots so there are no domain events for them).
    await executeTransaction(async (tx) => {
      await tx.run(
        `
          UPDATE loan_installments
          SET status = 'overdue'
          WHERE status = 'pending'
            AND date(due_date) < date(?)
            AND loan_id IN (
              SELECT id FROM loans WHERE tenant_id = ?
              AND status IN ('active', 'restructured', 'overdue')
            )
        `,
        [today, getCurrentTenantId()],
      );
    });

    // Step 2 (Gap 12 fix): find loans that now have overdue installments but
    // whose loan-level status has NOT yet been promoted. Load each through the
    // Loan aggregate so markOverdue() emits the domain event, then persist via
    // loanRepository.save() and publish via eventBus.publishAll().
    //
    // If loanRepository is not injected we fall back to a legacy bulk SQL
    // UPDATE for backwards compatibility (no domain event is emitted).
    const candidateRows = await all(
      `
        SELECT DISTINCT l.id,
               COUNT(li.id) AS overdue_installment_count
        FROM loans l
        INNER JOIN loan_installments li
               ON li.loan_id = l.id
              AND li.status = 'overdue'
        WHERE l.status IN ('active', 'restructured')
        GROUP BY l.id
      `,
      [],
    );

    if (candidateRows.length === 0) {
      return 0;
    }

    if (!loanRepository) {
      // Legacy fallback — no aggregate, no event
      const idList = candidateRows.map((r) => Number(r["id"]));
      const placeholders = idList.map(() => "?").join(", ");
      await run(
        `UPDATE loans SET status = 'overdue' WHERE id IN (${placeholders})`,
        idList,
      );
      if (logger && typeof logger.warn === "function") {
        logger.warn("background.overdue_sync.aggregate_path_skipped", {
          reason: "loanRepository not injected — domain event not emitted",
          affectedLoans: idList.length,
        });
      }
      return idList.length;
    }

    // Aggregate path: per-loan load → markOverdue() → save → publishAll
    let promoted = 0;
    for (const row of candidateRows) {
      const loanId    = Number(row["id"]);
      const overdueInstallments = Number(row["overdue_installment_count"] || 1);

      try {
        const loan = await loanRepository.findById(LoanId.fromNumber(loanId));
        if (!loan) {
          continue; // race condition: loan deleted between queries
        }

        // canAcceptRepayment() is true for active, overdue, and restructured.
        // canBeMarkedOverdue() is true only for active and restructured — it
        // excludes loans already sitting at overdue (idempotency guard).
        if (!loan.canAcceptRepayment() || !loan.canBeMarkedOverdue()) {
          continue;
        }

        loan.markOverdue(overdueInstallments);
        await loanRepository.save(loan);

        if (eventBus) {
          const events = loan.getUncommittedEvents();
          if (events.length > 0) {
            await eventBus.publishAll(events);
            loan.clearEvents();
          }
        }

        promoted += 1;
      } catch (perLoanError) {
        // Log and continue — a single bad row must not abort the whole batch
        if (logger && typeof logger.error === "function") {
          logger.error("background.overdue_sync.loan_promotion_failed", {
            loanId,
            error: perLoanError,
          });
        }
      }
    }

    return promoted;
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

      const promotedLoans = await syncOverdueInstallments();

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
          promotedLoans,
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
        promotedLoans,
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

  function start() {
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
  createOverdueSyncJob,
};
