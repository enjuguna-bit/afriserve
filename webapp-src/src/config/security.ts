import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { requestContext } from "../middleware/requestContext.js";
import { parseBooleanEnv } from "../utils/env.js";
import { resolveRepoRoot } from "../utils/projectPaths.js";
import { createDistributedRateLimiter } from "../services/rateLimitRedis.js";
import type {
  CorsOriginCallbackLike,
  ExpressLikeApp,
  NextFunctionLike,
  RequestLike,
  ResponseLike,
  SecurityMiddlewareOptions,
} from "../types/runtime.js";

function buildCorsOptions() {
  const nodeEnv = String(process.env.NODE_ENV || "").trim().toLowerCase();
  const isProduction = nodeEnv === "production";
  const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:4000,http://127.0.0.1:4000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    /**
     * @param {string | undefined} origin
     * @param {CorsOriginCallbackLike} callback
     */
    origin(origin: string | undefined, callback: CorsOriginCallbackLike) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      if (!isProduction) {
        let parsedOrigin: URL | null = null;
        try {
          parsedOrigin = new URL(origin);
        } catch (_error) {
          parsedOrigin = null;
        }

        if (parsedOrigin && ["localhost", "127.0.0.1"].includes(parsedOrigin.hostname)) {
          callback(null, true);
          return;
        }
      }

      callback(new Error("CORS origin is not allowed"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Content-Disposition", "Content-Type"],
  };
}

function shouldEnableTrustProxy() {
  const nodeEnv = String(process.env.NODE_ENV || "").trim().toLowerCase();
  if (nodeEnv === "production") {
    return true;
  }

  return parseBooleanEnv(process.env.TRUST_PROXY, false);
}

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = resolveRepoRoot(currentDir);
const staticAppDirCandidates = [
  path.join(repoRoot, "dist", "frontend-next"),
  path.join(repoRoot, "frontend-next", "dist"),
  path.join(repoRoot, "public"),
  path.join(repoRoot, "dist", "public"),
];

function resolveStaticAppDir(): string {
  return staticAppDirCandidates.find((candidate) => existsSync(candidate)) || staticAppDirCandidates[0];
}

function resolveStaticAppIndexPath(): string | null {
  const indexPath = path.join(resolveStaticAppDir(), "index.html");
  return existsSync(indexPath) ? indexPath : null;
}

function createAuthLimiter() {
  return createDistributedRateLimiter({
    keyPrefix: "auth-limiter",
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many authentication requests. Please try again later." },
  });
}

function createGeneralApiLimiter() {
  const nodeEnv = String(process.env.NODE_ENV || "").trim().toLowerCase();
  const disableGeneralRateLimit = parseBooleanEnv(process.env.DISABLE_GENERAL_RATE_LIMIT, false);

  if (disableGeneralRateLimit || nodeEnv !== "production") {
    return (_req: RequestLike, _res: ResponseLike, next: NextFunctionLike) => {
      next();
    };
  }

  return createDistributedRateLimiter({
    keyPrefix: "general-api-limiter",
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many API requests. Please try again shortly." },
  });
}

function buildImageSourceList(): string[] {
  const candidates = [
    process.env.UPLOAD_PUBLIC_BASE_URL,
    process.env.UPLOAD_S3_PUBLIC_BASE_URL,
  ];

  const origins = candidates
    .map((value) => {
      const trimmed = String(value || "").trim();
      if (!trimmed) {
        return null;
      }

      try {
        return new URL(trimmed).origin;
      } catch (_error) {
        return null;
      }
    })
    .filter((value): value is string => Boolean(value));

  return [...new Set(["'self'", "data:", ...origins])];
}

function sanitizeForLogs(value: unknown): unknown {
  const redactKeys = new Set([
    "password",
    "currentpassword",
    "newpassword",
    "token",
    "authorization",
    "passwordhash",
    "resettoken",
  ]);

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeForLogs(entry));
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
      if (redactKeys.has(String(key || "").toLowerCase())) {
        output[key] = "[REDACTED]";
      } else {
        output[key] = sanitizeForLogs(entry);
      }
    });
    return output;
  }

  return value;
}

function toPreviewString(value: unknown, maxLength: number): string | null {
  if (typeof value === "undefined") {
    return null;
  }

  try {
    const serialized = JSON.stringify(sanitizeForLogs(value));
    if (serialized.length <= maxLength) {
      return serialized;
    }
    return `${serialized.slice(0, maxLength)}…`;
  } catch (_error) {
    return null;
  }
}

/**
 * @param {ExpressLikeApp} app
 * @param {SecurityMiddlewareOptions} [options]
 */
function applySecurityMiddleware(
  app: ExpressLikeApp,
  { logger = null, metrics = null }: SecurityMiddlewareOptions = {},
) {
  const payloadLoggingEnabled = parseBooleanEnv(process.env.LOG_HTTP_BODIES, false);
  const configuredPayloadLogLimit = Number(process.env.LOG_HTTP_PAYLOAD_MAX_BYTES);
  const payloadLogMaxBytes = Number.isFinite(configuredPayloadLogLimit) && configuredPayloadLogLimit > 0
    ? Math.floor(configuredPayloadLogLimit)
    : 2048;

  app.disable("x-powered-by");
  if (shouldEnableTrustProxy()) {
    app.set("trust proxy", 1);
  }
  app.use(requestContext);
  /** @type {(req: RequestLike, res: ResponseLike, next: NextFunctionLike) => void} */
  const observeRequestMiddleware = (req: RequestLike, res: ResponseLike, next: NextFunctionLike) => {
    const startedAtMs = Date.now();

    res.on("finish", () => {
      const durationMs = Date.now() - startedAtMs;
      const routePath = req.route?.path || req.path || req.originalUrl || "unknown";
      if (metrics && typeof metrics.observeHttpRequest === "function") {
        metrics.observeHttpRequest({
          method: req.method,
          route: routePath,
          statusCode: res.statusCode,
          durationMs,
        });
      }

      if (logger && typeof logger.info === "function") {
        const requestBodyPreview = payloadLoggingEnabled
          ? toPreviewString((req as Record<string, unknown>).body, payloadLogMaxBytes)
          : null;
        const responseBodyPreview = payloadLoggingEnabled
          ? toPreviewString((req as Record<string, unknown>).responseBodyPreview, payloadLogMaxBytes)
          : null;

        logger.info("http.request.completed", {
          requestId: req.requestId || null,
          method: req.method,
          route: routePath,
          statusCode: res.statusCode,
          durationMs,
          ipAddress: req.ip,
          requestBodyPreview,
          responseBodyPreview,
        });
      }
    });

    next();
  };

  app.use(observeRequestMiddleware);
  app.use(cors(buildCorsOptions()));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
          imgSrc: buildImageSourceList(),
          connectSrc: ["'self'"],
        },
      },
      crossOriginResourcePolicy: { policy: "same-origin" },
    }),
  );
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));
  app.use(express.static(resolveStaticAppDir()));
}

export {
  applySecurityMiddleware,
  createAuthLimiter,
  createGeneralApiLimiter,
  resolveStaticAppDir,
  resolveStaticAppIndexPath,
};
