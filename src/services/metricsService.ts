import type {
  BackgroundTaskObservation,
  BackgroundTaskSnapshot,
  DbQueryObservation,
  DbQuerySnapshot,
  HttpRequestObservation,
  MetricsSnapshot,
  ReportCacheCounters,
  ReportCacheObservation,
} from "../types/observability.js";

function incrementCounter(map: Map<string, number>, key: string, delta = 1): void {
  map.set(key, Number(map.get(key) || 0) + delta);
}

function mapToObject<T>(map: Map<string, T>): Record<string, T> {
  const output: Record<string, T> = {} as Record<string, T>;
  map.forEach((value, key) => {
    output[key] = value;
  });
  return output;
}

function toPercent(numerator: number, denominator: number): number {
  if (!Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  return Number(((Number(numerator || 0) / denominator) * 100).toFixed(2));
}

function toRatePerMinute(total: number, elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return 0;
  }
  return Number((Number(total || 0) / (elapsedMs / 60000)).toFixed(4));
}

function toCounterRates(counters: ReportCacheCounters, elapsedMs: number): ReportCacheCounters {
  return {
    getOrSetCalls: toRatePerMinute(counters.getOrSetCalls, elapsedMs),
    hits: toRatePerMinute(counters.hits, elapsedMs),
    misses: toRatePerMinute(counters.misses, elapsedMs),
    writes: toRatePerMinute(counters.writes, elapsedMs),
    invalidations: toRatePerMinute(counters.invalidations, elapsedMs),
    clears: toRatePerMinute(counters.clears, elapsedMs),
    bypasses: toRatePerMinute(counters.bypasses, elapsedMs),
    errors: toRatePerMinute(counters.errors, elapsedMs),
  };
}

function cloneCounters(counters: ReportCacheCounters): ReportCacheCounters {
  return {
    getOrSetCalls: Number(counters.getOrSetCalls || 0),
    hits: Number(counters.hits || 0),
    misses: Number(counters.misses || 0),
    writes: Number(counters.writes || 0),
    invalidations: Number(counters.invalidations || 0),
    clears: Number(counters.clears || 0),
    bypasses: Number(counters.bypasses || 0),
    errors: Number(counters.errors || 0),
  };
}

function diffCounters(current: ReportCacheCounters, previous: ReportCacheCounters | null): ReportCacheCounters {
  if (!previous) {
    return {
      getOrSetCalls: 0,
      hits: 0,
      misses: 0,
      writes: 0,
      invalidations: 0,
      clears: 0,
      bypasses: 0,
      errors: 0,
    };
  }
  return {
    getOrSetCalls: Math.max(0, current.getOrSetCalls - previous.getOrSetCalls),
    hits: Math.max(0, current.hits - previous.hits),
    misses: Math.max(0, current.misses - previous.misses),
    writes: Math.max(0, current.writes - previous.writes),
    invalidations: Math.max(0, current.invalidations - previous.invalidations),
    clears: Math.max(0, current.clears - previous.clears),
    bypasses: Math.max(0, current.bypasses - previous.bypasses),
    errors: Math.max(0, current.errors - previous.errors),
  };
}

