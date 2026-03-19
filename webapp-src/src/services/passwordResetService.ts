import crypto from "node:crypto";
import type { PrismaClientLike } from "../db/prismaClient.js";
import { parseBooleanEnv } from "../utils/env.js";
import type { LoggerLike } from "../types/runtime.js";

interface CreatePasswordResetServiceOptions {
  prisma: PrismaClientLike;
  writeAuditLog: (payload: {
    userId?: number | null;
    action: string;
    targetType?: string | null;
    targetId?: number | null;
    details?: string | null;
    ipAddress?: string | null;
  }) => Promise<void> | void;
  logger?: LoggerLike | null;
}

function createPasswordResetService({ prisma, writeAuditLog, logger = null }: CreatePasswordResetServiceOptions) {
  function getWebhookTimeoutMs() {
    const configuredTimeoutMs = Number(process.env.PASSWORD_RESET_WEBHOOK_TIMEOUT_MS);
    if (Number.isFinite(configuredTimeoutMs)) {
      const normalized = Math.floor(configuredTimeoutMs);
      if (normalized >= 500 && normalized <= 60000) {
        return normalized;
      }
    }

    return 5000;
  }

  async function deliverPasswordResetToken({
    userId,
    userEmail = null,
    rawToken,
    expiresAt,
    requestedBy,
  }: {
    userId: number;
    userEmail?: string | null;
    rawToken: string;
    expiresAt: string;
    requestedBy: string;
  }): Promise<"webhook" | "console"> {
    const webhookUrl = String(process.env.PASSWORD_RESET_WEBHOOK_URL || "").trim();
    if (webhookUrl) {
      const timeoutMs = getWebhookTimeoutMs();
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
      let response;

      try {
        response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            userEmail,
            token: rawToken,
            expiresAt,
            requestedBy,
          }),
          signal: controller.signal,
        });
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error(`Password reset webhook delivery timed out after ${timeoutMs}ms`);
        }
        throw error;
      } finally {
        clearTimeout(timeoutHandle);
      }

      if (!response.ok) {
        throw new Error(`Password reset webhook delivery failed with status ${response.status}`);
      }

      return "webhook";
    }

    const allowConsoleDelivery =
      process.env.NODE_ENV !== "production" ||
      parseBooleanEnv(process.env.ALLOW_CONSOLE_RESET_TOKENS, false);
    if (!allowConsoleDelivery) {
      throw new Error(
        "Password reset delivery is not configured. Set PASSWORD_RESET_WEBHOOK_URL or ALLOW_CONSOLE_RESET_TOKENS=true",
      );
    }

    const identifier = userEmail || `user:${userId}`;
    if (logger && typeof logger.info === "function") {
      logger.info("auth.password_reset.console_delivery", {
        target: identifier,
        token: rawToken,
        expiresAt,
        requestedBy,
      });
    }
    return "console";
  }

  async function issuePasswordResetToken({
    userId,
    userEmail = null,
    ipAddress,
    requestedByUserId = null,
    requestedBy = "self",
  }: {
    userId: number;
    userEmail?: string | null;
    ipAddress?: string | null;
    requestedByUserId?: number | null;
    requestedBy?: string;
  }): Promise<{ expiresAt: string; deliveryChannel: "webhook" | "console" }> {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString();

    const usedAt = new Date().toISOString();
    await prisma.password_resets.updateMany({
      where: {
        user_id: userId,
        used_at: null,
      },
      data: {
        used_at: usedAt,
      },
    });

    await prisma.password_resets.create({
      data: {
        user_id: userId,
        token_hash: tokenHash,
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
      },
    });

    let deliveryChannel: "webhook" | "console";
    try {
      deliveryChannel = await deliverPasswordResetToken({
        userId,
        userEmail,
        rawToken,
        expiresAt,
        requestedBy,
      });
    } catch (deliveryError: unknown) {
      await prisma.password_resets.updateMany({
        where: {
          user_id: userId,
          token_hash: tokenHash,
          used_at: null,
        },
      data: {
        used_at: usedAt,
      },
    });
      throw deliveryError;
    }

    await writeAuditLog({
      userId: requestedByUserId || userId,
      action: "auth.password.reset.requested",
      targetType: "user",
      targetId: userId,
      details: JSON.stringify({ requestedBy, deliveryChannel }),
      ipAddress,
    });

    return {
      expiresAt,
      deliveryChannel,
    };
  }

  return {
    issuePasswordResetToken,
  };
}

export {
  createPasswordResetService,
};
