import { createAccountingBatchService } from "../services/accountingBatchService.js";
import type { DbRunResult } from "../types/dataLayer.js";
import type { LoggerLike, MetricsLike } from "../types/runtime.js";

type AccountingPeriodCloseJobOptions = {
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
  enabled?: boolean;
  intervalMs?: number;
  systemUserId?: number | null;
};

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function yesterdayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
}

function isMonthEnd(date: Date): boolean {
  const nextDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
  return nextDay.getUTCDate() === 1;
}

function isYearEnd(date: Date): boolean {
  return date.getUTCMonth() === 11 && date.getUTCDate() === 31;
}

function createAccountingPeriodCloseJob(options: AccountingPeriodCloseJobOptions) {
  const {
    run,
    get,
    all,
    executeTransaction,
    logger = null,
    metrics = null,
    enabled = true,
    intervalMs = 6 * 60 * 60 * 1000,
    systemUserId = null,
  } = options;

  const accountingBatchService = createAccountingBatchService({
    run,
    get,
    all,
    executeTransaction,
    logger,
    metrics,
  });

  let timer: NodeJS.Timeout | null = null;
  let inProgress = false;
  let lastRunAt: string | null = null;
  let lastResult: Record<string, any> | null = null;
  let lastError: string | null = null;

  async function runOnce() {
    if (!enabled) {
      return { skipped: true, reason: "disabled" };
    }
    if (inProgress) {
      return { skipped: true, reason: "job_in_progress" };
    }

    inProgress = true;
    try {
      const targetDate = yesterdayUtc();
      const effectiveDate = toDateOnly(targetDate);

      const eod = await accountingBatchService.runBatch({
        batchType: "eod",
        effectiveDate,
        note: "Automated close job",
        triggeredByUserId: systemUserId,
      });
      const results: Record<string, any> = { eod };

      if (isMonthEnd(targetDate)) {
        results.eom = await accountingBatchService.runBatch({
          batchType: "eom",
          effectiveDate,
          note: "Automated month-end close job",
          triggeredByUserId: systemUserId,
        });
      }
      if (isYearEnd(targetDate)) {
        results.eoy = await accountingBatchService.runBatch({
          batchType: "eoy",
          effectiveDate,
          note: "Automated year-end close job",
          triggeredByUserId: systemUserId,
        });
      }

      const result = {
        skipped: false,
        effectiveDate,
        results,
      };
      lastRunAt = new Date().toISOString();
      lastResult = result;
      lastError = null;
      return result;
    } catch (error) {
      lastRunAt = new Date().toISOString();
      lastError = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      inProgress = false;
    }
  }

  function getState() {
    return {
      enabled,
      inProgress,
      intervalMs,
      lastRunAt,
      lastResult,
      lastError,
    };
  }

  function start() {
    if (!enabled || timer) {
      return;
    }

    const normalizedIntervalMs = Math.max(5 * 60 * 1000, Math.floor(intervalMs));
    timer = setInterval(() => {
      void runOnce().catch((error) => {
        if (logger && typeof logger.error === "function") {
          logger.error("background.accounting_close.failed", { error });
        }
      });
    }, normalizedIntervalMs);
    if (typeof timer.unref === "function") {
      timer.unref();
    }
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return {
    runOnce,
    start,
    stop,
    getState,
  };
}

export {
  createAccountingPeriodCloseJob,
};
