import type { ReportCacheGetOrSetResult, ReportCacheLike } from "../types/cache.js";
import type { ReportCacheEvent } from "../types/observability.js";
import type { LoggerLike, MetricsLike } from "../types/runtime.js";

const DEFAULT_TTL_MS = 15000;

interface CacheBackend {
  get: (key: string) => Promise<{ hit: boolean; value?: unknown }>;
  set: (key: string, value: unknown, ttlMs: number) => Promise<void>;
  invalidatePrefix: (prefix: string) => Promise<void>;
  clear: () => Promise<void>;
  close: () => Promise<void>;
}

function parseBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "undefined" || value === null) {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(normalized);
}

function parsePositiveInteger(value: unknown, fallback: number, min = 1): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min) {
    return fallback;
  }
  return parsed;
}

function normalizeStrategy(value: unknown): "memory" | "redis" {
  return String(value || "").trim().toLowerCase() === "redis" ? "redis" : "memory";
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    const recordValue = value as Record<string, unknown>;
    for (const key of Object.keys(recordValue).sort()) {
      output[key] = canonicalize(recordValue[key]);
    }
    return output;
  }

  return value;
}

function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(canonicalize(value));
  } catch (_error) {
    return String(value);
  }
}

function cloneCachedValue<T>(value: T): T {
  try {
    if (typeof globalThis.structuredClone === "function") {
      return globalThis.structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value)) as T;
  } catch (_error) {
    return value;
  }
}

function createMemoryBackend(now: () => number): CacheBackend {
  const entries: Map<string, { value: unknown; expiresAtMs: number }> = new Map();

  return {
    async get(key) {
      const entry = entries.get(key);
      if (!entry) {
        return { hit: false };
      }
      if (entry.expiresAtMs <= now()) {
        entries.delete(key);
        return { hit: false };
      }
      return {
        hit: true,
        value: cloneCachedValue(entry.value),
      };
    },
    async set(key, value, ttlMs) {
      entries.set(key, {
        value: cloneCachedValue(value),
        expiresAtMs: now() + ttlMs,
      });
    },
    async invalidatePrefix(prefix) {
      for (const key of entries.keys()) {
        if (key.startsWith(prefix)) {
          entries.delete(key);
        }
      }
    },
    async clear() {
      entries.clear();
    },
    async close() {
      entries.clear();
    },
  };
}

/**
 * @param {{ redisUrl: string, logger?: LoggerLike | null }} options
 * @returns {Promise<CacheBackend | null>}
 */
