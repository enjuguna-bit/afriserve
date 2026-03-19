import { Redis } from "ioredis";
import type { LoggerLike } from "../types/runtime.js";

type StorageAdapter = {
  get: (key: string) => Promise<string | null>;
  setex: (key: string, ttlSeconds: number, value: string) => Promise<void>;
};

class MemoryStorageAdapter implements StorageAdapter {
  private readonly store = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | null> {
    const value = this.store.get(key);
    if (!value) {
      return null;
    }

    if (Date.now() >= value.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return value.value;
  }

  async setex(key: string, ttlSeconds: number, value: string): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (Math.max(1, ttlSeconds) * 1000),
    });
  }
}

async function createStorageAdapter(
  redisUrl: string,
  logger: LoggerLike | null,
): Promise<{ adapter: StorageAdapter; strategy: "redis" | "memory" }> {
  if (!redisUrl) {
    return { adapter: new MemoryStorageAdapter(), strategy: "memory" };
  }

  try {
    const client = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    await client.connect();

    const adapter: StorageAdapter = {
      get: async (key) => client.get(key),
      setex: async (key, ttlSeconds, value) => {
        await client.setex(key, Math.max(1, ttlSeconds), value);
      },
    };
    return { adapter, strategy: "redis" };
  } catch (error) {
    if (logger && typeof logger.warn === "function") {
      logger.warn("auth.token_blacklist.redis_unavailable", {
        message: "Redis unavailable; falling back to in-memory token blacklist",
        error,
      });
    }
    return { adapter: new MemoryStorageAdapter(), strategy: "memory" };
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const segments = token.split(".");
  if (segments.length < 2) {
    return null;
  }

  try {
    const payloadJson = Buffer.from(segments[1], "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson);
    if (!payload || typeof payload !== "object") {
      return null;
    }
    return payload;
  } catch (_error) {
    return null;
  }
}

function getTokenId(payload: Record<string, unknown>): string {
  const jti = payload.jti;
  if (typeof jti === "string" && jti.trim()) {
    return jti;
  }

  const sub = payload.sub;
  const iat = payload.iat;
  return `${String(sub || "unknown")}:${String(iat || Date.now())}`;
}

function getExpirySeconds(payload: Record<string, unknown>): number {
  const exp = Number(payload.exp || 0);
  if (Number.isFinite(exp) && exp > 0) {
    const ttl = Math.floor(exp - Date.now() / 1000);
    return Math.max(1, ttl);
  }

  return 24 * 60 * 60;
}

async function createTokenBlacklistService({
  redisUrl = "",
  logger = null,
}: {
  redisUrl?: string;
  logger?: LoggerLike | null;
}) {
  const { adapter, strategy } = await createStorageAdapter(String(redisUrl || "").trim(), logger);

  async function blacklistToken(token: string): Promise<void> {
    const payload = decodeJwtPayload(token);
    if (!payload) {
      return;
    }

    const key = `blacklist:${getTokenId(payload)}`;
    const ttlSeconds = getExpirySeconds(payload);
    await adapter.setex(key, ttlSeconds, "1");
  }

  async function isTokenBlacklisted(token: string): Promise<boolean> {
    const payload = decodeJwtPayload(token);
    if (!payload) {
      return false;
    }

    const key = `blacklist:${getTokenId(payload)}`;
    const value = await adapter.get(key);
    return value === "1";
  }

  return {
    strategy,
    blacklistToken,
    isTokenBlacklisted,
  };
}

export {
  createTokenBlacklistService,
};
