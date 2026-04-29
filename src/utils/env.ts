/**
 * env.ts — Environment variable helpers and typed accessors.
 *
 * All runtime configuration is sourced from process.env and read
 * here or inline in bootstrap.ts. This file provides:
 *   - Utility parsers (parseBooleanEnv, getConfiguredDbClient, etc.)
 *   - Type-safe wrappers for critical security-relevant variables
 *   - Documentation for every significant env var in one place
 *
 * ── CRITICAL (startup failure if missing/invalid in production) ──────
 *   JWT_SECRET          string ≥32 chars – HS256 signing secret
 *   JWT_SECRETS         comma-separated string – additional valid secrets
 *                       (for key rotation; previous key goes here while
 *                        existing tokens expire)
 *
 * ── AUTH ─────────────────────────────────────────────────────────────
 *   JWT_TOKEN_EXPIRY    e.g. "12h" – access token lifetime (default: 12h)
 *   BCRYPT_ROUNDS       number 10-16 – password hash rounds (default: 12)
 *
 * ── DATABASE ─────────────────────────────────────────────────────────
 *   DB_CLIENT           "sqlite" | "postgres" (default: sqlite in dev)
 *   DATABASE_URL        Postgres connection string or file: SQLite path
 *   DB_PATH             SQLite file path override
 *   DB_BACKUP_ENABLED   bool – enable periodic SQLite backups
 *   DB_BACKUP_DIR       path – where to write backup files
 *   DB_BACKUP_INTERVAL_MS  number – backup frequency (default: 6h)
 *   DB_BACKUP_RETENTION_COUNT  number – how many backups to keep
 *
 * ── CACHE / REDIS ────────────────────────────────────────────────────
 *   REDIS_URL               Redis connection string
 *   AUTH_TOKEN_STORE_REDIS_URL  Redis for token blacklist/rotation
 *   REPORT_CACHE_REDIS_URL  Redis for report result cache
 *   REPORT_CACHE_ENABLED    bool – enable report caching
 *   REPORT_CACHE_TTL_MS     number – cache TTL (default: 90s)
 *   REPORT_CACHE_STRATEGY   "redis" | "memory"
 *
 * ── MULTI-TENANCY ────────────────────────────────────────────────────
 *   DEFAULT_TENANT_ID   string – tenant used when X-Tenant-ID header
 *                       is absent (default: "default")
 *
 * ── NETWORK ──────────────────────────────────────────────────────────
 *   PORT               number – HTTP port (default: 3000)
 *   HOST               string – bind address (default: 0.0.0.0)
 *   CORS_ORIGINS       comma-separated list of allowed origins
 *   CORS_ALLOW_NO_ORIGIN  bool – allow requests without Origin header
 *   TRUST_PROXY        bool – trust X-Forwarded-For (set true behind ALB)
 *
 * ── MOBILE MONEY (Safaricom Daraja) ──────────────────────────────────
 *   MOBILE_MONEY_C2B_ENABLED          bool
 *   MOBILE_MONEY_STK_ENABLED          bool
 *   MOBILE_MONEY_B2C_ENABLED          bool
 *   MOBILE_MONEY_WEBHOOK_TOKEN        string – HMAC/shared token
 *   MOBILE_MONEY_DARAJA_BASE_URL      Daraja API base
 *   MOBILE_MONEY_DARAJA_CONSUMER_KEY  OAuth consumer key
 *   MOBILE_MONEY_DARAJA_CONSUMER_SECRET  OAuth consumer secret
 *   MOBILE_MONEY_DARAJA_STK_SHORTCODE    Paybill/till number
 *   MOBILE_MONEY_DARAJA_STK_PASSKEY      STK push passkey
 *   MOBILE_MONEY_DARAJA_STK_CALLBACK_URL STK result URL
 *   MOBILE_MONEY_DARAJA_B2C_SHORTCODE    B2C shortcode
 *   MOBILE_MONEY_DARAJA_B2C_INITIATOR_NAME
 *   MOBILE_MONEY_DARAJA_B2C_SECURITY_CREDENTIAL
 *   MOBILE_MONEY_DARAJA_B2C_RESULT_URL
 *   MOBILE_MONEY_DARAJA_B2C_TIMEOUT_URL
 *   MOBILE_MONEY_CALLBACK_IP_WHITELIST   comma-separated Safaricom IPs
 *   MOBILE_MONEY_PROVIDER_TIMEOUT_MS     HTTP timeout (default: 30s)
 *   MOBILE_MONEY_CIRCUIT_FAILURE_THRESHOLD  circuit breaker opens at N fails
 *   MOBILE_MONEY_CIRCUIT_RESET_TIMEOUT_MS   circuit breaker reset interval
 *
 * ── JOBS & BACKGROUND TASKS ──────────────────────────────────────────
 *   OVERDUE_SYNC_INTERVAL_MS   number – how often to mark overdue loans
 *   MAINTENANCE_CLEANUP_INTERVAL_MS  number – soft-delete cleanup freq
 *   ACCOUNTING_BATCH_ENABLED   bool – auto EOD/EOM batch posting
 *   ACCOUNTING_BATCH_INTERVAL_MS  number – batch check frequency
 *   REPORT_DELIVERY_ENABLED    bool – scheduled report digest
 *   REPORT_DELIVERY_INTERVAL_MS
 *   REPORT_DELIVERY_RECIPIENT_EMAIL
 *   REPORT_DELIVERY_WEBHOOK_URL
 *   REPORT_DELIVERY_WEBHOOK_TIMEOUT_MS
 *   ARCHIVE_CLOSED_LOANS_AFTER_YEARS  number (default: 3)
 *   PURGE_SOFT_DELETED_CLIENTS_AFTER_DAYS  number (default: 90)
 *
 * ── OBSERVABILITY ────────────────────────────────────────────────────
 *   SENTRY_DSN         Sentry error tracking DSN
 *   UPTIME_HEARTBEAT_URL   HTTP endpoint to ping on startup
 *   UPTIME_HEARTBEAT_INTERVAL_MS
 *   LOG_HTTP_BODIES    bool – log request/response payloads (never in prod)
 *   LOG_HTTP_PAYLOAD_MAX_BYTES  number – max payload log size
 *   LOG_HTTP_SAMPLE_RATE  float 0-1 – fraction of requests to log
 *
 * ── EVENT SYSTEM ─────────────────────────────────────────────────────
 *   DOMAIN_EVENT_DISPATCH_ENABLED  bool
 *   EVENT_BROKER_PROVIDER  "rabbitmq" | "memory"
 *   RABBITMQ_URL
 *   RABBITMQ_CONSUMER_QUEUE
 *   RABBITMQ_CONSUMER_MAX_RETRIES
 *   RABBITMQ_ACCOUNTING_QUEUE
 *   RABBITMQ_ACCOUNTING_MAX_RETRIES
 */

function parseBooleanEnv(value: unknown, defaultValue = false): boolean {
  if (typeof value === "undefined" || value === null) {
    return defaultValue;
  }
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) {
    return defaultValue;
  }
  return ["1", "true", "yes", "on"].includes(normalized);
}

function getDefaultDbClient(env: NodeJS.ProcessEnv = process.env): "sqlite" | "postgres" {
  const isProduction = String(env.NODE_ENV || "").trim().toLowerCase() === "production";
  return isProduction ? "postgres" : "sqlite";
}

function getConfiguredDbClient(env: NodeJS.ProcessEnv = process.env): string {
  const defaultClient = getDefaultDbClient(env);
  return String(env.DB_CLIENT || defaultClient).trim().toLowerCase();
}

/**
 * Returns the configured default tenant ID for requests without an
 * X-Tenant-ID header. Validated to match the tenant ID character class.
 */
function getDefaultTenantId(): string {
  const raw = String(process.env.DEFAULT_TENANT_ID || "default").trim();
  return /^[a-zA-Z0-9_-]{1,64}$/.test(raw) ? raw : "default";
}

export {
  parseBooleanEnv,
  getDefaultDbClient,
  getConfiguredDbClient,
  getDefaultTenantId,
};
