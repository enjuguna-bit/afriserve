export interface ReportCacheGetOrSetOptions<T = unknown> {
  key: string;
  ttlMs?: number;
  compute: () => Promise<T> | T;
}

export interface ReportCacheGetOrSetResult<T = unknown> {
  value: T;
  cacheHit: boolean;
  key: string;
}

export interface ReportCacheLike {
  readonly enabled: boolean;
  readonly configuredStrategy: "memory" | "redis";
  readonly activeStrategy: "memory" | "redis";
  readonly defaultTtlMs: number;
  buildKey: (namespace: string, payload?: unknown) => string;
  getOrSet: <T = unknown>(options: ReportCacheGetOrSetOptions<T>) => Promise<ReportCacheGetOrSetResult<T>>;
  invalidatePrefix: (prefix: string) => Promise<void>;
  clear: () => Promise<void>;
  close?: () => Promise<void>;
}

