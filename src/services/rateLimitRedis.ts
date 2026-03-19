import { rateLimit } from "express-rate-limit";
import type { Store } from "express-rate-limit";
import { Redis } from "ioredis";

type CounterWindowResult = {
  count: number;
  resetAt: number;
};

type MemoryCounterEntry = {
  count: number;
  resetAt: number;
};

const configuredRedisUrl = String(process.env.RATE_LIMIT_REDIS_URL || process.env.REDIS_URL || "").trim();
const redisWindowScript = `
local current = redis.call("INCR", KEYS[1])
if tonumber(current) == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
return { current, ttl }
`;

const sharedMemoryCounters = new Map<string, MemoryCounterEntry>();
let redisClientPromise: Promise<Redis | null> | null = null;
let redisWarningLogged = false;

function shouldUseRedis(): boolean {
  return Boolean(configuredRedisUrl);
}

function toPositiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function normalizeWindowMs(windowMs: unknown): number {
  return Math.max(1, Math.floor(toPositiveNumber(windowMs, 60000)));
}

async function resolveRedisClient(): Promise<Redis | null> {
  if (!shouldUseRedis()) {
    return null;
  }

  if (!redisClientPromise) {
    redisClientPromise = (async () => {
      try {
        const client = new Redis(configuredRedisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
        });
        await client.connect();
        return client;
      } catch (error) {
        if (!redisWarningLogged) {
          redisWarningLogged = true;
          console.warn("rate_limit.redis_unavailable", error);
        }
        return null;
      }
    })();
  }

  return redisClientPromise;
}

function clearExpiredMemoryCounters(store: Map<string, MemoryCounterEntry>, now: number) {
  if (store.size <= 10_000) {
    return;
  }

  for (const [key, value] of store.entries()) {
    if (value.resetAt <= now) {
      store.delete(key);
    }
  }
}

function incrementMemoryCounter(
  store: Map<string, MemoryCounterEntry>,
  key: string,
  windowMs: number,
): CounterWindowResult {
  const now = Date.now();
  clearExpiredMemoryCounters(store, now);

  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    const nextValue = {
      count: 1,
      resetAt: now + windowMs,
    };
    store.set(key, nextValue);
    return nextValue;
  }

  current.count += 1;
  store.set(key, current);
  return current;
}

async function incrementRedisCounter(
  redisClient: Redis,
  key: string,
  windowMs: number,
): Promise<CounterWindowResult | null> {
  try {
    const response = await redisClient.eval(redisWindowScript, 1, key, String(windowMs));
    if (!Array.isArray(response) || response.length < 2) {
      return null;
    }

    const rawCount = Number(response[0]);
    const rawTtl = Number(response[1]);
    const ttlMs = Number.isFinite(rawTtl) && rawTtl > 0 ? rawTtl : windowMs;
    return {
      count: Number.isFinite(rawCount) && rawCount > 0 ? rawCount : 1,
      resetAt: Date.now() + ttlMs,
    };
  } catch (_error) {
    return null;
  }
}

class RedisAwareRateLimitStore implements Store {
  public localKeys = false;
  private windowMs = 60000;
  private readonly memoryStore = new Map<string, MemoryCounterEntry>();
  private readonly keyPrefix: string;

  constructor(prefix: string) {
    this.keyPrefix = String(prefix || "rate-limit").trim();
  }

  private toStoreKey(key: string): string {
    return `${this.keyPrefix}:${key}`;
  }

  init(options: { windowMs?: number }) {
    this.windowMs = normalizeWindowMs(options?.windowMs);
  }

