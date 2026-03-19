import test from "node:test";
import assert from "node:assert/strict";
import { startServer, api, loginAsAdmin } from "./integration-helpers.js";
test("health details expose database connectivity and background task state", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const health = await api(baseUrl, "/health/details");
    assert.equal(health.status, 200);
    assert.ok(health.data);
    assert.ok(health.data.checks && health.data.checks.database);
    assert.equal(typeof health.data.checks.database.ok, "boolean");
    assert.ok(health.data.backgroundTasks && health.data.backgroundTasks.overdueInstallmentSync);
    assert.equal(typeof health.data.backgroundTasks.overdueInstallmentSync.degraded, "boolean");
    assert.ok(health.data.metrics && health.data.metrics.http);
    assert.ok(health.data.metrics.reportCache);
    assert.ok(Number(health.data.metrics.http.requestsTotal || 0) >= 1);
  } finally {
    await stop();
  }
});

test("prometheus metrics endpoint is publicly available and exposes core counters", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/metrics`);
    assert.equal(response.status, 200);
    const payload = await response.text();
    assert.ok(payload.includes("microfinance_http_requests_total"));
    assert.ok(payload.includes("microfinance_errors_total"));
    assert.ok(payload.includes("microfinance_report_cache_hits_total"));
  } finally {
    await stop();
  }
});

test("system metrics endpoint is admin-protected and returns metrics snapshot", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const unauthenticated = await api(baseUrl, "/api/system/metrics");
    assert.equal(unauthenticated.status, 401);

    const adminToken = await loginAsAdmin(baseUrl);
    const metricsResponse = await api(baseUrl, "/api/system/metrics", {
      token: adminToken,
    });
    assert.equal(metricsResponse.status, 200);
    assert.ok(metricsResponse.data);
    assert.ok(metricsResponse.data.http);
    assert.ok(metricsResponse.data.errors);
    assert.ok(metricsResponse.data.backgroundTasks);
  } finally {
    await stop();
  }
});

test("metrics snapshot includes report cache hit/miss/invalidation counters", async () => {
  const { baseUrl, stop } = await startServer({
    envOverrides: {
      REPORT_CACHE_ENABLED: "true",
      REPORT_CACHE_TTL_MS: "600000",
    },
  });

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const firstPortfolio = await api(baseUrl, "/api/reports/portfolio", {
      token: adminToken,
    });
    assert.equal(firstPortfolio.status, 200);

    const secondPortfolio = await api(baseUrl, "/api/reports/portfolio", {
      token: adminToken,
    });
    assert.equal(secondPortfolio.status, 200);

    const branches = await api(baseUrl, "/api/branches?limit=1&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    const branchId = Number(branches.data?.data?.[0]?.id || 0);
    assert.ok(branchId > 0);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: `Cache Metrics Client ${Date.now()}`,
        phone: `+254700${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
        branchId,
      },
    });
    assert.equal(createClient.status, 201);

    const thirdPortfolio = await api(baseUrl, "/api/reports/portfolio", {
      token: adminToken,
    });
    assert.equal(thirdPortfolio.status, 200);

    const metricsResponse = await api(baseUrl, "/api/system/metrics", {
      token: adminToken,
    });
    assert.equal(metricsResponse.status, 200);
    assert.ok(metricsResponse.data?.reportCache);
    assert.ok(Number(metricsResponse.data.reportCache.getOrSetCalls || 0) >= 3);
    assert.ok(Number(metricsResponse.data.reportCache.hits || 0) >= 1);
    assert.ok(Number(metricsResponse.data.reportCache.misses || 0) >= 2);
    assert.ok(Number(metricsResponse.data.reportCache.writes || 0) >= 2);
    assert.ok(Number(metricsResponse.data.reportCache.invalidations || 0) >= 1);
    assert.ok(metricsResponse.data.reportCache.deltas);
    assert.ok(metricsResponse.data.reportCache.ratesPerMinute);
    assert.ok(metricsResponse.data.reportCache.ratios);
    assert.ok(metricsResponse.data.reportCache.alerts);
    assert.ok(typeof metricsResponse.data.reportCache.ratios.hitRatePercent === "number");
    assert.ok(typeof metricsResponse.data.reportCache.ratios.missRatePercent === "number");
    assert.ok(typeof metricsResponse.data.reportCache.ratios.writeOnMissPercent === "number");
    assert.ok(typeof metricsResponse.data.reportCache.ratesPerMinute.getOrSetCalls === "number");
    assert.ok(typeof metricsResponse.data.reportCache.deltas.getOrSetCalls === "number");
    assert.equal(typeof metricsResponse.data.reportCache.alerts.highMissRate, "boolean");
    assert.equal(typeof metricsResponse.data.reportCache.alerts.highErrorRate, "boolean");
    assert.equal(typeof metricsResponse.data.reportCache.alerts.lowCacheEfficiency, "boolean");
  } finally {
    await stop();
  }
});
