import { Redis } from "ioredis";
import type { AuthUserRow } from "../types/auth.js";

type CacheStrategy = "redis" | "memory";

type MemoryValue = {
  value: AuthUserRow;
  expiresAt: number;
};

const configuredRedisUrl = String(
  process.env.AUTH_SESSION_CACHE_REDIS_URL
  || process.env.AUTH_TOKEN_STORE_REDIS_URL
  || process.env.REDIS_URL
  || "",
).trim();

const configuredTtlSeconds = Number(process.env.AUTH_SESSION_CACHE_TTL_SECONDS);
const cacheTtlSeconds = Number.isFinite(configuredTtlSeconds) && configuredTtlSeconds > 0
  ? Math.floor(configuredTtlSeconds)
  : 60;

const memoryStore = new Map<string, MemoryValue>();
let redisClientPromise: Promise<Redis | null> | null = null;
let redisWarningLogged = false;

function buildCacheKey(userId: number): string {
  return `auth:session:user:${userId}`;
}

function toCachePayload(user: Record<string, any>): AuthUserRow {
  const normalizedRoles = Array.isArray(user.roles)
    ? user.roles.map((role: unknown) => String(role || "").trim().toLowerCase()).filter(Boolean)
    : [];
  const normalizedPermissions = Array.isArray(user.permissions)
    ? user.permissions.map((permission: unknown) => String(permission || "").trim()).filter(Boolean)
    : [];
  return {
    id: Number(user.id || 0),
    full_name: String(user.full_name || ""),
    email: String(user.email || ""),
    role: String(user.role || ""),
    roles: [...new Set(normalizedRoles)],
    permissions: [...new Set(normalizedPermissions)].sort((left, right) => left.localeCompare(right)),
    is_active: Number(user.is_active || 0),
    token_version: user.token_version == null ? null : Number(user.token_version),
    branch_id: user.branch_id == null ? null : Number(user.branch_id),
    primary_region_id: user.primary_region_id == null ? null : Number(user.primary_region_id),
  };
}

function shouldUseRedis(): boolean {
  return Boolean(configuredRedisUrl);
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
          console.warn("auth.session_cache.redis_unavailable", error);
        }
        return null;
      }
    })();
  }

  return redisClientPromise;
}

async function getCachedAuthSessionUser(userId: number): Promise<AuthUserRow | null> {
  const normalizedUserId = Number(userId || 0);
  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
    return null;
  }

  const key = buildCacheKey(normalizedUserId);
  const redisClient = await resolveRedisClient();
  if (redisClient) {
    try {
      const value = await redisClient.get(key);
      if (!value) {
        return null;
      }
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== "object") {
        await redisClient.del(key);
        return null;
      }
      return toCachePayload(parsed as Record<string, any>);
    } catch (_error) {
      return null;
    }
  }

  const memoryValue = memoryStore.get(key);
  if (!memoryValue) {
    return null;
  }
  if (Date.now() >= memoryValue.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  return memoryValue.value;
}

async function cacheAuthSessionUser(user: Record<string, any> | null | undefined): Promise<void> {
  if (!user || typeof user !== "object") {
    return;
  }

  const payload = toCachePayload(user);
  if (!Number.isInteger(payload.id) || payload.id <= 0) {
    return;
  }

  const key = buildCacheKey(payload.id);
  const serialized = JSON.stringify(payload);
  const redisClient = await resolveRedisClient();
  if (redisClient) {
    try {
      await redisClient.setex(key, Math.max(1, cacheTtlSeconds), serialized);
      return;
    } catch (_error) {
      return;
    }
  }

  memoryStore.set(key, {
    value: payload,
    expiresAt: Date.now() + (Math.max(1, cacheTtlSeconds) * 1000),
  });
}

async function invalidateCachedAuthSessionUser(userId: number): Promise<void> {
  const normalizedUserId = Number(userId || 0);
  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
    return;
  }

  const key = buildCacheKey(normalizedUserId);
  memoryStore.delete(key);

  const redisClient = await resolveRedisClient();
  if (!redisClient) {
    return;
  }

  try {
    await redisClient.del(key);
  } catch (_error) {
  }
}

function getAuthSessionCacheStatus(): { strategy: CacheStrategy; redisUrlConfigured: boolean; ttlSeconds: number } {
  return {
    strategy: shouldUseRedis() ? "redis" : "memory",
    redisUrlConfigured: shouldUseRedis(),
    ttlSeconds: cacheTtlSeconds,
  };
}

export {
  getCachedAuthSessionUser,
  cacheAuthSessionUser,
  invalidateCachedAuthSessionUser,
  getAuthSessionCacheStatus,
};
