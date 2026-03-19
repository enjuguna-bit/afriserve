export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LoggerOptions {
  level?: string;
  moduleLevelOverrides?: string;
}

export interface HttpRequestObservation {
  method?: string;
  route?: string;
  statusCode?: number;
  durationMs?: number;
}

export interface BackgroundTaskObservation {
  success?: boolean;
  durationMs?: number;
  errorMessage?: string;
}

export interface BackgroundTaskSnapshot {
  runs: number;
  failures: number;
  consecutiveFailures: number;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  lastDurationMs: number | null;
  degraded: boolean;
}

export type ReportCacheEvent =
  | "getOrSet"
  | "hit"
  | "miss"
  | "write"
  | "invalidation"
  | "clear"
  | "bypass"
  | "error";

export interface ReportCacheObservation {
  event: ReportCacheEvent;
}

export interface ReportCacheCounters {
  getOrSetCalls: number;
  hits: number;
  misses: number;
  writes: number;
  invalidations: number;
  clears: number;
  bypasses: number;
  errors: number;
}

export interface ReportCacheSnapshot extends ReportCacheCounters {
  deltas: ReportCacheCounters;
  ratesPerMinute: ReportCacheCounters;
  ratios: {
    hitRatePercent: number;
    missRatePercent: number;
    writeOnMissPercent: number;
    bypassRatePercent: number;
    errorRatePercent: number;
  };
  alerts: {
    highMissRate: boolean;
    highErrorRate: boolean;
    lowCacheEfficiency: boolean;
  };
}

export interface MetricsSnapshot {
  startedAt: string;
  http: {
    requestsTotal: number;
    avgDurationMs: number;
    byMethod: Record<string, number>;
    byStatusClass: Record<string, number>;
    byRoute: Record<string, number>;
  };
  errors: {
    total: number;
    byStatus: Record<string, number>;
  };
  backgroundTasks: Record<string, BackgroundTaskSnapshot>;
  reportCache: ReportCacheSnapshot;
  dbQueries: Record<string, DbQuerySnapshot>;
}

export interface DbQueryObservation {
  category: string;
  durationMs: number;
}

export interface DbQuerySnapshot {
  count: number;
  totalMs: number;
  avgMs: number;
  maxMs: number;
}