function createMetricsService() {
  const CACHE_MISS_ALERT_MIN_CALLS = 20;
  const CACHE_MISS_ALERT_PERCENT = 70;
  const CACHE_ERROR_ALERT_MIN_OPERATIONS = 20;
  const CACHE_ERROR_ALERT_PERCENT = 5;
  const CACHE_LOW_EFFICIENCY_MIN_CALLS = 20;
  const CACHE_LOW_EFFICIENCY_HIT_RATE_PERCENT = 30;

  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const httpByMethod: Map<string, number> = new Map();
  const httpByStatusClass: Map<string, number> = new Map();
  const httpByRoute: Map<string, number> = new Map();
  const errorByStatus: Map<string, number> = new Map();
  const backgroundTasks: Map<string, BackgroundTaskSnapshot> = new Map();
  const dbQueryStats: Map<string, { count: number; totalMs: number; maxMs: number }> = new Map();
  const reportCache: ReportCacheCounters = {
    getOrSetCalls: 0,
    hits: 0,
    misses: 0,
    writes: 0,
    invalidations: 0,
    clears: 0,
    bypasses: 0,
    errors: 0,
  };

  let httpRequestCount = 0;
  let httpDurationTotalMs = 0;
  let errorCount = 0;
  let previousReportCacheCounters: ReportCacheCounters | null = null;
  let previousReportCacheSnapshotAtMs: number | null = null;

  function observeHttpRequest({ method, route, statusCode, durationMs }: HttpRequestObservation) {
    httpRequestCount += 1;
    httpDurationTotalMs += Number(durationMs || 0);

    incrementCounter(httpByMethod, String(method || "UNKNOWN").toUpperCase());
    const statusClass = `${Math.floor(Number(statusCode || 0) / 100)}xx`;
    incrementCounter(httpByStatusClass, statusClass);
    incrementCounter(httpByRoute, String(route || "unknown"));
  }

  function observeError(statusCode = 500) {
    errorCount += 1;
    const statusKey = String(statusCode || 500);
    incrementCounter(errorByStatus, statusKey);
  }

  function observeBackgroundTask(taskName: string, payload: BackgroundTaskObservation = {}) {
    const key = String(taskName || "").trim() || "unknown_task";
    const existing = backgroundTasks.get(key) || {
      runs: 0,
      failures: 0,
      consecutiveFailures: 0,
      lastRunAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastError: null,
      lastDurationMs: null,
      degraded: false,
    };

    existing.runs += 1;
    existing.lastRunAt = new Date().toISOString();
    existing.lastDurationMs = Number(payload.durationMs || 0);

    if (payload.success) {
      existing.lastSuccessAt = existing.lastRunAt;
      existing.consecutiveFailures = 0;
      existing.lastError = null;
      existing.degraded = false;
    } else {
      existing.failures += 1;
      existing.consecutiveFailures += 1;
      existing.lastFailureAt = existing.lastRunAt;
      existing.lastError = String(payload.errorMessage || "unknown_error");
      existing.degraded = true;
    }

    backgroundTasks.set(key, existing);
  }

  function observeReportCache(payload: ReportCacheObservation) {
    const event = String(payload?.event || "").trim();
    if (!event) {
      return;
    }

    if (event === "getOrSet") {
      reportCache.getOrSetCalls += 1;
      return;
    }
    if (event === "hit") {
      reportCache.hits += 1;
      return;
    }
    if (event === "miss") {
      reportCache.misses += 1;
      return;
    }
    if (event === "write") {
      reportCache.writes += 1;
      return;
    }
    if (event === "invalidation") {
      reportCache.invalidations += 1;
      return;
    }
    if (event === "clear") {
      reportCache.clears += 1;
      return;
    }
    if (event === "bypass") {
      reportCache.bypasses += 1;
      return;
    }
    if (event === "error") {
      reportCache.errors += 1;
    }
  }

  function observeDbQuery({ category, durationMs }: DbQueryObservation) {
    const key = String(category || "unknown").trim() || "unknown";
    const normalizedDuration = Number(durationMs || 0);
    const existing = dbQueryStats.get(key) || { count: 0, totalMs: 0, maxMs: 0 };
    existing.count += 1;
    existing.totalMs += normalizedDuration;
    if (normalizedDuration > existing.maxMs) {
      existing.maxMs = normalizedDuration;
    }
    dbQueryStats.set(key, existing);
  }

  function getSnapshot(): MetricsSnapshot {
    const snapshotAtMs = Date.now();
    const averageDurationMs = httpRequestCount > 0
      ? Number((httpDurationTotalMs / httpRequestCount).toFixed(2))
      : 0;
    const lifetimeElapsedMs = Math.max(0, snapshotAtMs - startedAtMs);
    const currentReportCacheCounters = cloneCounters(reportCache);
    const reportCacheDeltas = diffCounters(currentReportCacheCounters, previousReportCacheCounters);
    const reportCacheDeltaWindowMs = previousReportCacheSnapshotAtMs
      ? Math.max(0, snapshotAtMs - previousReportCacheSnapshotAtMs)
      : 0;

    const reportCacheRatesPerMinute = previousReportCacheSnapshotAtMs
      ? toCounterRates(reportCacheDeltas, reportCacheDeltaWindowMs)
      : toCounterRates(currentReportCacheCounters, lifetimeElapsedMs);

    const cacheLookups = currentReportCacheCounters.hits + currentReportCacheCounters.misses;
    const missCount = currentReportCacheCounters.misses;
    const cacheRelatedOps = currentReportCacheCounters.getOrSetCalls
      + currentReportCacheCounters.invalidations
      + currentReportCacheCounters.clears;
    const hitRatePercent = toPercent(currentReportCacheCounters.hits, cacheLookups);
    const missRatePercent = toPercent(currentReportCacheCounters.misses, cacheLookups);
    const writeOnMissPercent = toPercent(currentReportCacheCounters.writes, missCount);
    const bypassRatePercent = toPercent(currentReportCacheCounters.bypasses, currentReportCacheCounters.getOrSetCalls);
    const errorRatePercent = toPercent(currentReportCacheCounters.errors, cacheRelatedOps);

    const snapshot = {
      startedAt,
      http: {
        requestsTotal: httpRequestCount,
        avgDurationMs: averageDurationMs,
        byMethod: mapToObject(httpByMethod),
        byStatusClass: mapToObject(httpByStatusClass),
        byRoute: mapToObject(httpByRoute),
      },
      errors: {
        total: errorCount,
        byStatus: mapToObject(errorByStatus),
      },
      backgroundTasks: mapToObject(backgroundTasks),
      dbQueries: buildDbQuerySnapshot(),
      reportCache: {
        ...currentReportCacheCounters,
        deltas: reportCacheDeltas,
        ratesPerMinute: reportCacheRatesPerMinute,
        ratios: {
          hitRatePercent,
          missRatePercent,
          writeOnMissPercent,
          bypassRatePercent,
          errorRatePercent,
        },
        alerts: {
          highMissRate: currentReportCacheCounters.getOrSetCalls >= CACHE_MISS_ALERT_MIN_CALLS
            && missRatePercent >= CACHE_MISS_ALERT_PERCENT,
          highErrorRate: cacheRelatedOps >= CACHE_ERROR_ALERT_MIN_OPERATIONS
            && errorRatePercent >= CACHE_ERROR_ALERT_PERCENT,
          lowCacheEfficiency: currentReportCacheCounters.getOrSetCalls >= CACHE_LOW_EFFICIENCY_MIN_CALLS
            && hitRatePercent <= CACHE_LOW_EFFICIENCY_HIT_RATE_PERCENT,
        },
      },
    };

    previousReportCacheCounters = currentReportCacheCounters;
    previousReportCacheSnapshotAtMs = snapshotAtMs;

    return snapshot;
  }

  function buildDbQuerySnapshot(): Record<string, DbQuerySnapshot> {
    const output: Record<string, DbQuerySnapshot> = {};
    dbQueryStats.forEach((stats, key) => {
      output[key] = {
        count: stats.count,
        totalMs: Number(stats.totalMs.toFixed(2)),
        avgMs: stats.count > 0 ? Number((stats.totalMs / stats.count).toFixed(2)) : 0,
        maxMs: Number(stats.maxMs.toFixed(2)),
      };
    });
    return output;
  }

  return {
    observeHttpRequest,
    observeError,
    observeBackgroundTask,
    observeDbQuery,
    observeReportCache,
    getSnapshot,
  };
}

export {
  createMetricsService,
};
