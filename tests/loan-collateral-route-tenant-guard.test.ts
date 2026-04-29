import assert from "node:assert/strict";
import test from "node:test";
import { registerLoanCollateralRoutes } from "../src/routes/services/loanCollateralRouteService.js";

type RouteHandler = (req: any, res: any, next: (error?: unknown) => void) => Promise<void> | void;

function buildRouteHarness(all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>) {
  const routes = new Map<string, RouteHandler>();
  const app = {
    get: (path: string, ...handlers: RouteHandler[]) => {
      routes.set(`GET ${path}`, handlers[handlers.length - 1]);
    },
    post: (_path: string, ..._handlers: RouteHandler[]) => undefined,
    patch: (_path: string, ..._handlers: RouteHandler[]) => undefined,
    delete: (_path: string, ..._handlers: RouteHandler[]) => undefined,
  };

  registerLoanCollateralRoutes({
    app: app as any,
    authenticate: () => undefined,
    authorize: () => () => undefined,
    parseId: (value: unknown) => {
      const parsed = Number(value);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    },
    createGuarantorSchema: { parse: (value: unknown) => value },
    createCollateralAssetSchema: { parse: (value: unknown) => value },
    updateCollateralAssetSchema: { parse: (value: unknown) => value },
    linkLoanGuarantorSchema: { parse: (value: unknown) => value },
    linkLoanCollateralSchema: { parse: (value: unknown) => value },
    resolveRiskRecordBranchId: async () => 1,
    resolveLoanInScope: async () => ({ scope: {}, loan: { id: 42, branch_id: 1 } }),
    hierarchyService: {} as any,
    get: async () => null,
    all,
    run: async () => ({}),
    writeAuditLog: async () => undefined,
    collateralManageRoles: ["admin"],
    collateralViewRoles: ["admin"],
    loanUnderwritingService: {
      refreshLoanAssessment: async () => null,
    },
  });

  return {
    getHandler(path: string) {
      const handler = routes.get(`GET ${path}`);
      assert.ok(handler, `Expected GET ${path} to be registered`);
      return handler;
    },
  };
}

function createRequest(id: number) {
  return {
    params: { id: String(id) },
    query: {},
    user: {
      sub: 1,
      email: "admin@example.com",
      role: "admin",
      fullName: "Admin User",
      tokenVersion: 1,
      branchId: 1,
      primaryRegionId: null,
    },
  };
}

function createResponse() {
  return {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

test("GET /api/loans/:id/guarantors fails closed when loan_guarantors lacks tenant_id", async () => {
  const harness = buildRouteHarness(async (sql) => {
    if (sql.includes("PRAGMA table_info(loan_guarantors)")) {
      return [{ name: "id" }, { name: "loan_id" }, { name: "guarantor_id" }];
    }
    throw new Error(`Unexpected query: ${sql}`);
  });

  const handler = harness.getHandler("/api/loans/:id/guarantors");
  const req = createRequest(42);
  const res = createResponse();
  let forwardedError: any = null;

  await handler(req, res, (error?: unknown) => {
    forwardedError = error;
  });

  assert.equal(res.statusCode, 200);
  assert.ok(forwardedError);
  assert.equal(forwardedError.status, 503);
  assert.match(String(forwardedError.message), /loan_guarantors\.tenant_id/i);
});

test("GET /api/loans/:id/collaterals fails closed when loan_collaterals lacks tenant_id", async () => {
  const harness = buildRouteHarness(async (sql) => {
    if (sql.includes("PRAGMA table_info(loan_collaterals)")) {
      return [{ name: "id" }, { name: "loan_id" }, { name: "collateral_asset_id" }];
    }
    throw new Error(`Unexpected query: ${sql}`);
  });

  const handler = harness.getHandler("/api/loans/:id/collaterals");
  const req = createRequest(42);
  const res = createResponse();
  let forwardedError: any = null;

  await handler(req, res, (error?: unknown) => {
    forwardedError = error;
  });

  assert.equal(res.statusCode, 200);
  assert.ok(forwardedError);
  assert.equal(forwardedError.status, 503);
  assert.match(String(forwardedError.message), /loan_collaterals\.tenant_id/i);
});
