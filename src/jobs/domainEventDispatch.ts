import type { LoggerLike, MetricsLike } from "../types/runtime.js";

type DomainEventDispatchJobOptions = {
  domainEventService: {
    dispatchPendingEvents: (args?: { limit?: number }) => Promise<{ published: number; failed: number }>;
  };
  logger?: LoggerLike | null;
  metrics?: MetricsLike | null;
  enabled: boolean;
  intervalMs: number;
  batchSize?: number;
};

function createDomainEventDispatchJob(options: DomainEventDispatchJobOptions) {
  const {
    domainEventService,
    logger = null,
    metrics = null,
    enabled,
    intervalMs,
    batchSize = 100,
  } = options;

  const baseIntervalMs = Math.max(1000, Math.floor(intervalMs || 10000));
  const maxBackoffMs = Math.max(baseIntervalMs, 5 * 60 * 1000);
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
  };

  /** @type {NodeJS.Timeout | null} */
  let timer: NodeJS.Timeout | null = null;

  async function runOnce() {
    if (!runtimeState.enabled) {
      return { skipped: true, reason: "domain_event_dispatch_disabled" };
    }
    if (runtimeState.inProgress) {
      return { skipped: true, reason: "domain_event_dispatch_in_progress" };
    }

    runtimeState.inProgress = true;
    const startedAtMs = Date.now();

    try {
      const result = await domainEventService.dispatchPendingEvents({
        limit: Math.max(1, Math.floor(batchSize || 1)),
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
        metrics.observeBackgroundTask("domain_events.dispatch", {
          success: true,
          durationMs,
          published: result.published,
          failed: result.failed,
        });
      }

      const publishedCount = Number(result.published || 0);
      const failedCount = Number(result.failed || 0);
      if (publishedCount > 0 || failedCount > 0) {
        if (logger && typeof logger.info === "function") {
          logger.info("domain_events.dispatch.completed", {
            published: publishedCount,
            failed: failedCount,
            durationMs,
          });
        }
      } else if (logger && typeof logger.debug === "function") {
        logger.debug("domain_events.dispatch.idle", {
          durationMs,
        });
      }

      return {
        skipped: false,
        published: result.published,
        failed: result.failed,
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
        metrics.observeBackgroundTask("domain_events.dispatch", {
          success: false,
          durationMs,
          errorMessage: runtimeState.lastError,
        });
      }

      if (logger && typeof logger.warn === "function") {
        logger.warn("domain_events.dispatch.failed", {
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
        .catch((dispatchError) => {
          const retryDelayMs = Math.min(
            baseIntervalMs * (2 ** Math.min(runtimeState.consecutiveFailures, 5)),
            maxBackoffMs,
          );
          if (logger && typeof logger.warn === "function") {
            logger.warn("domain_events.dispatch.failed", {
              consecutiveFailures: runtimeState.consecutiveFailures,
              nextRetryInMs: retryDelayMs,
              error: dispatchError,
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
  createDomainEventDispatchJob,
};
