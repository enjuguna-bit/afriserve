import type { NextFunction, Request, Response } from "express";
import { RATE_LIMITS, resolveRateLimitBucket } from "../config/rateLimit.js";
import { createDistributedRateLimiter, incrementDistributedRateLimitCounter } from "../services/rateLimitRedis.js";
import { parseBooleanEnv } from "../utils/env.js";


function getRequesterKey(req: Request): string {
  return `ip:${String(req.ip || "unknown")}`;
}

function getAuthenticatedRequesterKey(req: Request): string {
  const requestUser = (req as Request & {
    user?: {
      sub?: number | string;
    };
  }).user;

  if ((typeof requestUser?.sub === "number" && Number.isFinite(requestUser.sub)) || typeof requestUser?.sub === "string") {
    return `user:${String(requestUser.sub)}`;
  }

  return getRequesterKey(req);
}

const disableUserRateLimit = parseBooleanEnv(process.env.DISABLE_USER_RATE_LIMIT, false);
const nodeEnv = String(process.env.NODE_ENV || "").trim().toLowerCase();
const isNonProduction = nodeEnv !== "production";

function isLocalRequest(req: Request): boolean {
  const ip = String(req.ip || "").trim();
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

async function userRateLimit(req: Request, res: Response, next: NextFunction) {
  if (disableUserRateLimit || (isNonProduction && isLocalRequest(req))) {
    next();
    return;
  }

  const bucket = resolveRateLimitBucket(req.path);
  const config = RATE_LIMITS[bucket];
  const requesterKey = getRequesterKey(req);
  const key = `${bucket}:${requesterKey}`;
  const now = Date.now();

  try {
    const counter = await incrementDistributedRateLimitCounter({
      key,
      windowMs: config.windowMs,
      keyPrefix: "user-rate-limit",
    });

    if (counter.count > config.maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((counter.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        message: "Rate limit exceeded. Please try again later.",
        retryAfterSeconds,
        scope: bucket,
      });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
}

const disbursementLimiter = createDistributedRateLimiter({
  keyPrefix: "loan-disbursement",
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => getAuthenticatedRequesterKey(req),
  message: { message: "Too many loan disbursement requests. Please try again later." },
});

const passwordResetLimiter = createDistributedRateLimiter({
  keyPrefix: "password-reset-request",
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many password reset requests. Please try again later." },
});

const changePasswordLimiter = createDistributedRateLimiter({
  keyPrefix: "change-password",
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => getAuthenticatedRequesterKey(req),
  message: { message: "Too many password change attempts. Please try again later." },
});

export {
  changePasswordLimiter,
  disbursementLimiter,
  passwordResetLimiter,
  userRateLimit,
};
