import test from "node:test";
import assert from "node:assert/strict";
import { validateEnvironment } from "../src/config/env.js";
test("environment validation requires at least one JWT secret", () => {
  const result = validateEnvironment({
    JWT_SECRET: "",
    JWT_SECRETS: "",
  });

  assert.ok(Array.isArray(result.errors));
  assert.ok(result.errors.some((item) => item.includes("JWT_SECRET")));
});

test("environment validation blocks sqlite in production unless explicit override is set", () => {
  const blocked = validateEnvironment({
    JWT_SECRET: "test-secret",
    NODE_ENV: "production",
    DB_CLIENT: "sqlite",
  });
  assert.ok(blocked.errors.some((item) => item.includes("ALLOW_SQLITE_IN_PRODUCTION")));

  const allowed = validateEnvironment({
    JWT_SECRET: "test-secret",
    NODE_ENV: "production",
    DB_CLIENT: "sqlite",
    ALLOW_SQLITE_IN_PRODUCTION: "true",
  });
  assert.equal(allowed.errors.length, 0);
});

test("environment validation warns when backup is enabled with in-memory DB", () => {
  const result = validateEnvironment({
    JWT_SECRET: "test-secret",
    DB_BACKUP_ENABLED: "true",
    DB_PATH: ":memory:",
  });

  assert.equal(result.errors.length, 0);
  assert.ok(result.warnings.some((item) => item.includes("DB_BACKUP_ENABLED")));
});

test("environment validation accepts valid settings", () => {
  const result = validateEnvironment({
    JWT_SECRET: "test-secret",
    LOG_LEVEL: "info",
    PORT: "4000",
    OVERDUE_SYNC_INTERVAL_MS: "60000",
    DB_BACKUP_INTERVAL_MS: "21600000",
    DB_BACKUP_RETENTION_COUNT: "14",
    REPORT_CACHE_ENABLED: "true",
    REPORT_CACHE_TTL_MS: "15000",
    REPORT_CACHE_STRATEGY: "memory",
    PASSWORD_RESET_WEBHOOK_TIMEOUT_MS: "5000",
    CORS_ORIGINS: "http://localhost:4000",
  });

  assert.equal(result.errors.length, 0);
});

test("environment validation rejects invalid report cache ttl and strategy", () => {
  const result = validateEnvironment({
    JWT_SECRET: "test-secret",
    REPORT_CACHE_TTL_MS: "50",
    REPORT_CACHE_STRATEGY: "disk",
  });

  assert.ok(result.errors.some((item) => item.includes("REPORT_CACHE_TTL_MS")));
  assert.ok(result.errors.some((item) => item.includes("REPORT_CACHE_STRATEGY")));
});

test("environment validation rejects invalid report delivery configuration", () => {
  const result = validateEnvironment({
    JWT_SECRET: "test-secret",
    REPORT_DELIVERY_INTERVAL_MS: "50",
    REPORT_DELIVERY_RECIPIENT_EMAIL: "invalid-email",
    REPORT_DELIVERY_WEBHOOK_URL: "ftp://example.com/hook",
    REPORT_DELIVERY_WEBHOOK_TIMEOUT_MS: "70000",
  });

  assert.ok(result.errors.some((item) => item.includes("REPORT_DELIVERY_INTERVAL_MS")));
  assert.ok(result.errors.some((item) => item.includes("REPORT_DELIVERY_RECIPIENT_EMAIL")));
  assert.ok(result.errors.some((item) => item.includes("REPORT_DELIVERY_WEBHOOK_URL")));
  assert.ok(result.errors.some((item) => item.includes("REPORT_DELIVERY_WEBHOOK_TIMEOUT_MS")));
});

test("environment validation rejects invalid queue worker role", () => {
  const result = validateEnvironment({
    JWT_SECRET: "test-secret",
    JOB_QUEUE_ENABLED: "true",
    JOB_QUEUE_REDIS_URL: "redis://localhost:6379",
    JOB_QUEUE_ROLE: "api",
  });

  assert.ok(result.errors.some((item) => item.includes("JOB_QUEUE_ROLE")));
});

test("environment validation rejects invalid upload storage settings", () => {
  const result = validateEnvironment({
    JWT_SECRET: "test-secret",
    UPLOAD_STORAGE_DRIVER: "gcs",
    UPLOAD_MAX_FILE_SIZE_MB: "0",
    UPLOAD_PUBLIC_BASE_PATH: "uploads",
  });

  assert.ok(result.errors.some((item) => item.includes("UPLOAD_STORAGE_DRIVER")));
  assert.ok(result.errors.some((item) => item.includes("UPLOAD_MAX_FILE_SIZE_MB")));
  assert.ok(result.errors.some((item) => item.includes("UPLOAD_PUBLIC_BASE_PATH")));
});

