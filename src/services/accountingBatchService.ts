import { createInterestAccrualEngine } from "./interestAccrualEngine.js";
import type { DbRunResult, DbTransactionContext } from "../types/dataLayer.js";
import type { LoggerLike, MetricsLike } from "../types/runtime.js";
import { Decimal } from "decimal.js";

type BatchType = "eod" | "eom" | "eoy";

type AccountingBatchServiceOptions = {
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  run: (sql: string, params?: unknown[]) => Promise<DbRunResult>;
  executeTransaction: (callback: (tx: DbTransactionContext) => Promise<unknown> | unknown) => Promise<unknown>;
  logger?: LoggerLike | null;
  metrics?: MetricsLike | null;
};

function toDateOnly(value: unknown, fallback = new Date()): string {
  const parsed = value ? new Date(String(value)) : fallback;
  if (Number.isNaN(parsed.getTime())) {
    return fallback.toISOString().slice(0, 10);
  }
  return parsed.toISOString().slice(0, 10);
}

function toUtcMidnightIso(value: unknown, fallback = new Date()): string {
  const dateOnly = toDateOnly(value, fallback);
  return `${dateOnly}T00:00:00.000Z`;
}

function normalizeBatchType(value: unknown): BatchType {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "eom") return "eom";
  if (normalized === "eoy") return "eoy";
  return "eod";
}

