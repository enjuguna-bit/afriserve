import crypto from "node:crypto";
import { getCurrentTenantId } from "../utils/tenantStore.js";
import jwt from "jsonwebtoken";
import { Redis } from "ioredis";
import type { LoggerLike } from "../types/runtime.js";
import { resolveJwtSecretConfig } from "../utils/jwtSecrets.js";

type RefreshPayload = {
  sub: number;
  tokenVersion: number;
  jti: string;
  typ: "refresh";
  tenantId: string;
};

type StorageAdapter = {
  get: (key: string) => Promise<string | null>;
  setex: (key: string, ttlSeconds: number, value: string) => Promise<void>;
  del: (key: string) => Promise<number>;
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

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
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
      del: async (key) => client.del(key),
    };

    return { adapter, strategy: "redis" };
  } catch (error) {
    if (logger && typeof logger.warn === "function") {
      logger.warn("auth.token_rotation.redis_unavailable", {
        message: "Redis unavailable; falling back to in-memory refresh token store",
        error,
      });
    }
    return { adapter: new MemoryStorageAdapter(), strategy: "memory" };
  }
}

async function createTokenRotationService({
  jwtSecret,
  jwtSecrets = [],
  redisUrl = "",
  logger = null,
}: {
  jwtSecret: string;
  jwtSecrets?: string[];
  redisUrl?: string;
  logger?: LoggerLike | null;
}) {
  const { activeSecret, validSecrets } = resolveJwtSecretConfig(jwtSecret, jwtSecrets);
  const { adapter, strategy } = await createStorageAdapter(String(redisUrl || "").trim(), logger);
  const refreshTokenExpirySeconds = 7 * 24 * 60 * 60;

  function normalizeTenantId(tenantId?: string | null): string {
    return String(tenantId || getCurrentTenantId() || "").trim() || "default";
  }

  function buildRefreshKey(userId: number, jti: string, tenantId?: string | null): string {
    return `refresh:${normalizeTenantId(tenantId)}:${userId}:${jti}`;
  }

  function verifyRefreshToken(refreshToken: string): jwt.JwtPayload {
    let lastError: unknown = null;

    for (const secret of validSecrets) {
      try {
        const decoded = jwt.verify(refreshToken, secret);
        if (decoded && typeof decoded === "object") {
          return decoded as jwt.JwtPayload;
        }
        lastError = new Error("Invalid refresh token");
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error("Invalid token secret configuration");
  }

  async function issueRefreshToken(
    userId: number,
    tokenVersion: number,
    options: { tenantId?: string | null } = {},
  ): Promise<string> {
    const jti = crypto.randomUUID();
    const tenantId = normalizeTenantId(options.tenantId);
    const payload: RefreshPayload = {
      sub: userId,
      tokenVersion,
      jti,
      typ: "refresh",
      tenantId,
    };

    const refreshToken = jwt.sign(payload, activeSecret, {
      expiresIn: refreshTokenExpirySeconds,
    });

    await adapter.setex(buildRefreshKey(userId, jti, tenantId), refreshTokenExpirySeconds, "1");
    return refreshToken;
  }

  async function rotateRefreshToken(refreshToken: string): Promise<{
    userId: number;
    tokenVersion: number;
    refreshToken: string;
    tenantId: string;
  }> {
    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded || decoded.typ !== "refresh") {
      throw new Error("Invalid refresh token");
    }

    const userId = Number(decoded.sub);
    const tokenVersion = Number(decoded.tokenVersion || 0);
    const jti = String(decoded.jti || "").trim();
    const tenantId = normalizeTenantId(
      typeof decoded.tenantId === "string" ? decoded.tenantId : undefined,
    );

    if (!Number.isInteger(userId) || userId <= 0 || !jti) {
      throw new Error("Invalid refresh token");
    }

    if (tenantId !== normalizeTenantId()) {
      throw new Error("Invalid refresh token");
    }

    const key = buildRefreshKey(userId, jti, tenantId);
    const existing = await adapter.get(key);
    if (existing !== "1") {
      if (logger && typeof logger.warn === "function") {
        logger.warn("auth.refresh_token.rotation_rejected", {
          userId,
          jti,
          reason: "expired_or_reused",
        });
      }
      throw new Error("Refresh token expired or already used");
    }

    await adapter.del(key);
    const nextRefreshToken = await issueRefreshToken(userId, tokenVersion, { tenantId });

    return {
      userId,
      tokenVersion,
      refreshToken: nextRefreshToken,
      tenantId,
    };
  }

  async function revokeRefreshToken(refreshToken: string): Promise<void> {
    try {
      const decoded = verifyRefreshToken(refreshToken);
      const userId = Number(decoded.sub);
      const jti = String(decoded.jti || "").trim();
      const tenantId = normalizeTenantId(
        typeof decoded.tenantId === "string" ? decoded.tenantId : undefined,
      );
      if (!Number.isInteger(userId) || userId <= 0 || !jti) {
        return;
      }

      await adapter.del(buildRefreshKey(userId, jti, tenantId));
    } catch (_error) {
    }
  }

  return {
    strategy,
    issueRefreshToken,
    rotateRefreshToken,
    revokeRefreshToken,
  };
}

export {
  createTokenRotationService,
};
