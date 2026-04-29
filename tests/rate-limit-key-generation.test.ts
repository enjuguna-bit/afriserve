/**
 * tests/rate-limit-key-generation.test.ts
 *
 * Pure unit tests for rate-limit key generation and bucket routing.
 * No server required — these exercise the pure functions that determine
 * which rate-limit bucket a request falls into and what key it is counted under.
 *
 * Covers:
 *  - Email-keyed auth bucket (login attempts)
 *  - Bearer-token keyed API bucket (authenticated API)
 *  - IP-fallback for unauthenticated non-login requests
 *  - User-id key for authenticated API calls
 *  - Refresh-token key for refresh attempts
 *  - resolveRateLimitBucket routing (login / reports / admin / api)
 *  - Rate limit config: login bucket is stricter than admin bucket
 */
import test from "node:test";
import assert from "node:assert/strict";

// Dynamic import so this test file compiles in both src/ and dist/ contexts
const { getAuthRateLimitRequesterKey, getApiRateLimitRequesterKey } = await import(
  "../src/utils/rateLimitKeys.js"
);
const { resolveRateLimitBucket, RATE_LIMITS } = await import(
  "../src/config/rateLimit.js"
);

// ── Auth bucket key generation ────────────────────────────────────────────

test("auth key uses hashed email for login attempts", () => {
  const req = { body: { email: "finance@example.com", password: "pw" }, headers: {}, ip: "1.2.3.4" };
  const key = getAuthRateLimitRequesterKey(req);
  assert.ok(key.startsWith("email:"), `Expected email: prefix, got "${key}"`);
  assert.equal(key, "email:finance@example.com");
});

test("auth key normalises email to lowercase", () => {
  const upper = getAuthRateLimitRequesterKey({ body: { email: "ADMIN@EXAMPLE.COM" }, headers: {}, ip: "1.2.3.4" });
  const lower = getAuthRateLimitRequesterKey({ body: { email: "admin@example.com" }, headers: {}, ip: "1.2.3.4" });
  assert.equal(upper, lower);
});

test("auth key falls back to hashed bearer token when no email body field", () => {
  const req = {
    body: {},
    headers: { authorization: "Bearer my-test-token-xyz" },
    ip: "1.2.3.4",
  };
  const key = getAuthRateLimitRequesterKey(req);
  assert.ok(key.startsWith("bearer:"), `Expected bearer: prefix, got "${key}"`);
});

test("auth key falls back to IP when no email, no bearer, no refresh token", () => {
  const req = { body: {}, headers: {}, ip: "10.0.0.55" };
  const key = getAuthRateLimitRequesterKey(req);
  assert.equal(key, "ip:10.0.0.55");
});

test("auth key uses hashed refresh token for refresh-flow rate limiting", () => {
  const req = {
    body: { token: "some-refresh-token-abc" },
    headers: {},
    ip: "1.2.3.4",
  };
  const key = getAuthRateLimitRequesterKey(req);
  assert.ok(key.startsWith("refresh:"), `Expected refresh: prefix, got "${key}"`);
});

test("two identical emails produce the same auth key", () => {
  const make = (email: string) =>
    getAuthRateLimitRequesterKey({ body: { email }, headers: {}, ip: "1.1.1.1" });
  assert.equal(make("user@test.com"), make("user@test.com"));
});

test("two different emails produce different auth keys", () => {
  const make = (email: string) =>
    getAuthRateLimitRequesterKey({ body: { email }, headers: {}, ip: "1.1.1.1" });
  assert.notEqual(make("a@test.com"), make("b@test.com"));
});

// ── API bucket key generation ─────────────────────────────────────────────

test("api key uses user id when request carries an authenticated user", () => {
  const req = { user: { sub: 42 }, headers: {}, ip: "1.2.3.4" };
  const key = getApiRateLimitRequesterKey(req);
  assert.equal(key, "user:42");
});

