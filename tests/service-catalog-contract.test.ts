import assert from "node:assert/strict";
import path from "node:path";
import { existsSync } from "node:fs";
import test from "node:test";
import { createBootstrapContext } from "../src/config/bootstrap.js";
import { getBackendServiceCatalog, getBackendServiceCategories } from "../src/config/serviceCatalog.js";
import { api, loginAsAdmin, startServer } from "./integration-helpers.js";

const internalDependencyAllowList = new Set(getBackendServiceCatalog().map((entry) => entry.name));
const externalDependencyAllowList = new Set([
  "prisma",
  "db",
  "redis",
  "ioredis",
  "jwt",
  "message-queue",
  "console",
  "request-context",
  "metrics-system",
  "http-client",
  "roles-config",
  "email-or-webhook",
  "s3",
  "fs",
  "decimal.js",
  "pdfkit-like-runtime",
  "xlsx-library-runtime",
]);

test("service catalog entries are unique, categorized, and point to existing files", () => {
  const services = getBackendServiceCatalog();
  const categories = new Set(getBackendServiceCategories().map((entry) => entry.id));
  const seenNames = new Set<string>();

  assert.ok(services.length > 0);

  for (const service of services) {
    assert.equal(seenNames.has(service.name), false, `Duplicate service catalog entry: ${service.name}`);
    seenNames.add(service.name);

    assert.equal(categories.has(service.categoryId), true, `Unknown category for ${service.name}`);
    assert.ok(service.purpose.trim().length > 0, `Missing purpose for ${service.name}`);

    const absolutePath = path.join(process.cwd(), service.filePath);
    assert.equal(existsSync(absolutePath), true, `Missing service file: ${service.filePath}`);

    for (const dependency of service.dependencies) {
      const isKnownInternal = internalDependencyAllowList.has(dependency);
      const isAllowedExternal = externalDependencyAllowList.has(dependency);
      assert.equal(
        isKnownInternal || isAllowedExternal,
        true,
        `Unknown dependency '${dependency}' declared for ${service.name}`,
      );
    }
  }
});

test("system service catalog endpoint returns grouped backend service metadata", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const response = await api(baseUrl, "/api/system/service-catalog", {
      token: adminToken,
    });

    assert.equal(response.status, 200);
    assert.equal(Number(response.data?.summary?.totalServices || 0) >= 10, true);
    assert.equal(Array.isArray(response.data?.categories), true);
    assert.equal(Array.isArray(response.data?.services), true);
    assert.equal(
      response.data.services.some((entry: Record<string, unknown>) => String(entry.name || "") === "loanLifecycleService"),
      true,
    );
  } finally {
    await stop();
  }
});

test("bootstrap exposes a shared loan service registry", async () => {
  const bootstrap = await createBootstrapContext();

  assert.ok(bootstrap.services.serviceRegistry);
  assert.equal(bootstrap.routeDepsBase.serviceRegistry, bootstrap.services.serviceRegistry);
  assert.equal(typeof bootstrap.routeDepsBase.serviceRegistry.loan.loanService.createLoan, "function");
  assert.equal(typeof bootstrap.routeDepsBase.serviceRegistry.loan.loanLifecycleService.approveLoan, "function");
  assert.equal(typeof bootstrap.routeDepsBase.serviceRegistry.loan.loanProductCatalogService.resolveLoanProduct, "function");
  assert.equal(typeof bootstrap.routeDepsBase.serviceRegistry.report.reportQueryService.getPortfolioReport, "function");
  assert.equal(typeof bootstrap.routeDepsBase.serviceRegistry.report.accountingBatchService.runBatch, "function");
  assert.equal(typeof bootstrap.routeDepsBase.serviceRegistry.report.fxRateService.listRates, "function");
});