test("environment validation requires core S3 variables for s3 upload mode", () => {
  const result = validateEnvironment({
    JWT_SECRET: "test-secret",
    UPLOAD_STORAGE_DRIVER: "s3",
    UPLOAD_S3_ENDPOINT: "https://s3.example.local",
  });

  assert.ok(result.errors.some((item) => item.includes("UPLOAD_S3_BUCKET")));
  assert.ok(result.errors.some((item) => item.includes("UPLOAD_S3_ACCESS_KEY_ID")));
  assert.ok(result.errors.some((item) => item.includes("UPLOAD_S3_SECRET_ACCESS_KEY")));
});

test("environment validation accepts observability and monitoring settings", () => {
  const result = validateEnvironment({
    JWT_SECRET: "test-secret",
    LOG_SHIPPER_URL: "https://logs.example.com/ingest",
    LOG_SHIPPER_MIN_LEVEL: "warn",
    LOG_SHIPPER_TIMEOUT_MS: "3000",
    SENTRY_DSN: "https://public@example.ingest.sentry.io/123",
    SENTRY_TRACES_SAMPLE_RATE: "0.1",
    SENTRY_PROFILES_SAMPLE_RATE: "0.05",
    UPTIME_HEARTBEAT_URL: "https://uptime.example.com/ping/abc123",
    UPTIME_HEARTBEAT_INTERVAL_MS: "60000",
    HTTPS_ENFORCEMENT_MODE: "redirect",
    HTTPS_REDIRECT_STATUS_CODE: "308",
  });
  assert.equal(result.errors.length, 0);
});

test("environment validation rejects non-boolean ACCOUNTING_GL_SHADOW_MODE", () => {
  const result = validateEnvironment({
    JWT_SECRET: "test-secret",
    ACCOUNTING_GL_SHADOW_MODE: "yes",
  });
  assert.ok(
    result.errors.some((item) => item.includes("ACCOUNTING_GL_SHADOW_MODE")),
    "Should reject non-boolean ACCOUNTING_GL_SHADOW_MODE",
  );
});

test("environment validation rejects non-boolean ACCOUNTING_GL_CONSUMER_ENABLED", () => {
  const result = validateEnvironment({
    JWT_SECRET: "test-secret",
    ACCOUNTING_GL_CONSUMER_ENABLED: "1",
  });
  assert.ok(
    result.errors.some((item) => item.includes("ACCOUNTING_GL_CONSUMER_ENABLED")),
    "Should reject non-boolean ACCOUNTING_GL_CONSUMER_ENABLED",
  );
});

test("environment validation rejects RABBITMQ_ACCOUNTING_QUEUE with whitespace", () => {
  const result = validateEnvironment({
    JWT_SECRET: "test-secret",
    RABBITMQ_ACCOUNTING_QUEUE: "my queue name",
  });
  assert.ok(
    result.errors.some((item) => item.includes("RABBITMQ_ACCOUNTING_QUEUE")),
    "Should reject RABBITMQ_ACCOUNTING_QUEUE with spaces",
  );
});

test("environment validation accepts valid accounting GL consumer settings", () => {
  const result = validateEnvironment({
    JWT_SECRET: "test-secret",
    ACCOUNTING_GL_SHADOW_MODE: "false",
    ACCOUNTING_GL_CONSUMER_ENABLED: "true",
    RABBITMQ_ACCOUNTING_QUEUE: "afriserve.accounting",
    EVENT_BROKER_PROVIDER: "rabbitmq",
    EVENT_BROKER_URL: "amqp://localhost:5672",
  });
  assert.equal(result.errors.length, 0);
});

test("environment validation warns when shadow mode is off without a broker in production", () => {
  const result = validateEnvironment({
    JWT_SECRET: "test-secret",
    NODE_ENV: "production",
    DB_CLIENT: "postgres",
    DATABASE_URL: "postgresql://localhost/afriserve",
    AUTH_TOKEN_STORE_REDIS_URL: "redis://localhost:6379",
    ACCOUNTING_GL_SHADOW_MODE: "false",
    EVENT_BROKER_PROVIDER: "none",
  });
  assert.ok(
    result.warnings.some((w) => w.includes("ACCOUNTING_GL_SHADOW_MODE")),
    "Should warn about active mode without a broker in production",
  );
});