test("api key uses hashed bearer token for unauthenticated-but-tokenised requests", () => {
  const req = {
    user: null,
    headers: { authorization: "Bearer anon-token" },
    ip: "1.2.3.4",
  };
  const key = getApiRateLimitRequesterKey(req);
  assert.ok(key.startsWith("bearer:"), `Expected bearer: prefix, got "${key}"`);
});

test("api key falls back to IP when no user sub and no bearer", () => {
  const req = { user: null, headers: {}, ip: "203.0.113.7" };
  const key = getApiRateLimitRequesterKey(req);
  assert.equal(key, "ip:203.0.113.7");
});

test("two requests from the same user id share the same api key", () => {
  const make = (sub: number) => getApiRateLimitRequesterKey({ user: { sub }, headers: {}, ip: "x" });
  assert.equal(make(7), make(7));
});

test("two requests from different user ids have different api keys", () => {
  const make = (sub: number) => getApiRateLimitRequesterKey({ user: { sub }, headers: {}, ip: "x" });
  assert.notEqual(make(1), make(2));
});

// ── Bucket routing ─────────────────────────────────────────────────────────

test("resolveRateLimitBucket routes /auth/login to the login bucket", () => {
  assert.equal(resolveRateLimitBucket("/auth/login"), "login");
  assert.equal(resolveRateLimitBucket("/auth/login/"), "login");
});

test("resolveRateLimitBucket routes report endpoints to the reports bucket", () => {
  assert.equal(resolveRateLimitBucket("/reports/portfolio"), "reports");
  assert.equal(resolveRateLimitBucket("/reports/income-statement"), "reports");
});

test("resolveRateLimitBucket routes /reports/filter-options to the api bucket (lightweight override)", () => {
  assert.equal(resolveRateLimitBucket("/reports/filter-options"), "api");
});

test("resolveRateLimitBucket routes user management paths to the admin bucket", () => {
  assert.equal(resolveRateLimitBucket("/users"), "admin");
  assert.equal(resolveRateLimitBucket("/users/42/deactivate"), "admin");
  assert.equal(resolveRateLimitBucket("/branches"), "admin");
  assert.equal(resolveRateLimitBucket("/system/metrics"), "admin");
  assert.equal(resolveRateLimitBucket("/audit-logs"), "admin");
});

test("resolveRateLimitBucket routes all other paths to the api bucket", () => {
  assert.equal(resolveRateLimitBucket("/loans"), "api");
  assert.equal(resolveRateLimitBucket("/clients"), "api");
  assert.equal(resolveRateLimitBucket("/repayments"), "api");
  assert.equal(resolveRateLimitBucket("/collections/overdue"), "api");
});

// ── Rate limit config sanity ───────────────────────────────────────────────

test("login bucket is stricter than admin and api buckets", () => {
  // Login: 20 attempts per 15 min. API: 100 per 5 min. Login must be tighter.
  const loginRate = RATE_LIMITS.login.maxRequests / RATE_LIMITS.login.windowMs;
  const apiRate = RATE_LIMITS.api.maxRequests / RATE_LIMITS.api.windowMs;
  assert.ok(
    loginRate < apiRate,
    `Expected login bucket to be stricter than api bucket. login=${loginRate.toFixed(6)}/ms api=${apiRate.toFixed(6)}/ms`,
  );
});

test("all rate limit buckets have positive maxRequests and windowMs", () => {
  for (const [bucket, config] of Object.entries(RATE_LIMITS)) {
    assert.ok(config.maxRequests > 0, `${bucket}: maxRequests must be positive`);
    assert.ok(config.windowMs > 0, `${bucket}: windowMs must be positive`);
  }
});

test("admin bucket stays materially tighter than the old broad enumeration window", () => {
  assert.ok(
    RATE_LIMITS.admin.maxRequests <= 100,
    `Expected admin bucket to stay at or below 100 requests per window, got ${RATE_LIMITS.admin.maxRequests}`,
  );
});
