import { parseBooleanEnv, getConfiguredDbClient } from "../utils/env.js";
import { parseAdminIpWhitelist } from "./whitelist.js";
type ValidationResult = {
  errors: string[];
  warnings: string[];
};

type HttpStatusError = Error & { status?: number };

function isBlank(value: unknown): boolean {
  return typeof value !== "string" || !value.trim();
}

function parseNumberEnv(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isIntegerNumber(value: number | null): value is number {
  return Number.isInteger(value);
}

function isValidIpv4(value: string): boolean {
  const parts = String(value || "").trim().split(".").map((part) => Number(part));
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255);
}

function validateEnvironment(env: NodeJS.ProcessEnv = process.env): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const jwtSecret = String(env.JWT_SECRET || "").trim();
  const jwtSecrets = String(env.JWT_SECRETS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!jwtSecret && jwtSecrets.length === 0) {
    errors.push("JWT_SECRET is required (or provide JWT_SECRETS with at least one secret).");
  }
  // Reject well-known placeholder values that were never replaced.
  const jwtSecretPlaceholders = [
    "replace-with-a-long-random-secret",
    "change_me",
    "changeme",
    "secret",
    "your_jwt_secret",
    "jwt_secret",
    "CHANGE_ME_generate_with_crypto_randomBytes_64_hex",
  ];
  if (jwtSecret && jwtSecretPlaceholders.some((p) => jwtSecret.toLowerCase() === p.toLowerCase())) {
    errors.push(`JWT_SECRET appears to be a placeholder value. Generate a real secret with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))".`);
  }

  const port = parseNumberEnv(env.PORT);
  if (env.PORT && (!isIntegerNumber(port) || port < 1 || port > 65535)) {
    errors.push("PORT must be an integer between 1 and 65535.");
  }

  const corsOriginsRaw = String(env.CORS_ORIGINS || "").trim();
  if (corsOriginsRaw) {
    const origins = corsOriginsRaw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (origins.length === 0) {
      errors.push("CORS_ORIGINS must contain at least one origin when provided.");
    }
  }

  const logSampleRate = parseNumberEnv(env.LOG_HTTP_SAMPLE_RATE);
  if (env.LOG_HTTP_SAMPLE_RATE && (logSampleRate === null || logSampleRate < 0 || logSampleRate > 1)) {
    errors.push("LOG_HTTP_SAMPLE_RATE must be a number between 0 and 1.");
  }

  const overdueSyncInterval = parseNumberEnv(env.OVERDUE_SYNC_INTERVAL_MS);
  if (env.OVERDUE_SYNC_INTERVAL_MS && (!isIntegerNumber(overdueSyncInterval) || overdueSyncInterval < 100)) {
    errors.push("OVERDUE_SYNC_INTERVAL_MS must be an integer >= 100.");
  }

  const backupEnabled = parseBooleanEnv(env.DB_BACKUP_ENABLED);
  const dbClient = getConfiguredDbClient(env);
  const isProduction = String(env.NODE_ENV || "").trim().toLowerCase() === "production";
  const allowSqliteInProduction = parseBooleanEnv(env.ALLOW_SQLITE_IN_PRODUCTION, false);
  if (!["sqlite", "postgres"].includes(dbClient)) {
    errors.push("DB_CLIENT must be one of: sqlite, postgres.");
  }
  if (isProduction && dbClient === "sqlite" && !allowSqliteInProduction) {
    errors.push("DB_CLIENT=sqlite is blocked in production. Use DB_CLIENT=postgres or set ALLOW_SQLITE_IN_PRODUCTION=true.");
  }
  if (dbClient === "postgres" && !String(env.DATABASE_URL || "").trim()) {
    errors.push("DATABASE_URL is required when DB_CLIENT=postgres.");
  }
  const databaseReadUrl = String(env.DATABASE_READ_URL || "").trim();
  if (databaseReadUrl) {
    if (dbClient !== "postgres") {
      warnings.push("DATABASE_READ_URL is set but DB_CLIENT is not postgres. Read-replica routing will use the primary database.");
    } else if (!/^postgres(ql)?:\/\//i.test(databaseReadUrl)) {
      errors.push("DATABASE_READ_URL must use postgres:// or postgresql:// when DB_CLIENT=postgres.");
    }
  }

  const pgPoolMax = parseNumberEnv(env.PG_POOL_MAX);
  if (env.PG_POOL_MAX && (!isIntegerNumber(pgPoolMax) || pgPoolMax < 1)) {
    errors.push("PG_POOL_MAX must be an integer >= 1.");
  }
  const pgIdleTimeoutMs = parseNumberEnv(env.PG_IDLE_TIMEOUT_MS);
  if (env.PG_IDLE_TIMEOUT_MS && (!isIntegerNumber(pgIdleTimeoutMs) || pgIdleTimeoutMs < 0)) {
    errors.push("PG_IDLE_TIMEOUT_MS must be an integer >= 0.");
  }
  const pgConnectionTimeoutMs = parseNumberEnv(env.PG_CONNECTION_TIMEOUT_MS);
  if (env.PG_CONNECTION_TIMEOUT_MS && (!isIntegerNumber(pgConnectionTimeoutMs) || pgConnectionTimeoutMs < 0)) {
    errors.push("PG_CONNECTION_TIMEOUT_MS must be an integer >= 0.");
  }
  const pgReadPoolMax = parseNumberEnv(env.PG_READ_POOL_MAX);
  if (env.PG_READ_POOL_MAX && (!isIntegerNumber(pgReadPoolMax) || pgReadPoolMax < 1)) {
    errors.push("PG_READ_POOL_MAX must be an integer >= 1.");
  }
  const pgReadIdleTimeoutMs = parseNumberEnv(env.PG_READ_IDLE_TIMEOUT_MS);
  if (env.PG_READ_IDLE_TIMEOUT_MS && (!isIntegerNumber(pgReadIdleTimeoutMs) || pgReadIdleTimeoutMs < 0)) {
    errors.push("PG_READ_IDLE_TIMEOUT_MS must be an integer >= 0.");
  }
  const pgReadConnectionTimeoutMs = parseNumberEnv(env.PG_READ_CONNECTION_TIMEOUT_MS);
  if (env.PG_READ_CONNECTION_TIMEOUT_MS && (!isIntegerNumber(pgReadConnectionTimeoutMs) || pgReadConnectionTimeoutMs < 0)) {
    errors.push("PG_READ_CONNECTION_TIMEOUT_MS must be an integer >= 0.");
  }

  const backupInterval = parseNumberEnv(env.DB_BACKUP_INTERVAL_MS);
  if (env.DB_BACKUP_INTERVAL_MS && (!isIntegerNumber(backupInterval) || backupInterval < 60000)) {
    errors.push("DB_BACKUP_INTERVAL_MS must be an integer >= 60000.");
  }

  const backupRetention = parseNumberEnv(env.DB_BACKUP_RETENTION_COUNT);
  if (env.DB_BACKUP_RETENTION_COUNT && (!isIntegerNumber(backupRetention) || backupRetention < 1)) {
    errors.push("DB_BACKUP_RETENTION_COUNT must be an integer >= 1.");
  }

  const reportCacheEnabled = parseBooleanEnv(env.REPORT_CACHE_ENABLED);
  const reportCacheTtl = parseNumberEnv(env.REPORT_CACHE_TTL_MS);
  if (env.REPORT_CACHE_TTL_MS && (!isIntegerNumber(reportCacheTtl) || reportCacheTtl < 100)) {
    errors.push("REPORT_CACHE_TTL_MS must be an integer >= 100.");
  }

  const reportCacheStrategy = String(env.REPORT_CACHE_STRATEGY || "").trim().toLowerCase();
  if (reportCacheStrategy && !["memory", "redis"].includes(reportCacheStrategy)) {
    errors.push("REPORT_CACHE_STRATEGY must be one of: memory, redis.");
  }

  const reportCacheRedisUrl = String(env.REPORT_CACHE_REDIS_URL || "").trim();
  if (reportCacheRedisUrl && !/^rediss?:\/\//i.test(reportCacheRedisUrl)) {
    errors.push("REPORT_CACHE_REDIS_URL must use redis:// or rediss://.");
  }

  if (reportCacheEnabled && reportCacheStrategy === "redis" && !reportCacheRedisUrl) {
    if (isProduction) {
      errors.push("REPORT_CACHE_STRATEGY=redis requires REPORT_CACHE_REDIS_URL in production.");
    } else {
      warnings.push("REPORT_CACHE_STRATEGY=redis without REPORT_CACHE_REDIS_URL will fall back to in-memory cache.");
    }
  }

  const tokenStoreRedisUrl = String(env.AUTH_TOKEN_STORE_REDIS_URL || env.REDIS_URL || "").trim();
  if (tokenStoreRedisUrl && !/^rediss?:\/\//i.test(tokenStoreRedisUrl)) {
    errors.push("AUTH_TOKEN_STORE_REDIS_URL must use redis:// or rediss:// (or set REDIS_URL).");
  }

  const authSessionCacheRedisUrl = String(env.AUTH_SESSION_CACHE_REDIS_URL || "").trim();
  if (authSessionCacheRedisUrl && !/^rediss?:\/\//i.test(authSessionCacheRedisUrl)) {
    errors.push("AUTH_SESSION_CACHE_REDIS_URL must use redis:// or rediss://.");
  }

  const authSessionCacheTtlSeconds = parseNumberEnv(env.AUTH_SESSION_CACHE_TTL_SECONDS);
  if (
    env.AUTH_SESSION_CACHE_TTL_SECONDS
    && (!isIntegerNumber(authSessionCacheTtlSeconds) || authSessionCacheTtlSeconds < 1 || authSessionCacheTtlSeconds > 86400)
  ) {
    errors.push("AUTH_SESSION_CACHE_TTL_SECONDS must be an integer between 1 and 86400.");
  }

  const authSessionCacheRevalidateAfterSeconds = parseNumberEnv(env.AUTH_SESSION_CACHE_REVALIDATE_AFTER_SECONDS);
  if (
    env.AUTH_SESSION_CACHE_REVALIDATE_AFTER_SECONDS
    && (!isIntegerNumber(authSessionCacheRevalidateAfterSeconds) || authSessionCacheRevalidateAfterSeconds < 1 || authSessionCacheRevalidateAfterSeconds > 86400)
  ) {
    errors.push("AUTH_SESSION_CACHE_REVALIDATE_AFTER_SECONDS must be an integer between 1 and 86400.");
  }

  const seedDefaultAdminOnEmptyDb = parseBooleanEnv(
    env.SEED_DEFAULT_ADMIN_ON_EMPTY_DB,
    !isProduction,
  );
  const defaultAdminEmail = String(env.DEFAULT_ADMIN_EMAIL || "").trim().toLowerCase();
  if (defaultAdminEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(defaultAdminEmail)) {
    errors.push("DEFAULT_ADMIN_EMAIL must be a valid email address.");
  }
  const defaultAdminPassword = String(env.DEFAULT_ADMIN_PASSWORD || "").trim();
  if (isProduction && seedDefaultAdminOnEmptyDb && !defaultAdminPassword) {
    errors.push("DEFAULT_ADMIN_PASSWORD is required when SEED_DEFAULT_ADMIN_ON_EMPTY_DB=true in production.");
  }
  if (isProduction && seedDefaultAdminOnEmptyDb && defaultAdminPassword === "Admin@123") {
    errors.push("DEFAULT_ADMIN_PASSWORD must not use the built-in default password in production.");
  }
  if (isProduction && seedDefaultAdminOnEmptyDb) {
    warnings.push("SEED_DEFAULT_ADMIN_ON_EMPTY_DB=true will create an initial admin account on first boot when the users table is empty.");
  }

  const rateLimitRedisUrl = String(env.RATE_LIMIT_REDIS_URL || env.REDIS_URL || "").trim();
  if (rateLimitRedisUrl && !/^rediss?:\/\//i.test(rateLimitRedisUrl)) {
    errors.push("RATE_LIMIT_REDIS_URL must use redis:// or rediss://.");
  }

  const effectiveAuthSessionCacheRedisUrl = authSessionCacheRedisUrl || tokenStoreRedisUrl;
  const requireDistributedRedisInProduction = isProduction && !(dbClient === "sqlite" && allowSqliteInProduction);
  if (requireDistributedRedisInProduction && !tokenStoreRedisUrl) {
    errors.push("AUTH_TOKEN_STORE_REDIS_URL (or REDIS_URL) is required in production for token blacklist and refresh token storage.");
  } else if (isProduction && !tokenStoreRedisUrl) {
    warnings.push("AUTH_TOKEN_STORE_REDIS_URL (or REDIS_URL) is recommended in production when ALLOW_SQLITE_IN_PRODUCTION=true.");
  }
  if (requireDistributedRedisInProduction && !effectiveAuthSessionCacheRedisUrl) {
    errors.push("AUTH_SESSION_CACHE_REDIS_URL (or AUTH_TOKEN_STORE_REDIS_URL / REDIS_URL) is required in production for auth session caching.");
  } else if (isProduction && !effectiveAuthSessionCacheRedisUrl) {
    warnings.push("AUTH_SESSION_CACHE_REDIS_URL (or AUTH_TOKEN_STORE_REDIS_URL / REDIS_URL) is recommended in production when ALLOW_SQLITE_IN_PRODUCTION=true.");
  }
  if (requireDistributedRedisInProduction && !rateLimitRedisUrl) {
    errors.push("RATE_LIMIT_REDIS_URL (or REDIS_URL) is required in production for distributed rate limiting.");
  } else if (isProduction && !rateLimitRedisUrl) {
    warnings.push("RATE_LIMIT_REDIS_URL (or REDIS_URL) is recommended in production when ALLOW_SQLITE_IN_PRODUCTION=true.");
  }

  const reportDeliveryEnabled = parseBooleanEnv(env.REPORT_DELIVERY_ENABLED);
  const reportDeliveryInterval = parseNumberEnv(env.REPORT_DELIVERY_INTERVAL_MS);
  if (env.REPORT_DELIVERY_INTERVAL_MS && (!isIntegerNumber(reportDeliveryInterval) || reportDeliveryInterval < 100)) {
    errors.push("REPORT_DELIVERY_INTERVAL_MS must be an integer >= 100.");
  }
  const reportDeliveryRecipient = String(env.REPORT_DELIVERY_RECIPIENT_EMAIL || "").trim().toLowerCase();
  if (reportDeliveryRecipient && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reportDeliveryRecipient)) {
    errors.push("REPORT_DELIVERY_RECIPIENT_EMAIL must be a valid email address.");
  }
  if (reportDeliveryEnabled && !reportDeliveryRecipient) {
    warnings.push("REPORT_DELIVERY_ENABLED=true without REPORT_DELIVERY_RECIPIENT_EMAIL disables scheduled deliveries.");
  }

  const reportDeliveryWebhookUrl = String(env.REPORT_DELIVERY_WEBHOOK_URL || "").trim();
  if (reportDeliveryWebhookUrl && !/^https?:\/\//i.test(reportDeliveryWebhookUrl)) {
    errors.push("REPORT_DELIVERY_WEBHOOK_URL must use http:// or https://.");
  }
  if (reportDeliveryEnabled && !reportDeliveryWebhookUrl) {
    warnings.push("REPORT_DELIVERY_WEBHOOK_URL is not set. Scheduled report delivery will run in log-only mode.");
  }

  const reportDeliveryWebhookTimeout = parseNumberEnv(env.REPORT_DELIVERY_WEBHOOK_TIMEOUT_MS);
  if (
    env.REPORT_DELIVERY_WEBHOOK_TIMEOUT_MS
    && (!isIntegerNumber(reportDeliveryWebhookTimeout) || reportDeliveryWebhookTimeout < 500 || reportDeliveryWebhookTimeout > 60000)
  ) {
    errors.push("REPORT_DELIVERY_WEBHOOK_TIMEOUT_MS must be an integer between 500 and 60000.");
  }

  if (backupEnabled && dbClient !== "sqlite") {
    warnings.push("DB_BACKUP_ENABLED=true is only supported for DB_CLIENT=sqlite.");
  }
  if (backupEnabled && String(env.DB_PATH || "").trim() === ":memory:") {
    warnings.push("DB_BACKUP_ENABLED=true has no effect when DB_PATH=:memory:.");
  }

  const jobQueueEnabled = parseBooleanEnv(env.JOB_QUEUE_ENABLED, false);
  const jobQueueRedisUrl = String(env.JOB_QUEUE_REDIS_URL || "").trim();
  if (jobQueueRedisUrl && !/^rediss?:\/\//i.test(jobQueueRedisUrl)) {
    errors.push("JOB_QUEUE_REDIS_URL must use redis:// or rediss://.");
  }
  if (typeof env.JOB_QUEUE_DLQ_NAME === "string" && !String(env.JOB_QUEUE_DLQ_NAME).trim()) {
    errors.push("JOB_QUEUE_DLQ_NAME must not be empty when provided.");
  }
  if (jobQueueEnabled && !jobQueueRedisUrl) {
    if (isProduction) {
      errors.push("JOB_QUEUE_REDIS_URL is required when JOB_QUEUE_ENABLED=true in production.");
    } else {
      warnings.push("JOB_QUEUE_ENABLED=true without JOB_QUEUE_REDIS_URL will prevent queue startup.");
    }
  }
  const jobQueueRole = String(env.JOB_QUEUE_ROLE || "all").trim().toLowerCase();
  if (jobQueueRole && !["all", "scheduler", "worker"].includes(jobQueueRole)) {
    errors.push("JOB_QUEUE_ROLE must be one of: all, scheduler, worker.");
  }
  const jobQueueConcurrency = parseNumberEnv(env.JOB_QUEUE_CONCURRENCY);
  if (env.JOB_QUEUE_CONCURRENCY && (!isIntegerNumber(jobQueueConcurrency) || jobQueueConcurrency < 1)) {
    errors.push("JOB_QUEUE_CONCURRENCY must be an integer >= 1.");
  }
  const jobQueueAttempts = parseNumberEnv(env.JOB_QUEUE_ATTEMPTS);
  if (env.JOB_QUEUE_ATTEMPTS && (!isIntegerNumber(jobQueueAttempts) || jobQueueAttempts < 1)) {
    errors.push("JOB_QUEUE_ATTEMPTS must be an integer >= 1.");
  }

  const mobileMoneyProviderTimeoutMs = parseNumberEnv(env.MOBILE_MONEY_PROVIDER_TIMEOUT_MS);
  if (
    env.MOBILE_MONEY_PROVIDER_TIMEOUT_MS
    && (!isIntegerNumber(mobileMoneyProviderTimeoutMs) || mobileMoneyProviderTimeoutMs < 100)
  ) {
    errors.push("MOBILE_MONEY_PROVIDER_TIMEOUT_MS must be an integer >= 100.");
  }

  const mobileMoneyCircuitFailureThreshold = parseNumberEnv(env.MOBILE_MONEY_CIRCUIT_FAILURE_THRESHOLD);
  if (
    env.MOBILE_MONEY_CIRCUIT_FAILURE_THRESHOLD
    && (!isIntegerNumber(mobileMoneyCircuitFailureThreshold) || mobileMoneyCircuitFailureThreshold < 1)
  ) {
    errors.push("MOBILE_MONEY_CIRCUIT_FAILURE_THRESHOLD must be an integer >= 1.");
  }

  const mobileMoneyCircuitResetTimeoutMs = parseNumberEnv(env.MOBILE_MONEY_CIRCUIT_RESET_TIMEOUT_MS);
  if (
    env.MOBILE_MONEY_CIRCUIT_RESET_TIMEOUT_MS
    && (!isIntegerNumber(mobileMoneyCircuitResetTimeoutMs) || mobileMoneyCircuitResetTimeoutMs < 1000)
  ) {
    errors.push("MOBILE_MONEY_CIRCUIT_RESET_TIMEOUT_MS must be an integer >= 1000.");
  }

  const accountingBatchIntervalMs = parseNumberEnv(env.ACCOUNTING_BATCH_INTERVAL_MS);
  if (
    env.ACCOUNTING_BATCH_INTERVAL_MS
    && (!isIntegerNumber(accountingBatchIntervalMs) || accountingBatchIntervalMs < 300000)
  ) {
    errors.push("ACCOUNTING_BATCH_INTERVAL_MS must be an integer >= 300000.");
  }

  const webhookTimeout = parseNumberEnv(env.PASSWORD_RESET_WEBHOOK_TIMEOUT_MS);
  if (
    env.PASSWORD_RESET_WEBHOOK_TIMEOUT_MS
    && (!isIntegerNumber(webhookTimeout) || webhookTimeout < 500 || webhookTimeout > 60000)
  ) {
    errors.push("PASSWORD_RESET_WEBHOOK_TIMEOUT_MS must be an integer between 500 and 60000.");
  }

  if (!isBlank(env.PASSWORD_RESET_WEBHOOK_URL)) {
    try {
      const parsed = new URL(String(env.PASSWORD_RESET_WEBHOOK_URL));
      if (!["http:", "https:"].includes(parsed.protocol)) {
        errors.push("PASSWORD_RESET_WEBHOOK_URL must use http or https.");
      }
    } catch (_error) {
      errors.push("PASSWORD_RESET_WEBHOOK_URL must be a valid URL.");
    }
  }

  const logLevel = String(env.LOG_LEVEL || "").trim().toLowerCase();
  if (logLevel && !["debug", "info", "warn", "error"].includes(logLevel)) {
    errors.push("LOG_LEVEL must be one of: debug, info, warn, error.");
  }
  const logShipperUrl = String(env.LOG_SHIPPER_URL || "").trim();
  if (logShipperUrl) {
    try {
      const parsed = new URL(logShipperUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        errors.push("LOG_SHIPPER_URL must use http:// or https://.");
      }
    } catch (_error) {
      errors.push("LOG_SHIPPER_URL must be a valid URL.");
    }
  }
  const logShipperMinLevel = String(env.LOG_SHIPPER_MIN_LEVEL || "").trim().toLowerCase();
  if (logShipperMinLevel && !["debug", "info", "warn", "error"].includes(logShipperMinLevel)) {
    errors.push("LOG_SHIPPER_MIN_LEVEL must be one of: debug, info, warn, error.");
  }
  const logShipperTimeoutMs = parseNumberEnv(env.LOG_SHIPPER_TIMEOUT_MS);
  if (env.LOG_SHIPPER_TIMEOUT_MS && (!isIntegerNumber(logShipperTimeoutMs) || logShipperTimeoutMs < 100 || logShipperTimeoutMs > 60000)) {
    errors.push("LOG_SHIPPER_TIMEOUT_MS must be an integer between 100 and 60000.");
  }

  const sentryDsn = String(env.SENTRY_DSN || "").trim();
  if (sentryDsn) {
    try {
      const parsed = new URL(sentryDsn);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        errors.push("SENTRY_DSN must use http:// or https://.");
      }
    } catch (_error) {
      errors.push("SENTRY_DSN must be a valid URL.");
    }
  }
  const sentryTraceSampleRate = parseNumberEnv(env.SENTRY_TRACES_SAMPLE_RATE);
  if (
    env.SENTRY_TRACES_SAMPLE_RATE
    && (sentryTraceSampleRate === null || sentryTraceSampleRate < 0 || sentryTraceSampleRate > 1)
  ) {
    errors.push("SENTRY_TRACES_SAMPLE_RATE must be a number between 0 and 1.");
  }
  const sentryProfilesSampleRate = parseNumberEnv(env.SENTRY_PROFILES_SAMPLE_RATE);
  if (
    env.SENTRY_PROFILES_SAMPLE_RATE
    && (sentryProfilesSampleRate === null || sentryProfilesSampleRate < 0 || sentryProfilesSampleRate > 1)
  ) {
    errors.push("SENTRY_PROFILES_SAMPLE_RATE must be a number between 0 and 1.");
  }

  const otelExporterEndpoint = String(
    env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || env.OTEL_EXPORTER_OTLP_ENDPOINT || "",
  ).trim();
  if (otelExporterEndpoint) {
    try {
      const parsed = new URL(otelExporterEndpoint);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        errors.push("OTEL_EXPORTER_OTLP_ENDPOINT must use http:// or https://.");
      }
    } catch (_error) {
      errors.push("OTEL_EXPORTER_OTLP_ENDPOINT must be a valid URL.");
    }
  }
  const otelTraceSampleRatio = parseNumberEnv(env.OTEL_TRACE_SAMPLE_RATIO);
  if (
    env.OTEL_TRACE_SAMPLE_RATIO
    && (otelTraceSampleRatio === null || otelTraceSampleRatio < 0 || otelTraceSampleRatio > 1)
  ) {
    errors.push("OTEL_TRACE_SAMPLE_RATIO must be a number between 0 and 1.");
  }
  if (typeof env.OTEL_SERVICE_NAME === "string" && !String(env.OTEL_SERVICE_NAME).trim()) {
    errors.push("OTEL_SERVICE_NAME must not be empty when provided.");
  }

  const uptimeHeartbeatUrl = String(env.UPTIME_HEARTBEAT_URL || "").trim();
  if (uptimeHeartbeatUrl) {
    try {
      const parsed = new URL(uptimeHeartbeatUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        errors.push("UPTIME_HEARTBEAT_URL must use http:// or https://.");
      }
    } catch (_error) {
      errors.push("UPTIME_HEARTBEAT_URL must be a valid URL.");
    }
  }
  const uptimeHeartbeatIntervalMs = parseNumberEnv(env.UPTIME_HEARTBEAT_INTERVAL_MS);
  if (
    env.UPTIME_HEARTBEAT_INTERVAL_MS
    && (!isIntegerNumber(uptimeHeartbeatIntervalMs) || uptimeHeartbeatIntervalMs < 10000 || uptimeHeartbeatIntervalMs > 86400000)
  ) {
    errors.push("UPTIME_HEARTBEAT_INTERVAL_MS must be an integer between 10000 and 86400000.");
  }

  // Warn when running in production behind a reverse proxy without TRUST_PROXY=true.
  // Without it, Express reads req.ip from the direct TCP connection and rate limiting
  // / audit logs will record the load balancer IP instead of the client IP.
  const isProductionLike = String(env.NODE_ENV || "").trim().toLowerCase() === "production";
  const trustProxyConfigured = parseBooleanEnv(env.TRUST_PROXY, false);
  if (isProductionLike && !trustProxyConfigured) {
    warnings.push(
      "TRUST_PROXY is not set. If this server runs behind a load balancer or reverse proxy, " +
      "set TRUST_PROXY=true so that Express reads the real client IP from X-Forwarded-For. " +
      "Without this, rate limiting and audit logs record the proxy IP.",
    );
  }

  const httpsEnforcementMode = String(env.HTTPS_ENFORCEMENT_MODE || "").trim().toLowerCase();
  if (httpsEnforcementMode && !["reject", "redirect"].includes(httpsEnforcementMode)) {
    errors.push("HTTPS_ENFORCEMENT_MODE must be one of: reject, redirect.");
  }
  const httpsRedirectStatusCode = parseNumberEnv(env.HTTPS_REDIRECT_STATUS_CODE);
  if (
    env.HTTPS_REDIRECT_STATUS_CODE
    && (!isIntegerNumber(httpsRedirectStatusCode) || ![301, 302, 307, 308].includes(httpsRedirectStatusCode))
  ) {
    errors.push("HTTPS_REDIRECT_STATUS_CODE must be one of: 301, 302, 307, 308.");
  }

  const uploadStorageDriver = String(env.UPLOAD_STORAGE_DRIVER || "").trim().toLowerCase();
  if (uploadStorageDriver && !["local", "s3"].includes(uploadStorageDriver)) {
    errors.push("UPLOAD_STORAGE_DRIVER must be one of: local, s3.");
  }

  const uploadMaxFileSizeMb = parseNumberEnv(env.UPLOAD_MAX_FILE_SIZE_MB);
  if (
    env.UPLOAD_MAX_FILE_SIZE_MB
    && (!isIntegerNumber(uploadMaxFileSizeMb) || uploadMaxFileSizeMb < 1 || uploadMaxFileSizeMb > 100)
  ) {
    errors.push("UPLOAD_MAX_FILE_SIZE_MB must be an integer between 1 and 100.");
  }

  const uploadPublicBasePath = String(env.UPLOAD_PUBLIC_BASE_PATH || "").trim();
  if (uploadPublicBasePath && !uploadPublicBasePath.startsWith("/")) {
    errors.push("UPLOAD_PUBLIC_BASE_PATH must start with '/'.");
  }

  const mobileMoneyProvider = String(env.MOBILE_MONEY_PROVIDER || "").trim().toLowerCase();
  if (mobileMoneyProvider && !["mock", "daraja"].includes(mobileMoneyProvider)) {
    errors.push("MOBILE_MONEY_PROVIDER must be one of: mock, daraja.");
  }
  const mobileMoneyC2BEnabled = parseBooleanEnv(env.MOBILE_MONEY_C2B_ENABLED, false);
  const mobileMoneyB2CEnabled = parseBooleanEnv(env.MOBILE_MONEY_B2C_ENABLED, false);
  const mobileMoneyStkEnabled = parseBooleanEnv(env.MOBILE_MONEY_STK_ENABLED, false);
  const mobileMoneyWebhookToken = String(env.MOBILE_MONEY_WEBHOOK_TOKEN || "").trim();
  const mobileMoneyCallbackIpWhitelistRaw = String(env.MOBILE_MONEY_CALLBACK_IP_WHITELIST || "").trim();
  const mobileMoneyDarajaBaseUrl = String(env.MOBILE_MONEY_DARAJA_BASE_URL || "").trim();
  const mobileMoneyDarajaConsumerKey = String(env.MOBILE_MONEY_DARAJA_CONSUMER_KEY || "").trim();
  const mobileMoneyDarajaConsumerSecret = String(env.MOBILE_MONEY_DARAJA_CONSUMER_SECRET || "").trim();
  const mobileMoneyDarajaB2CInitiatorName = String(env.MOBILE_MONEY_DARAJA_B2C_INITIATOR_NAME || "").trim();
  const mobileMoneyDarajaB2CSecurityCredential = String(env.MOBILE_MONEY_DARAJA_B2C_SECURITY_CREDENTIAL || "").trim();
  const mobileMoneyDarajaB2CShortCode = String(env.MOBILE_MONEY_DARAJA_B2C_SHORTCODE || "").trim();
  const mobileMoneyDarajaB2CResultUrl = String(env.MOBILE_MONEY_DARAJA_B2C_RESULT_URL || "").trim();
  const mobileMoneyDarajaB2CTimeoutUrl = String(env.MOBILE_MONEY_DARAJA_B2C_TIMEOUT_URL || "").trim();
  const mobileMoneyDarajaStkPasskey = String(env.MOBILE_MONEY_DARAJA_STK_PASSKEY || "").trim();
  const mobileMoneyDarajaStkCallbackUrl = String(env.MOBILE_MONEY_DARAJA_STK_CALLBACK_URL || "").trim();
  if (mobileMoneyC2BEnabled && !mobileMoneyWebhookToken) {
    warnings.push("MOBILE_MONEY_C2B_ENABLED=true without MOBILE_MONEY_WEBHOOK_TOKEN leaves webhook endpoint disabled.");
  }
  if (mobileMoneyB2CEnabled && !mobileMoneyProvider) {
    warnings.push("MOBILE_MONEY_B2C_ENABLED=true without MOBILE_MONEY_PROVIDER defaults to mock provider.");
  }
  if (mobileMoneyStkEnabled && !mobileMoneyProvider) {
    warnings.push("MOBILE_MONEY_STK_ENABLED=true without MOBILE_MONEY_PROVIDER defaults to mock provider.");
  }
  if (mobileMoneyCallbackIpWhitelistRaw) {
    const entries = parseAdminIpWhitelist(mobileMoneyCallbackIpWhitelistRaw);
    entries.forEach((entry) => {
      if (entry.kind === "ip") {
        if (!isValidIpv4(entry.value)) {
          errors.push(`MOBILE_MONEY_CALLBACK_IP_WHITELIST contains invalid IPv4 entry: "${entry.raw}".`);
        }
        return;
      }

      const prefix = Number(entry.prefix);
      if (!isValidIpv4(entry.value) || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
        errors.push(`MOBILE_MONEY_CALLBACK_IP_WHITELIST contains invalid CIDR entry: "${entry.raw}".`);
      }
    });
  }
  if (mobileMoneyDarajaBaseUrl) {
    try {
      const parsed = new URL(mobileMoneyDarajaBaseUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        errors.push("MOBILE_MONEY_DARAJA_BASE_URL must use http:// or https://.");
      }
    } catch (_error) {
      errors.push("MOBILE_MONEY_DARAJA_BASE_URL must be a valid URL.");
    }
  }
  if (mobileMoneyProvider === "daraja") {
    if (!mobileMoneyDarajaConsumerKey) {
      errors.push("MOBILE_MONEY_DARAJA_CONSUMER_KEY is required when MOBILE_MONEY_PROVIDER=daraja.");
    }
    if (!mobileMoneyDarajaConsumerSecret) {
      errors.push("MOBILE_MONEY_DARAJA_CONSUMER_SECRET is required when MOBILE_MONEY_PROVIDER=daraja.");
    }
    if (!mobileMoneyDarajaBaseUrl) {
      warnings.push("MOBILE_MONEY_DARAJA_BASE_URL is not set. Defaulting to Safaricom sandbox base URL is recommended.");
    }
    if (mobileMoneyB2CEnabled) {
      if (!mobileMoneyDarajaB2CInitiatorName) {
        errors.push("MOBILE_MONEY_DARAJA_B2C_INITIATOR_NAME is required when MOBILE_MONEY_PROVIDER=daraja and MOBILE_MONEY_B2C_ENABLED=true.");
      }
      if (!mobileMoneyDarajaB2CSecurityCredential) {
        errors.push("MOBILE_MONEY_DARAJA_B2C_SECURITY_CREDENTIAL is required when MOBILE_MONEY_PROVIDER=daraja and MOBILE_MONEY_B2C_ENABLED=true.");
      }
      if (!mobileMoneyDarajaB2CShortCode) {
        errors.push("MOBILE_MONEY_DARAJA_B2C_SHORTCODE is required when MOBILE_MONEY_PROVIDER=daraja and MOBILE_MONEY_B2C_ENABLED=true.");
      }
      if (!mobileMoneyDarajaB2CResultUrl) {
        errors.push("MOBILE_MONEY_DARAJA_B2C_RESULT_URL is required when MOBILE_MONEY_PROVIDER=daraja and MOBILE_MONEY_B2C_ENABLED=true.");
      } else {
        try {
          const parsed = new URL(mobileMoneyDarajaB2CResultUrl);
          if (!["http:", "https:"].includes(parsed.protocol)) {
            errors.push("MOBILE_MONEY_DARAJA_B2C_RESULT_URL must use http:// or https://.");
          }
        } catch (_error) {
          errors.push("MOBILE_MONEY_DARAJA_B2C_RESULT_URL must be a valid URL.");
        }
      }
      if (!mobileMoneyDarajaB2CTimeoutUrl) {
        errors.push("MOBILE_MONEY_DARAJA_B2C_TIMEOUT_URL is required when MOBILE_MONEY_PROVIDER=daraja and MOBILE_MONEY_B2C_ENABLED=true.");
      } else {
        try {
          const parsed = new URL(mobileMoneyDarajaB2CTimeoutUrl);
          if (!["http:", "https:"].includes(parsed.protocol)) {
            errors.push("MOBILE_MONEY_DARAJA_B2C_TIMEOUT_URL must use http:// or https://.");
          }
        } catch (_error) {
          errors.push("MOBILE_MONEY_DARAJA_B2C_TIMEOUT_URL must be a valid URL.");
        }
      }
    }
    if (mobileMoneyStkEnabled) {
      if (!mobileMoneyDarajaStkPasskey) {
        errors.push("MOBILE_MONEY_DARAJA_STK_PASSKEY is required when MOBILE_MONEY_PROVIDER=daraja and MOBILE_MONEY_STK_ENABLED=true.");
      }
      if (!mobileMoneyDarajaStkCallbackUrl) {
        errors.push("MOBILE_MONEY_DARAJA_STK_CALLBACK_URL is required when MOBILE_MONEY_PROVIDER=daraja and MOBILE_MONEY_STK_ENABLED=true.");
      } else {
        try {
          const parsed = new URL(mobileMoneyDarajaStkCallbackUrl);
          if (!["http:", "https:"].includes(parsed.protocol)) {
            errors.push("MOBILE_MONEY_DARAJA_STK_CALLBACK_URL must use http:// or https://.");
          }
        } catch (_error) {
          errors.push("MOBILE_MONEY_DARAJA_STK_CALLBACK_URL must be a valid URL.");
        }
      }
    }
  }

  if (uploadStorageDriver === "s3") {
    if (isBlank(env.UPLOAD_S3_ENDPOINT)) {
      errors.push("UPLOAD_S3_ENDPOINT is required when UPLOAD_STORAGE_DRIVER=s3.");
    } else {
      try {
        const parsed = new URL(String(env.UPLOAD_S3_ENDPOINT));
        if (!["http:", "https:"].includes(parsed.protocol)) {
          errors.push("UPLOAD_S3_ENDPOINT must use http or https.");
        }
      } catch (_error) {
        errors.push("UPLOAD_S3_ENDPOINT must be a valid URL.");
      }
    }

    if (isBlank(env.UPLOAD_S3_BUCKET)) {
      errors.push("UPLOAD_S3_BUCKET is required when UPLOAD_STORAGE_DRIVER=s3.");
    }
    if (isBlank(env.UPLOAD_S3_ACCESS_KEY_ID)) {
      errors.push("UPLOAD_S3_ACCESS_KEY_ID is required when UPLOAD_STORAGE_DRIVER=s3.");
    }
    if (isBlank(env.UPLOAD_S3_SECRET_ACCESS_KEY)) {
      errors.push("UPLOAD_S3_SECRET_ACCESS_KEY is required when UPLOAD_STORAGE_DRIVER=s3.");
    }
  }

  const eventBrokerProvider = String(env.EVENT_BROKER_PROVIDER || "none").trim().toLowerCase();
  if (!["none", "rabbitmq", "kafka"].includes(eventBrokerProvider)) {
    errors.push("EVENT_BROKER_PROVIDER must be one of: none, rabbitmq, kafka.");
  }
  const eventBrokerUrl = String(env.EVENT_BROKER_URL || "").trim();
  if (eventBrokerProvider !== "none" && !eventBrokerUrl) {
    errors.push("EVENT_BROKER_URL is required when EVENT_BROKER_PROVIDER is rabbitmq or kafka.");
  }
  if (eventBrokerProvider === "rabbitmq" && eventBrokerUrl && !/^amqps?:\/\//i.test(eventBrokerUrl)) {
    errors.push("EVENT_BROKER_URL must use amqp:// or amqps:// when EVENT_BROKER_PROVIDER=rabbitmq.");
  }
  if (eventBrokerProvider === "kafka" && eventBrokerUrl) {
    const brokers = eventBrokerUrl
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (brokers.length === 0) {
      errors.push("EVENT_BROKER_URL must contain at least one host:port broker when EVENT_BROKER_PROVIDER=kafka.");
    }
  }
  if (typeof env.EVENT_TOPIC_PREFIX === "string" && !String(env.EVENT_TOPIC_PREFIX).trim()) {
    errors.push("EVENT_TOPIC_PREFIX must not be empty when provided.");
  }
  if (typeof env.DEFAULT_TENANT_ID === "string" && !String(env.DEFAULT_TENANT_ID).trim()) {
    errors.push("DEFAULT_TENANT_ID must not be empty when provided.");
  }

  // ── Accounting GL event consumer validation ───────────────────────────────
  // ACCOUNTING_GL_SHADOW_MODE must be a boolean string when provided
  if (
    typeof env.ACCOUNTING_GL_SHADOW_MODE === "string"
    && env.ACCOUNTING_GL_SHADOW_MODE.trim()
    && !["true", "false"].includes(env.ACCOUNTING_GL_SHADOW_MODE.trim().toLowerCase())
  ) {
    errors.push("ACCOUNTING_GL_SHADOW_MODE must be 'true' or 'false' when provided.");
  }
  // ACCOUNTING_GL_CONSUMER_ENABLED must be a boolean string when provided
  if (
    typeof env.ACCOUNTING_GL_CONSUMER_ENABLED === "string"
    && env.ACCOUNTING_GL_CONSUMER_ENABLED.trim()
    && !["true", "false"].includes(env.ACCOUNTING_GL_CONSUMER_ENABLED.trim().toLowerCase())
  ) {
    errors.push("ACCOUNTING_GL_CONSUMER_ENABLED must be 'true' or 'false' when provided.");
  }
  // RABBITMQ_ACCOUNTING_QUEUE must not contain characters that break AMQP queue names
  if (typeof env.RABBITMQ_ACCOUNTING_QUEUE === "string" && env.RABBITMQ_ACCOUNTING_QUEUE.trim()) {
    if (!env.RABBITMQ_ACCOUNTING_QUEUE.trim()) {
      errors.push("RABBITMQ_ACCOUNTING_QUEUE must not be empty when provided.");
    } else if (/[\s'"\\]/.test(env.RABBITMQ_ACCOUNTING_QUEUE)) {
      errors.push("RABBITMQ_ACCOUNTING_QUEUE must not contain whitespace or quote characters.");
    }
  }
  // Warn if ACCOUNTING_GL_SHADOW_MODE=false in production without a broker — active mode
  // requires RabbitMQ so the GL subscriber is the authoritative posting path across instances
  const accountingGlShadowModeRaw = String(env.ACCOUNTING_GL_SHADOW_MODE || "true").trim().toLowerCase();
  if (
    isProduction
    && accountingGlShadowModeRaw === "false"
    && eventBrokerProvider === "none"
  ) {
    warnings.push(
      "ACCOUNTING_GL_SHADOW_MODE=false in production without EVENT_BROKER_PROVIDER=rabbitmq means " +
      "each API instance posts GL entries independently. This risks duplicate journals when running " +
      "multiple replicas. Set EVENT_BROKER_PROVIDER=rabbitmq to centralise GL posting.",
    );
  }

  return {
    errors,
    warnings,
  };
}

function assertEnvironment(env: NodeJS.ProcessEnv = process.env): ValidationResult {
  const result = validateEnvironment(env);
  if (result.errors.length > 0) {
    const details = result.errors.map((item) => `- ${item}`).join("\n");
    const error = new Error(`Environment validation failed:\n${details}`) as HttpStatusError;
    error.status = 500;
    throw error;
  }
  return result;
}

export {
  validateEnvironment,
  assertEnvironment,
};
