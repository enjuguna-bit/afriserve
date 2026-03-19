import type { LoggerLike, MetricsLike } from "../types/runtime.js";

type B2CCoreDisbursementJobOptions = {
  mobileMoneyService?: {
    processPendingB2CCoreDisbursements: (args?: { limit?: number; minAgeMs?: number }) => Promise<{
      scanned: number;
      claimed: number;
      processed: number;
      succeeded: number;
      failed: number;
      skipped?: boolean;
      reason?: string;
    }>;
  } | null;
  logger?: LoggerLike | null;
  metrics?: MetricsLike | null;
  enabled: boolean;
  intervalMs: number;
  batchSize?: number;
  minAgeMs?: number;
};

function createB2CCoreDisbursementJob(options: B2CCoreDisbursementJobOptions) {
  const {
    mobileMoneyService = null,
    logger = null,
    metrics = null,
    enabled,
    intervalMs,
    batchSize = 25,
    minAgeMs = 30000,
  } = options;

  const baseIntervalMs = Math.max(1000, Math.floor(intervalMs || 60000));
  const maxBackoffMs = Math.max(baseIntervalMs, 10 * 60 * 1000);
  const runtimeState: {
    enabled: boolean;
    inProgress: boolean;
    lastRunAt: string | null;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastDurationMs: number | null;
    consecutiveFailures: number;
    lastError: string | null;
    nextRunAt: string | null;
    intervalMs: number;
    batchSize: number;
    minAgeMs: number;
  } = {
    enabled: Boolean(enabled),
    inProgress: false,
    lastRunAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastDurationMs: null,
    consecutiveFailures: 0,
    lastError: null,
    nextRunAt: null,
    intervalMs: baseIntervalMs,
    batchSize,
    minAgeMs,
  };

  /** @type {NodeJS.Timeout | null} */
  let timer: NodeJS.Timeout | null = null;

  async function runOnce() {
    if (!runtimeState.enabled) {
      return { skipped: true, reason: "b2c_core_retry_disabled" };
    }
    if (!mobileMoneyService || typeof mobileMoneyService.processPendingB2CCoreDisbursements !== "function") {
      return { skipped: true, reason: "b2c_core_retry_missing_service" };
    }
    if (runtimeState.inProgress) {
      return { skipped: true, reason: "b2c_core_retry_in_progress" };
    }

    runtimeState.inProgress = true;
    const startedAtMs = Date.now();

    try {
      const result = await mobileMoneyService.processPendingB2CCoreDisbursements({
        limit: Math.max(1, Math.floor(batchSize || 1)),
        minAgeMs: Math.max(1000, Math.floor(minAgeMs || 0)),
      });
      const durationMs = Date.now() - startedAtMs;
      const nowIso = new Date().toISOString();
      runtimeState.lastRunAt = nowIso;
      runtimeState.lastSuccessAt = nowIso;
      runtimeState.lastFailureAt = null;
      runtimeState.lastDurationMs = durationMs;
      runtimeState.consecutiveFailures = 0;
      runtimeState.lastError = null;

      if (metrics && typeof metrics.observeBackgroundTask === "function") {
        metrics.observeBackgroundTask("mobile_money.b2c.core_retry", {
          success: true,
          durationMs,
          scanned: result.scanned,
          claimed: result.claimed,
          processed: result.processed,
          succeeded: result.succeeded,
          failed: result.failed,
        });
      }

      if (logger && typeof logger.info === "function") {
        logger.info("mobile_money.b2c.core_retry.completed", {
          scanned: result.scanned,
          claimed: result.claimed,
          processed: result.processed,
          succeeded: result.succeeded,
          failed: result.failed,
          durationMs,
        });
      }

      return {
        skipped: false,
        ...result,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startedAtMs;
      const nowIso = new Date().toISOString();
      runtimeState.lastRunAt = nowIso;
      runtimeState.lastFailureAt = nowIso;
      runtimeState.lastDurationMs = durationMs;
      runtimeState.consecutiveFailures += 1;
      runtimeState.lastError = error instanceof Error ? error.message : String(error);

      if (metrics && typeof metrics.observeBackgroundTask === "function") {
        metrics.observeBackgroundTask("mobile_money.b2c.core_retry", {
          success: false,
          durationMs,
          errorMessage: runtimeState.lastError,
        });
      }

      if (logger && typeof logger.warn === "function") {
        logger.warn("mobile_money.b2c.core_retry.failed", {
          error,
          durationMs,
        });
      }

      throw error;
    } finally {
      runtimeState.inProgress = false;
    }
  }

  function getState() {
    return {
      ...runtimeState,
    };
  }

  function schedule(delayMs = baseIntervalMs) {
    const normalizedDelayMs = Math.max(1000, Math.floor(delayMs));
    runtimeState.intervalMs = normalizedDelayMs;
    runtimeState.nextRunAt = new Date(Date.now() + normalizedDelayMs).toISOString();

    timer = setTimeout(() => {
      runOnce()
        .then(() => {
          schedule(baseIntervalMs);
        })
        .catch((retryError) => {
          const retryDelayMs = Math.min(
            baseIntervalMs * (2 ** Math.min(runtimeState.consecutiveFailures, 5)),
            maxBackoffMs,
          );
          if (logger && typeof logger.warn === "function") {
            logger.warn("mobile_money.b2c.core_retry.failed", {
              consecutiveFailures: runtimeState.consecutiveFailures,
              nextRetryInMs: retryDelayMs,
              error: retryError,
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

  return {
    runOnce,
    start,
    stop,
    getState,
    intervalMs: baseIntervalMs,
  };
}

export {
  createB2CCoreDisbursementJob,
};