async function tryCreateRedisBackend(
  { redisUrl, logger = null }: { redisUrl: string; logger?: LoggerLike | null },
): Promise<CacheBackend | null> {
  if (!redisUrl) {
    return null;
  }

  let redisModule: { createClient?: (options: Record<string, unknown>) => any } | null = null;
  try {
    const dynamicRequire = /** @type {(moduleName: string) => any} */ (eval("require"));
    redisModule = dynamicRequire("redis");
  } catch (_error) {
    if (logger && typeof logger.warn === "function") {
      logger.warn("cache.redis.module_unavailable", {
        message: "redis package not installed; falling back to memory cache",
      });
    }
    return null;
  }

  if (!redisModule || typeof redisModule.createClient !== "function") {
    return null;
  }

  const client = redisModule.createClient({
    url: redisUrl,
    socket: {
      connectTimeout: 500,
    },
  });

  if (typeof client.on === "function") {
    client.on("error", (error: unknown) => {
      if (logger && typeof logger.warn === "function") {
        logger.warn("cache.redis.runtime_error", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }

  try {
    await client.connect();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (logger && typeof logger.warn === "function") {
      logger.warn("cache.redis.connection_failed", {
        error: errorMessage,
      });
    }
    try {
      await client.quit();
    } catch (_quitError) {
      // Ignore close errors from failed initialization.
    }
    return null;
  }

  const trackedKeys: Set<string> = new Set();

  return {
    async get(key) {
      const raw = await client.get(key);
      if (raw === null || typeof raw === "undefined") {
        return { hit: false };
      }
      try {
        return {
          hit: true,
          value: JSON.parse(raw),
        };
      } catch (_error) {
        await client.del(key);
        trackedKeys.delete(key);
        return { hit: false };
      }
    },
    async set(key, value, ttlMs) {
      trackedKeys.add(key);
      await client.set(key, JSON.stringify(value), { PX: ttlMs });
    },
    async invalidatePrefix(prefix) {
      // First: invalidate any in-memory tracked keys (fast path)
      for (const key of trackedKeys) {
        if (!key.startsWith(prefix)) continue;
        await client.del(key);
        trackedKeys.delete(key);
      }
      // Second: use SCAN to find keys in Redis that may have been written
      // before this process started (e.g. by a previous server instance).
      // Without this, invalidation is a no-op after a process restart.
      try {
        let cursor = 0;
        do {
          const result = await client.scan(cursor, { MATCH: `${prefix}*`, COUNT: 200 });
          cursor = result.cursor;
          for (const key of result.keys) {
            await client.del(key);
            trackedKeys.delete(key);
          }
        } while (cursor !== 0);
      } catch (_scanError) {
        // SCAN not supported on all Redis-compatible backends; safe to swallow.
      }
    },
    async clear() {
      // Tracked keys in memory
      for (const key of [...trackedKeys]) {
        await client.del(key);
        trackedKeys.delete(key);
      }
      // Also SCAN for any keys from previous processes
      try {
        let cursor = 0;
        do {
          const result = await client.scan(cursor, { COUNT: 200 });
          cursor = result.cursor;
          for (const key of result.keys) {
            await client.del(key);
          }
        } while (cursor !== 0);
      } catch (_scanError) {
        // Safe to swallow — SCAN may not be available on all backends.
      }
    },
    async close() {
      trackedKeys.clear();
      await client.quit();
    },
  };
}

type CreateReportCacheServiceOptions = {
  enabled?: boolean;
  defaultTtlMs?: number;
  strategy?: "memory" | "redis" | string;
  redisUrl?: string;
  logger?: LoggerLike | null;
  metrics?: MetricsLike | null;
  now?: () => number;
};

function createReportCacheService(options: CreateReportCacheServiceOptions = {}): ReportCacheLike {
  const {
    enabled = false,
    defaultTtlMs = DEFAULT_TTL_MS,
    strategy = "memory",
    redisUrl = "",
    logger = null,
    metrics = null,
    now = () => Date.now(),
  } = options;

  const cacheEnabled = Boolean(enabled);
  const configuredStrategy = normalizeStrategy(strategy);
  const normalizedDefaultTtlMs = parsePositiveInteger(defaultTtlMs, DEFAULT_TTL_MS, 100);
  const normalizedRedisUrl = String(redisUrl || "").trim();

  let activeStrategy: "memory" | "redis" = "memory";
  let backendPromise: Promise<CacheBackend> | null = null;

  function observeCacheMetric(event: ReportCacheEvent): void {
    if (!metrics || typeof metrics.observeReportCache !== "function") {
      return;
    }
    metrics.observeReportCache({ event });
  }

  async function getBackend(): Promise<CacheBackend> {
    if (backendPromise) {
      return backendPromise;
    }

    backendPromise = (async () => {
      if (configuredStrategy === "redis") {
        const redisBackend = await tryCreateRedisBackend({
          redisUrl: normalizedRedisUrl,
          logger,
        });
        if (redisBackend) {
          activeStrategy = "redis";
          if (logger && typeof logger.info === "function") {
            logger.info("cache.redis.enabled", {
              strategy: "redis",
            });
          }
          return redisBackend;
        }
      }

      activeStrategy = "memory";
      return createMemoryBackend(now);
    })();

    return backendPromise;
  }

  function buildKey(namespace: string, payload: unknown = null): string {
    const normalizedNamespace = String(namespace || "").trim();
    if (!normalizedNamespace) {
      throw new TypeError("Cache key namespace is required.");
    }
    return `${normalizedNamespace}:${stableStringify(payload)}`;
  }

  async function getOrSet<T = unknown>(options: {
    key: string;
    ttlMs?: number;
    compute: () => Promise<T> | T;
  }): Promise<ReportCacheGetOrSetResult<T>> {
    if (!options || typeof options.compute !== "function") {
      throw new TypeError("getOrSet requires a compute function.");
    }

    const key = String(options.key || "").trim();
    if (!key) {
      throw new TypeError("getOrSet requires a non-empty key.");
    }

    if (!cacheEnabled) {
      observeCacheMetric("getOrSet");
      observeCacheMetric("bypass");
      return {
        key,
        cacheHit: false,
        value: await options.compute(),
      };
    }

    observeCacheMetric("getOrSet");
    try {
      const backend = await getBackend();
      const cached = await backend.get(key);
      if (cached.hit) {
        observeCacheMetric("hit");
        return {
          key,
          cacheHit: true,
          value: cached.value as T,
        };
      }

      observeCacheMetric("miss");
      const value = await options.compute();
      const ttlMs = parsePositiveInteger(options.ttlMs, normalizedDefaultTtlMs, 100);
      await backend.set(key, value, ttlMs);
      observeCacheMetric("write");

      return {
        key,
        cacheHit: false,
        value,
      };
    } catch (error) {
      observeCacheMetric("error");
      throw error;
    }
  }

  async function invalidatePrefix(prefix: string): Promise<void> {
    if (!cacheEnabled) {
      return;
    }
    try {
      const backend = await getBackend();
      await backend.invalidatePrefix(String(prefix || ""));
      observeCacheMetric("invalidation");
    } catch (error) {
      observeCacheMetric("error");
      throw error;
    }
  }

  async function clear() {
    if (!cacheEnabled) {
      return;
    }
    try {
      const backend = await getBackend();
      await backend.clear();
      observeCacheMetric("clear");
    } catch (error) {
      observeCacheMetric("error");
      throw error;
    }
  }

  async function close() {
    if (!backendPromise) {
      return;
    }
    const backend = await backendPromise;
    await backend.close();
  }

  return {
    get enabled() {
      return cacheEnabled;
    },
    get configuredStrategy() {
      return configuredStrategy;
    },
    get activeStrategy() {
      return activeStrategy;
    },
    get defaultTtlMs() {
      return normalizedDefaultTtlMs;
    },
    buildKey,
    getOrSet,
    invalidatePrefix,
    clear,
    close,
  };
}

export {
  createReportCacheService,
  parseBoolean,
  parsePositiveInteger,
};
