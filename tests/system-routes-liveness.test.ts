import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import { registerSystemRoutes } from "../src/routes/systemRoutes.js";

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: {
      Connection: "close",
    },
  });
  const data = await response.json();
  return { response, data };
}

async function startSystemRoutesTestApp(getRuntimeStatus: () => Promise<Record<string, any>> | Record<string, any>) {
  const app = express();

  registerSystemRoutes(app, {
    all: async () => [],
    get: async () => ({}),
    authenticate: (_req: any, _res: any, next: () => void) => next(),
    authorize: () => (_req: any, _res: any, next: () => void) => next(),
    getConfigStatus: () => ({}),
    getRuntimeStatus,
    metrics: {
      getSnapshot: () => ({ http: { requestsTotal: 0 } }),
    },
    hierarchyService: {
      resolveHierarchyScope: async () => ({}),
      buildScopeCondition: () => ({ sql: "1=1", params: [] }),
    },
  });

  const server = await new Promise<Server>((resolve, reject) => {
    const listeningServer = app.listen(0, "127.0.0.1", () => {
      resolve(listeningServer);
    });
    listeningServer.once("error", reject);
  });

  const address = server.address();
  if (!address || typeof address !== "object") {
    throw new Error("Failed to resolve test server address");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    stop: async () => new Promise<void>((resolve) => {
      server.closeIdleConnections?.();
      server.closeAllConnections?.();
      server.close(() => {
        setTimeout(resolve, 25);
      });
    }),
  };
}

test("public health endpoint acts as liveness while readiness reflects degraded dependencies", async () => {
  const runtimeStatus = {
    status: "degraded",
    checks: {
      database: {
        ok: true,
      },
      redis: {
        ok: false,
        durationMs: 14,
        checkedAt: "2026-03-20T12:00:00.000Z",
        error: "ECONNREFUSED",
      },
    },
  };
  const { baseUrl, stop } = await startSystemRoutesTestApp(async () => runtimeStatus);

  try {
    const { response: livenessResponse, data: liveness } = await fetchJson(`${baseUrl}/health`);
    assert.equal(livenessResponse.status, 200);
    assert.equal(liveness.status, "ok");
    assert.equal(liveness.readiness, "degraded");
    assert.equal(liveness.checks.redis.ok, false);

    const { response: readinessResponse, data: readiness } = await fetchJson(`${baseUrl}/ready`);
    assert.equal(readinessResponse.status, 503);
    assert.equal(readiness.status, "not_ready");
    assert.equal(readiness.checks.redis.ok, false);

    const { response: detailsResponse, data: details } = await fetchJson(`${baseUrl}/health/details`);
    assert.equal(detailsResponse.status, 200);
    assert.equal(details.status, "degraded");
    assert.equal(details.checks.redis.ok, false);
  } finally {
    await stop();
  }
});