  async get(key: string) {
    const storeKey = this.toStoreKey(key);
    const windowMs = this.windowMs;
    const redisClient = await resolveRedisClient();
    if (redisClient) {
      try {
        const [value, ttlRaw] = await Promise.all([
          redisClient.get(storeKey),
          redisClient.pttl(storeKey),
        ]);

        if (!value) {
          return undefined;
        }

        const totalHits = Number(value);
        const ttlMs = Number(ttlRaw);
        return {
          totalHits: Number.isFinite(totalHits) && totalHits > 0 ? totalHits : 0,
          resetTime: new Date(Date.now() + (Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : windowMs)),
        };
      } catch (_error) {
        return undefined;
      }
    }

    const memoryValue = this.memoryStore.get(storeKey);
    if (!memoryValue || memoryValue.resetAt <= Date.now()) {
      this.memoryStore.delete(storeKey);
      return undefined;
    }
    return {
      totalHits: memoryValue.count,
      resetTime: new Date(memoryValue.resetAt),
    };
  }

  async increment(key: string) {
    const storeKey = this.toStoreKey(key);
    const windowMs = this.windowMs;
    const redisClient = await resolveRedisClient();
    if (redisClient) {
      const redisResult = await incrementRedisCounter(redisClient, storeKey, windowMs);
      if (redisResult) {
        return {
          totalHits: redisResult.count,
          resetTime: new Date(redisResult.resetAt),
        };
      }
    }

    const fallback = incrementMemoryCounter(this.memoryStore, storeKey, windowMs);
    return {
      totalHits: fallback.count,
      resetTime: new Date(fallback.resetAt),
    };
  }

  async decrement(key: string) {
    const storeKey = this.toStoreKey(key);
    const redisClient = await resolveRedisClient();
    if (redisClient) {
      try {
        const remaining = await redisClient.decr(storeKey);
        if (remaining <= 0) {
          await redisClient.del(storeKey);
        }
        return;
      } catch (_error) {
      }
    }

    const current = this.memoryStore.get(storeKey);
    if (!current) {
      return;
    }
    current.count = Math.max(0, current.count - 1);
    if (current.count <= 0 || current.resetAt <= Date.now()) {
      this.memoryStore.delete(storeKey);
      return;
    }
    this.memoryStore.set(storeKey, current);
  }

  async resetKey(key: string) {
    const storeKey = this.toStoreKey(key);
    this.memoryStore.delete(storeKey);

    const redisClient = await resolveRedisClient();
    if (!redisClient) {
      return;
    }
    try {
      await redisClient.del(storeKey);
    } catch (_error) {
    }
  }
}

function createDistributedRateLimiter(options: Record<string, any>) {
  const {
    keyPrefix = "rate-limit",
    validate,
    ...limiterOptions
  } = options || {};

  const resolvedValidate = validate === false
    ? false
    : {
      default: true,
      singleCount: false,
      ...(validate && typeof validate === "object" ? validate : {}),
    };

  return rateLimit({
    ...limiterOptions,
    validate: resolvedValidate,
    store: new RedisAwareRateLimitStore(String(keyPrefix || "rate-limit")),
  });
}

async function incrementDistributedRateLimitCounter({
  key,
  windowMs,
  keyPrefix = "user-limit",
}: {
  key: string;
  windowMs: number;
  keyPrefix?: string;
}): Promise<CounterWindowResult> {
  const normalizedWindowMs = normalizeWindowMs(windowMs);
  const normalizedKey = `${String(keyPrefix || "user-limit")}:${String(key || "")}`;
  const redisClient = await resolveRedisClient();
  if (redisClient) {
    const redisResult = await incrementRedisCounter(redisClient, normalizedKey, normalizedWindowMs);
    if (redisResult) {
      return redisResult;
    }
  }

  return incrementMemoryCounter(sharedMemoryCounters, normalizedKey, normalizedWindowMs);
}

function getRateLimitBackendStatus(): { strategy: "redis" | "memory"; redisUrlConfigured: boolean } {
  return {
    strategy: shouldUseRedis() ? "redis" : "memory",
    redisUrlConfigured: shouldUseRedis(),
  };
}

export {
  createDistributedRateLimiter,
  incrementDistributedRateLimitCounter,
  getRateLimitBackendStatus,
};