function getMonthStart(dateOnly: string): string {
  const parsed = new Date(`${dateOnly}T00:00:00.000Z`);
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function getYearStart(dateOnly: string): string {
  const parsed = new Date(`${dateOnly}T00:00:00.000Z`);
  return new Date(Date.UTC(parsed.getUTCFullYear(), 0, 1)).toISOString().slice(0, 10);
}

function createAccountingBatchService(options: AccountingBatchServiceOptions) {
  const {
    get,
    all,
    run,
    executeTransaction,
    logger = null,
    metrics = null,
  } = options;

  const interestAccrualEngine = createInterestAccrualEngine({
    get,
    all,
    executeTransaction,
    logger,
    metrics,
  });

  async function listBatchRuns(params: {
    batchType?: string | null;
    limit?: number;
  } = {}) {
    const normalizedLimit = Math.max(1, Math.min(200, Math.floor(Number(params.limit || 30))));
    const batchType = String(params.batchType || "").trim().toLowerCase();
    const hasBatchType = ["eod", "eom", "eoy"].includes(batchType);

    return all(
      `
        SELECT
          id,
          batch_type,
          effective_date,
          status,
          started_at,
          completed_at,
          triggered_by_user_id,
          summary_json,
          error_message,
          created_at
        FROM gl_batch_runs
        ${hasBatchType ? "WHERE batch_type = ?" : ""}
        ORDER BY datetime(started_at) DESC, id DESC
        LIMIT ?
      `,
      hasBatchType ? [batchType, normalizedLimit] : [normalizedLimit],
    );
  }

  async function listPeriodLocks(params: {
    lockType?: string | null;
    limit?: number;
  } = {}) {
    const normalizedLimit = Math.max(1, Math.min(200, Math.floor(Number(params.limit || 30))));
    const lockType = String(params.lockType || "").trim().toLowerCase();
    const hasLockType = ["eod", "eom", "eoy"].includes(lockType);

    return all(
      `
        SELECT
          l.id,
          l.batch_run_id,
          l.lock_type,
          l.lock_date,
          l.status,
          l.note,
          l.locked_by_user_id,
          l.locked_at,
          l.created_at,
          b.status AS batch_status,
          b.completed_at AS batch_completed_at
        FROM gl_period_locks l
        LEFT JOIN gl_batch_runs b ON b.id = l.batch_run_id
        ${hasLockType ? "WHERE l.lock_type = ?" : ""}
        ORDER BY date(l.lock_date) DESC, datetime(l.locked_at) DESC, l.id DESC
        LIMIT ?
      `,
      hasLockType ? [lockType, normalizedLimit] : [normalizedLimit],
    );
  }

  async function buildTrialSnapshotForDate({
    tx,
    snapshotDate,
    batchRunId,
    periodFrom,
    periodTo,
  }: {
    tx: DbTransactionContext;
    snapshotDate: string;
    batchRunId: number;
    periodFrom?: string | null;
    periodTo?: string | null;
  }) {
    const conditions: string[] = [];
    const queryParams: unknown[] = [];

    if (periodFrom) {
      conditions.push("date(j.posted_at) >= date(?)");
      queryParams.push(periodFrom);
    }
    if (periodTo) {
      conditions.push("date(j.posted_at) <= date(?)");
      queryParams.push(periodTo);
    }
    if (!periodFrom && !periodTo) {
      conditions.push("date(j.posted_at) <= date(?)");
      queryParams.push(snapshotDate);
    }

    const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = await tx.all(
      `
        SELECT
          a.id AS account_id,
          j.branch_id AS branch_id,
          COALESCE(NULLIF(TRIM(j.base_currency), ''), 'KES') AS currency,
          ROUND(COALESCE(SUM(CASE WHEN e.side = 'debit' THEN e.amount ELSE 0 END), 0), 2) AS debit_total,
          ROUND(COALESCE(SUM(CASE WHEN e.side = 'credit' THEN e.amount ELSE 0 END), 0), 2) AS credit_total
        FROM gl_entries e
        INNER JOIN gl_journals j ON j.id = e.journal_id
        INNER JOIN gl_accounts a ON a.id = e.account_id
        ${whereSql}
        GROUP BY a.id, j.branch_id, COALESCE(NULLIF(TRIM(j.base_currency), ''), 'KES')
      `,
      queryParams,
    );

    await tx.run("DELETE FROM gl_balance_snapshots WHERE date(snapshot_date) = date(?)", [snapshotDate]);
    await tx.run("DELETE FROM gl_trial_balance_snapshots WHERE date(snapshot_date) = date(?)", [snapshotDate]);

    const nowIso = new Date().toISOString();
    for (const row of rows) {
      const debitTotal = Number(row.debit_total || 0);
      const creditTotal = Number(row.credit_total || 0);
      const netBalance = new Decimal(debitTotal).minus(creditTotal).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
      await tx.run(
        `
          INSERT INTO gl_balance_snapshots (
            batch_run_id,
            snapshot_date,
            account_id,
            branch_id,
            currency,
            debit_total,
            credit_total,
            net_balance,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          batchRunId,
          snapshotDate,
          Number(row.account_id || 0),
          Number(row.branch_id || 0) || null,
          String(row.currency || "KES"),
          debitTotal,
          creditTotal,
          netBalance,
          nowIso,
        ],
      );
    }

    const totals = await tx.get(
      `
        SELECT
          ROUND(COALESCE(SUM(CASE WHEN e.side = 'debit' THEN e.amount ELSE 0 END), 0), 2) AS total_debit,
          ROUND(COALESCE(SUM(CASE WHEN e.side = 'credit' THEN e.amount ELSE 0 END), 0), 2) AS total_credit,
          COUNT(DISTINCT e.account_id) AS row_count
        FROM gl_entries e
        INNER JOIN gl_journals j ON j.id = e.journal_id
        ${whereSql}
      `,
      queryParams,
    );
    const totalDebit = Number(totals?.total_debit || 0);
    const totalCredit = Number(totals?.total_credit || 0);
    const rowCount = Number(totals?.row_count || 0);
    const balanced = Math.abs(totalDebit - totalCredit) <= 0.005 ? 1 : 0;

    await tx.run(
      `
        INSERT INTO gl_trial_balance_snapshots (
          batch_run_id,
          snapshot_date,
          branch_id,
          currency,
          total_debit,
          total_credit,
          balanced,
          row_count,
          created_at
        )
        VALUES (?, ?, NULL, 'KES', ?, ?, ?, ?, ?)
      `,
      [batchRunId, snapshotDate, totalDebit, totalCredit, balanced, rowCount, nowIso],
    );

    return {
      totalDebit,
      totalCredit,
      balanced: balanced === 1,
      rowCount,
      snapshotRows: rows.length,
    };
  }

  async function runBatch(payload: {
    batchType: BatchType | string;
    effectiveDate?: string | Date | null;
    triggeredByUserId?: number | null;
    note?: string | null;
  }) {
    const batchType = normalizeBatchType(payload.batchType);
    const effectiveDate = toDateOnly(payload.effectiveDate);
    const effectiveDateIso = toUtcMidnightIso(effectiveDate);
    const triggeredByUserId = Number(payload.triggeredByUserId || 0) || null;
    const nowIso = new Date().toISOString();

    const existingBatchRun = await get(
      `
        SELECT
          id,
          status,
          summary_json
        FROM gl_batch_runs
        WHERE batch_type = ?
          AND date(effective_date) = date(?)
        ORDER BY id DESC
        LIMIT 1
      `,
      [batchType, effectiveDate],
    );

    if (existingBatchRun && String(existingBatchRun.status || "").toLowerCase() === "completed") {
      return {
        id: Number(existingBatchRun.id),
        batch_type: batchType,
        effective_date: effectiveDate,
        status: "completed",
        already_ran: true,
        summary: (() => {
          try {
            return existingBatchRun.summary_json ? JSON.parse(String(existingBatchRun.summary_json)) : null;
          } catch {
            return null;
          }
        })(),
      };
    }

    const normalizedBatchType = batchType;
    const effectiveDateOnly = effectiveDate;
    const note = payload.note ? String(payload.note).trim() : null;

    const batchId = await executeTransaction(async (tx) => {
      const existing = await tx.get(
        `
          SELECT id, status
          FROM gl_accounting_batches
          WHERE LOWER(TRIM(COALESCE(batch_type, ''))) = ?
            AND date(effective_date) = date(?)
          LIMIT 1
        `,
        [normalizedBatchType, effectiveDateOnly],
      );

      if (existing) {
        const existingStatus = String(existing.status || "").trim().toLowerCase();
        if (["pending", "processing", "completed"].includes(existingStatus)) {
          return null;
        }
      }

      const inserted = await tx.run(
        `
          INSERT INTO gl_accounting_batches (
            batch_type,
            effective_date,
            status,
            triggered_by_user_id,
            note,
            created_at,
            updated_at
          )
          VALUES (?, ?, 'pending', ?, ?, ?, ?)
        `,
        [normalizedBatchType, effectiveDateOnly, triggeredByUserId, note, nowIso, nowIso],
      );
      return Number(inserted.lastID || 0);
    });

    if (!batchId) {
      const existingStatusQuery = await get(
        `
          SELECT status
          FROM gl_accounting_batches
          WHERE LOWER(TRIM(COALESCE(batch_type, ''))) = ?
            AND date(effective_date) = date(?)
          LIMIT 1
        `,
        [normalizedBatchType, effectiveDateOnly],
      );
       return { skipped: true, reason: existingStatusQuery?.status ? `batch_already_${existingStatusQuery.status}` : "batch_already_exists_or_completed" };
    }

    const insertBatch = await run(
      `
        INSERT INTO gl_batch_runs (
          batch_type,
          effective_date,
          status,
          started_at,
          completed_at,
          triggered_by_user_id,
          summary_json,
          error_message,
          created_at
        )
        VALUES (?, ?, 'running', ?, NULL, ?, NULL, NULL, ?)
      `,
      [batchType, effectiveDateIso, nowIso, triggeredByUserId, nowIso],
    );
    const batchRunId = Number(insertBatch.lastID || 0);
    if (!batchRunId) {
      throw new Error("Failed to start GL batch run");
    }

    try {
      const periodFrom = batchType === "eom"
        ? getMonthStart(effectiveDate)
        : batchType === "eoy"
          ? getYearStart(effectiveDate)
          : null;
      const periodTo = batchType === "eod" ? effectiveDate : effectiveDate;

      const accrualSummary = batchType === "eod"
        ? await interestAccrualEngine.applyDailyAccruals()
        : {
          scannedLoans: 0,
          accruedLoans: 0,
          accruedAmount: 0,
        };

      const snapshotSummary = await executeTransaction(async (tx) => {
        const existingLock = await tx.get(
          `
            SELECT id
          FROM gl_period_locks
          WHERE lock_type = ?
              AND date(lock_date) = date(?)
              AND LOWER(TRIM(COALESCE(status, ''))) = 'locked'
            LIMIT 1
          `,
          [batchType, effectiveDate],
        );

        const trial = await buildTrialSnapshotForDate({
          tx,
          snapshotDate: effectiveDateIso,
          batchRunId,
          periodFrom,
          periodTo,
        });

        if (!existingLock) {
          await tx.run(
            `
              INSERT INTO gl_period_locks (
                batch_run_id,
                lock_type,
                lock_date,
                status,
                note,
                locked_by_user_id,
                locked_at,
                created_at
              )
              VALUES (?, ?, ?, 'locked', ?, ?, ?, ?)
            `,
            [
              batchRunId,
              batchType,
              effectiveDate,
              payload.note ? String(payload.note).trim() : null,
              triggeredByUserId,
              nowIso,
              nowIso,
            ],
          );
        }

        return {
          ...trial,
          lockCreated: !existingLock,
          alreadyLocked: Boolean(existingLock),
        };
      });

      const summary = {
        batchType,
        effectiveDate,
        periodFrom: periodFrom || effectiveDate,
        periodTo: periodTo || effectiveDate,
        accrual: accrualSummary,
        trial: snapshotSummary,
      };

      await run(
        `
          UPDATE gl_batch_runs
          SET
            status = 'completed',
            completed_at = ?,
            summary_json = ?,
            error_message = NULL
          WHERE id = ?
        `,
        [new Date().toISOString(), JSON.stringify(summary), batchRunId],
      );

      if (metrics && typeof metrics.observeBackgroundTask === "function") {
        metrics.observeBackgroundTask(`gl_batch_${batchType}`, {
          batchRunId,
          effectiveDate,
          success: true,
        });
      }

      return {
        id: batchRunId,
        batch_type: batchType,
        effective_date: effectiveDate,
        status: "completed",
        already_ran: false,
        summary,
      };
    } catch (error) {
      await run(
        `
          UPDATE gl_batch_runs
          SET
            status = 'failed',
            completed_at = ?,
            error_message = ?
          WHERE id = ?
        `,
        [
          new Date().toISOString(),
          error instanceof Error ? error.message : String(error || "Batch failed"),
          batchRunId,
        ],
      );

      if (metrics && typeof metrics.observeBackgroundTask === "function") {
        metrics.observeBackgroundTask(`gl_batch_${batchType}`, {
          batchRunId,
          effectiveDate,
          success: false,
        });
      }

      throw error;
    }
  }

  return {
    listBatchRuns,
    listPeriodLocks,
    runBatch,
  };
}

export {
  createAccountingBatchService,
};
