import type { LoggerLike, MetricsLike } from "../types/runtime.js";

class CircuitBreakerOpenError extends Error {
  readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = "CircuitBreakerOpenError";
    this.retryAfterMs = retryAfterMs;
  }
}

class CircuitBreakerTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number) {
    super(message);
    this.name = "CircuitBreakerTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

interface CircuitBreakerOptions {
  name: string;
  failureThreshold?: number;
  resetTimeoutMs?: number;
  timeoutMs?: number;
  logger?: LoggerLike | null;
  metrics?: MetricsLike | null;
}

function createCircuitBreaker(options: CircuitBreakerOptions) {
  const {
    name,
    failureThreshold = 3,
    resetTimeoutMs = 30000,
    timeoutMs = 15000,
    logger = null,
    metrics = null,
  } = options;

  let state: "closed" | "open" | "half_open" = "closed";
  let consecutiveFailures = 0;
  let openUntil = 0;
  let halfOpenInFlight = false;

  function observe(event: string, payload: Record<string, unknown> = {}) {
    if (metrics && typeof metrics.observeBackgroundTask === "function") {
      metrics.observeBackgroundTask(`circuit_breaker.${name}.${event}`, payload);
    }
  }

  function transitionToOpen(error: unknown): void {
    state = "open";
    openUntil = Date.now() + Math.max(1, Math.floor(resetTimeoutMs));
    halfOpenInFlight = false;
    observe("opened", {
      consecutiveFailures,
      resetTimeoutMs,
      errorMessage: error instanceof Error ? error.message : String(error || "unknown_error"),
    });
    if (logger && typeof logger.warn === "function") {
      logger.warn("circuit_breaker.opened", {
        name,
        consecutiveFailures,
        resetTimeoutMs,
        error,
      });
    }
  }

  function transitionToClosed(): void {
    const wasNotClosed = state !== "closed" || consecutiveFailures !== 0;
    state = "closed";
    consecutiveFailures = 0;
    openUntil = 0;
    halfOpenInFlight = false;
    if (wasNotClosed) {
      observe("closed");
      if (logger && typeof logger.info === "function") {
        logger.info("circuit_breaker.closed", {
          name,
        });
      }
    }
  }

  async function execute<T>(work: () => Promise<T>): Promise<T> {
    const now = Date.now();
    if (state === "open") {
      if (now < openUntil) {
        const retryAfterMs = Math.max(0, openUntil - now);
        observe("rejected", { retryAfterMs });
        throw new CircuitBreakerOpenError(`${name} circuit is open`, retryAfterMs);
      }
      state = "half_open";
      halfOpenInFlight = false;
    }

    if (state === "half_open" && halfOpenInFlight) {
      const retryAfterMs = Math.max(0, openUntil - now);
      observe("rejected_half_open", { retryAfterMs });
      throw new CircuitBreakerOpenError(`${name} circuit is probing recovery`, retryAfterMs);
    }

    if (state === "half_open") {
      halfOpenInFlight = true;
    }

    let timeoutHandle: NodeJS.Timeout | null = null;

    try {
      const result = await Promise.race([
        work(),
        new Promise<T>((_resolve, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(new CircuitBreakerTimeoutError(`${name} timed out after ${timeoutMs}ms`, timeoutMs));
          }, Math.max(1, Math.floor(timeoutMs)));
          timeoutHandle.unref?.();
        }),
      ]);

      transitionToClosed();
      observe("success");
      return result;
    } catch (error) {
      consecutiveFailures += 1;

      if (state === "half_open" || consecutiveFailures >= Math.max(1, Math.floor(failureThreshold))) {
        transitionToOpen(error);
      } else {
        observe("failure", {
          consecutiveFailures,
          failureThreshold,
          errorMessage: error instanceof Error ? error.message : String(error || "unknown_error"),
        });
      }

      throw error;
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      if (state !== "half_open") {
        halfOpenInFlight = false;
      }
    }
  }

  function getState() {
    return {
      state,
      consecutiveFailures,
      openUntil,
    };
  }

  return {
    execute,
    getState,
  };
}

export {
  CircuitBreakerOpenError,
  CircuitBreakerTimeoutError,
  createCircuitBreaker,
};
