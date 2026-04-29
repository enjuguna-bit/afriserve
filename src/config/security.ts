import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { requestContext } from "../middleware/requestContext.js";
import { tenantContext } from "../middleware/tenantContext.js";
import { createHttpTracingMiddleware } from "../observability/tracing.js";
import { parseBooleanEnv } from "../utils/env.js";
import { resolveRepoRoot } from "../utils/projectPaths.js";
import { createDistributedRateLimiter } from "../services/rateLimitRedis.js";
import { getApiRateLimitRequesterKey, getAuthRateLimitRequesterKey } from "../utils/rateLimitKeys.js";
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
  const allowNoOrigin = parseBooleanEnv(process.env.CORS_ALLOW_NO_ORIGIN, !isProduction);

  return {
    /**
     * @param {string | undefined} origin
     * @param {CorsOriginCallbackLike} callback
     */
    origin(origin: string | undefined, callback: CorsOriginCallbackLike) {
      if (!origin) {
        if (allowNoOrigin) {
          callback(null, true);
          return;
        }
        callback(new Error("CORS origin is not allowed"));
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
    // X-Tenant-ID must be listed here so cross-origin preflight requests
    // from the frontend (which sends this header on every API call) are
    // accepted by the browser. Without this entry the CORS preflight rejects
    // the header and all tenant-switching functionality breaks silently.
    allowedHeaders: ["Content-Type", "Authorization", "X-Tenant-ID"],
    exposedHeaders: ["Content-Disposition", "Content-Type"],
  };
}

function shouldEnableTrustProxy() {
  // Require TRUST_PROXY=true to be set explicitly in all environments.
  // Do NOT auto-enable based on NODE_ENV=production — if the API is ever
  // directly exposed to the internet, auto-trust lets callers spoof their
  // IP via X-Forwarded-For and bypass IP-based controls (rate limit, whitelist).
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
  return staticAppDirCandidates.find((candidate) => existsSync(candidate)) || staticAppDirCandidates[0]!;
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
    keyGenerator: (req: RequestLike) => getAuthRateLimitRequesterKey(req),
    message: { message: "Too many authentication requests. Please try again later." },
  });
}

function createGeneralApiLimiter() {
  const nodeEnv = String(process.env.NODE_ENV || "").trim().toLowerCase();
  const disableGeneralRateLimit = parseBooleanEnv(process.env.DISABLE_GENERAL_RATE_LIMIT, false);
  // Allow tests to explicitly opt-in to rate limit enforcement so the
  // security-hardening test can verify 429 behaviour without needing production mode.
  const enforceInTest = parseBooleanEnv(process.env.ENFORCE_GENERAL_RATE_LIMIT, false);

  if (disableGeneralRateLimit || (nodeEnv !== "production" && !enforceInTest)) {
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
    keyGenerator: (req: RequestLike) => getApiRateLimitRequesterKey(req),
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

  // Client-side image optimization and camera capture use blob URLs briefly
  // before upload, so allow blob: images without relaxing script policy.
  return [...new Set(["'self'", "data:", "blob:", ...origins])];
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
    "nationalid",
    "national_id",
    "krapin",
    "kra_pin",
    "phone",
    "phone_number",
    "phonenumber",
    "mobile",
    "mobilephone",
    "email",
    "full_name",
    "fullname",
    "idnumber",
    "id_document_url",
    "iddocumenturl",
    "photourl",
    "photo_url",
    "payerphone",
    "accountreference",
    "nextofkinname",
    "nextofkinphone",
    "nextofkinrelation",
    "residentialaddress",
    "residential_address",
    "businesslocation",
    "business_location",
    "passportnumber",
    "passport_number",
    "dateofbirth",
    "dob",
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
    return `${serialized.slice(0, maxLength)}???`;
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
  const configuredLogSampleRate = Number(process.env.LOG_HTTP_SAMPLE_RATE);
  const logSampleRate = Number.isFinite(configuredLogSampleRate)
    ? Math.min(Math.max(configuredLogSampleRate, 0), 1)
    : 1;

  app.disable("x-powered-by");
  if (shouldEnableTrustProxy()) {
    app.set("trust proxy", 1);
  }
  app.use(requestContext);
  app.use(tenantContext);
  app.use(createHttpTracingMiddleware());
  const corsMiddleware = cors(buildCorsOptions());
  const corsBypassPaths = new Set([
    "/health",
    "/health/details",
    "/ready",
    "/metrics",
    "/api/ready",
    "/api/system/health",
  ]);
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

      const shouldSample = logSampleRate >= 1 ? true : Math.random() < logSampleRate;
      const shouldLog = res.statusCode >= 400 || shouldSample;
      if (logger && typeof logger.info === "function" && shouldLog) {
        const requestBodyPreview = payloadLoggingEnabled
          ? toPreviewString((req as Record<string, unknown>).body, payloadLogMaxBytes)
          : null;
        const responseBodyPreview = payloadLoggingEnabled
          ? toPreviewString((req as Record<string, unknown>).responseBodyPreview, payloadLogMaxBytes)
          : null;

        logger.info("http.request.completed", {
          requestId: req.requestId || null,
          traceId: req.traceId || null,
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
  app.use((req: RequestLike, res: ResponseLike, next: NextFunctionLike) => {
    if (corsBypassPaths.has(String(req.path || "").trim())) {
      next();
      return;
    }

    corsMiddleware(req as never, res as never, next as never);
  });
  app.use(
    helmet({
      // HSTS: Enforce HTTPS for 1 year, include subdomains, preload
      hsts: {
        maxAge: 31536000, // 1 year in seconds
        includeSubDomains: true,
        preload: true,
      },
      // Content Security Policy
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          scriptSrc: ["'self'"],
          scriptSrcAttr: ["'none'"], // Disallow inline event handlers
          styleSrc: ["'self'", "https://fonts.googleapis.com"],
          styleSrcAttr: ["'self'"], // Disallow inline styles
          fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
          imgSrc: buildImageSourceList(),
          connectSrc: ["'self'"],
          // Form action restrictions
          formAction: ["'self'"],
          // Restrict frame sources
          frameSrc: ["'none'"],
          workerSrc: ["'self'"],
          manifestSrc: ["'self'"],
        },
      },
      // Cross-Origin policies
      crossOriginResourcePolicy: { policy: "same-origin" },
      crossOriginOpenerPolicy: { policy: "same-origin" },
      crossOriginEmbedderPolicy: false, // Required for Google Fonts
      // Referrer policy
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      // X-Content-Type-Options: Prevent MIME sniffing
      noSniff: true,
      // X-Frame-Options: Prevent clickjacking
      frameguard: { action: "deny" },
      // X-XSS-Protection (legacy, but still useful for older browsers)
      xssFilter: true,
    }),
  );
  // Keep the body limit tight — 256 kb is ample for any financial API payload.
  // Upload endpoints use Multer with their own (higher) limits; those routes
  // are registered AFTER this middleware so Multer wins for multipart.
  app.use(express.json({
    limit: "256kb",
    verify: (req, _res, buf) => {
      (req as unknown as Record<string, unknown>).rawBody = buf.toString("utf8");
    },
  }));
  app.use(express.urlencoded({ extended: true, limit: "256kb" }));
  app.use(express.static(resolveStaticAppDir()));
}

export {
  applySecurityMiddleware,
  createAuthLimiter,
  createGeneralApiLimiter,
  resolveStaticAppDir,
  resolveStaticAppIndexPath,
};
