import assert from "node:assert/strict";
import test from "node:test";
import { createClientOnboardingService } from "../src/services/client/clientOnboardingService.js";
import { createClientPortfolioService } from "../src/services/client/clientPortfolioService.js";
import { createClientRouteService } from "../src/routes/services/clientRouteService.js";
import { createLoanService } from "../src/services/loanService.js";
import { runWithTenant } from "../src/utils/tenantStore.js";

type SqlCall = {
  sql: string;
  params: unknown[];
};

function compactSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    sub: 1,
    email: "admin@example.com",
    role: "admin",
    fullName: "Admin User",
    tokenVersion: 1,
    branchId: 9,
    primaryRegionId: null,
    permissions: [],
    ...overrides,
  };
}

function createHierarchyService() {
  return {
    resolveHierarchyScope: async () => ({ level: "all", branchId: null }),
    getBranches: async () => [{ id: 9 }],
    getBranchById: async (branchId: number) => ({ id: branchId, is_active: 1 }),
    isBranchInScope: () => true,
  };
}

function createClientOnboardingServiceForTests(overrides: {
  get?: (sql: string, params?: unknown[]) => Promise<Record<string, unknown> | null | undefined>;
  run?: (sql: string, params?: unknown[]) => Promise<{ lastID?: number; changes?: number }>;
  executeTransaction?: (callback: (tx: { get: (sql: string, params?: unknown[]) => Promise<Record<string, unknown> | null | undefined>; run: (sql: string, params?: unknown[]) => Promise<{ lastID?: number; changes?: number }> }) => Promise<unknown>) => Promise<unknown>;
  loadClientDetail?: (clientId: number) => Promise<Record<string, unknown> | null | undefined>;
} = {}) {
  const get = overrides.get ?? (async () => null);
  const run = overrides.run ?? (async () => ({ changes: 1 }));
  const executeTransaction = overrides.executeTransaction
    ?? (async (callback) => callback({
      get: async () => null,
      run: async () => ({ lastID: 22, changes: 1 }),
    }));
  const loadClientDetail = overrides.loadClientDetail ?? (async (clientId: number) => ({ id: clientId }));

  return createClientOnboardingService({
    get,
    all: async () => [],
    run,
    executeTransaction,
    hierarchyService: createHierarchyService() as any,
    clientRepository: {} as any,
    writeAuditLog: async () => {},
    invalidateReportCaches: async () => {},
    resolveClientScopeClient: async () => ({ status: 200, client: { branch_id: 9 } }),
    loadClientDetail,
    refreshLinkedLoanAssessmentsForGuarantor: async () => {},
    refreshLinkedLoanAssessmentsForCollateral: async () => {},
    hasOwn: (payload, key) => Object.prototype.hasOwnProperty.call(payload ?? {}, key),
  });
}

test("client onboarding createClient scopes duplicate and officer lookups to the current tenant", async () => {
  const getCalls: SqlCall[] = [];
  const txGetCalls: SqlCall[] = [];

  const service = createClientOnboardingServiceForTests({
    get: async (sql, params = []) => {
      getCalls.push({ sql, params });
      const normalized = compactSql(sql);
      if (normalized.includes("FROM users")) {
        return { id: 7, role: "loan_officer", is_active: 1, branch_id: 9 };
      }
      return null;
    },
    executeTransaction: async (callback) => callback({
      get: async (sql, params = []) => {
        txGetCalls.push({ sql, params });
        return null;
      },
      run: async () => ({ lastID: 22, changes: 1 }),
    }),
    loadClientDetail: async () => ({ id: 22, full_name: "Tenant Scoped Client" }),
  });

  const result = await runWithTenant("tenant-acme", () => service.createClient({
    fullName: "Tenant Scoped Client",
    nationalId: "12345678",
    branchId: 9,
    officerId: 7,
  }, makeUser(), "127.0.0.1"));

  assert.equal(result.status, 201);

  const duplicateLookup = getCalls.find((call) => compactSql(call.sql).includes("FROM clients") && compactSql(call.sql).includes("tenant_id = ?"));
  assert.ok(duplicateLookup);
  assert.deepEqual(duplicateLookup.params, ["tenant-acme", "12345678"]);

  const officerLookup = getCalls.find((call) => compactSql(call.sql).includes("FROM users"));
  assert.ok(officerLookup);
  assert.deepEqual(officerLookup.params, [7, "tenant-acme"]);

  assert.equal(txGetCalls.length, 1);
  assert.deepEqual(txGetCalls[0]?.params, ["tenant-acme", "12345678"]);
});

test("client onboarding guarantor and collateral writes persist tenant_id", async () => {
  const getCalls: SqlCall[] = [];
  const runCalls: SqlCall[] = [];
  let guarantorReadBack = false;
  let collateralReadBack = false;

  const service = createClientOnboardingServiceForTests({
    get: async (sql, params = []) => {
      getCalls.push({ sql, params });
      const normalized = compactSql(sql);

      if (normalized.includes("SELECT * FROM guarantors WHERE id = ? AND tenant_id = ?")) {
        guarantorReadBack = true;
        return { id: 77 };
      }
      if (normalized.includes("SELECT * FROM collateral_assets WHERE id = ? AND tenant_id = ?")) {
        collateralReadBack = true;
        return { id: 88 };
      }
      if (normalized.includes("FROM clients") && normalized.includes("fee_payment_status")) {
        return {
          id: 5,
          kyc_status: "verified",
          onboarding_status: "registered",
          fee_payment_status: "paid",
        };
      }
      if (normalized.includes("COUNT(*) AS total")) {
        if (normalized.includes("FROM guarantors")) return { total: guarantorReadBack ? 1 : 0 };
        if (normalized.includes("FROM collateral_assets")) return { total: collateralReadBack ? 1 : 0 };
      }
      return null;
    },
    run: async (sql, params = []) => {
      runCalls.push({ sql, params });
      if (compactSql(sql).includes("INSERT INTO guarantors")) return { lastID: 77, changes: 1 };
      if (compactSql(sql).includes("INSERT INTO collateral_assets")) return { lastID: 88, changes: 1 };
      return { changes: 1 };
    },
  });

  await runWithTenant("tenant-bravo", async () => {
    const guarantorResult = await service.addClientGuarantor(5, {
      fullName: "Tenant Guarantor",
      nationalId: "G-1234",
      guaranteeAmount: 1500,
    }, makeUser(), "127.0.0.1");
    assert.equal(guarantorResult.status, 201);

    const collateralResult = await service.addClientCollateral(5, {
      assetType: "vehicle",
      description: "Tenant car",
      estimatedValue: 250000,
      registrationNumber: "KDA123A",
    }, makeUser(), "127.0.0.1");
    assert.equal(collateralResult.status, 201);
  });

  const guarantorLookup = getCalls.find((call) => compactSql(call.sql).includes("FROM guarantors") && compactSql(call.sql).includes("LOWER(TRIM(COALESCE(national_id"));
  assert.ok(guarantorLookup);
  assert.deepEqual(guarantorLookup.params, ["tenant-bravo", "G-1234"]);

  const guarantorInsert = runCalls.find((call) => compactSql(call.sql).includes("INSERT INTO guarantors"));
  assert.ok(guarantorInsert);
  assert.equal(guarantorInsert.params[0], "tenant-bravo");

  const collateralLookup = getCalls.find((call) => compactSql(call.sql).includes("FROM collateral_assets") && compactSql(call.sql).includes("registration_number"));
  assert.ok(collateralLookup);
  assert.deepEqual(collateralLookup.params, ["tenant-bravo", "KDA123A"]);

  const collateralInsert = runCalls.find((call) => compactSql(call.sql).includes("INSERT INTO collateral_assets"));
  assert.ok(collateralInsert);
  assert.equal(collateralInsert.params[0], "tenant-bravo");
});

test("client portfolio service scopes officer reads and portfolio updates by tenant", async () => {
  const getCalls: SqlCall[] = [];
  const runCalls: SqlCall[] = [];
  const allCalls: SqlCall[] = [];

  const service = createClientPortfolioService({
    get: async (sql, params = []) => {
      getCalls.push({ sql, params });
      const normalized = compactSql(sql);
      if (normalized.includes("FROM users WHERE id = ? AND tenant_id = ?")) {
        const officerId = Number(params[0]);
        return { id: officerId, full_name: `Officer ${officerId}`, role: "loan_officer", is_active: 1, branch_id: 9 };
      }
      if (normalized.includes("COUNT(*) AS total FROM clients")) {
        return { total: 3 };
      }
      return null;
    },
    all: async (sql, params = []) => {
      allCalls.push({ sql, params });
      return [{
        id: 7,
        full_name: "Officer Seven",
        branch_id: 9,
        branch_name: "Main",
        region_name: "Central",
        assigned_portfolio_count: 4,
      }];
    },
    run: async (sql, params = []) => {
      runCalls.push({ sql, params });
      return { changes: 3 };
    },
    hierarchyService: createHierarchyService() as any,
    writeAuditLog: async () => {},
    invalidateReportCaches: async () => {},
    resolveClientScopeClient: async () => ({ status: 200, client: { id: 5 } }),
    canAccessClientByOwnership: () => true,
  });

  await runWithTenant("tenant-portfolio", async () => {
    const officersResult = await service.listAssignableOfficers(makeUser());
    assert.equal(officersResult.status, 200);

    const reallocateResult = await service.reallocatePortfolio({
      fromOfficerId: 7,
      toOfficerId: 8,
      note: "Tenant-safe move",
    }, makeUser(), "127.0.0.1");
    assert.equal(reallocateResult.status, 200);
  });

  assert.equal(allCalls.length, 1);
  assert.equal(allCalls[0]?.params[0], "tenant-portfolio");
  assert.match(compactSql(allCalls[0]?.sql || ""), /u\.tenant_id = \?/);
  assert.match(compactSql(allCalls[0]?.sql || ""), /c\.tenant_id = u\.tenant_id/);

  const userLookups = getCalls.filter((call) => compactSql(call.sql).includes("FROM users WHERE id = ? AND tenant_id = ?"));
  assert.equal(userLookups.length, 2);
  assert.deepEqual(userLookups[0]?.params, [7, "tenant-portfolio"]);
  assert.deepEqual(userLookups[1]?.params, [8, "tenant-portfolio"]);

  const portfolioUpdate = runCalls.find((call) => compactSql(call.sql).includes("UPDATE clients SET officer_id = ?, updated_at = ?"));
  assert.ok(portfolioUpdate);
  assert.equal(portfolioUpdate.params[4], "tenant-portfolio");
});

test("client route service scopes guarantor and collateral reads by tenant", async () => {
  const getCalls: SqlCall[] = [];
  const allCalls: SqlCall[] = [];

  const service = createClientRouteService({
    get: async (sql, params = []) => {
      getCalls.push({ sql, params });
      if (compactSql(sql).includes("FROM clients c")) {
        return {
          id: 5,
          branch_id: 9,
          officer_id: null,
          created_by_user_id: 1,
        };
      }
      return null;
    },
    all: async (sql, params = []) => {
      allCalls.push({ sql, params });
      return [];
    },
    run: async () => ({ changes: 1 }),
    executeTransaction: async (callback) => callback({
      get: async () => null,
      all: async () => [],
      run: async () => ({ changes: 1 }),
    }),
    writeAuditLog: async () => {},
    hierarchyService: createHierarchyService() as any,
    reportCache: null,
    serviceRegistry: {
      client: {
        clientRepository: {},
      },
    },
  } as any);

  await runWithTenant("tenant-route", async () => {
    const guarantorsResult = await service.getClientGuarantors(5, makeUser());
    const collateralsResult = await service.getClientCollaterals(5, makeUser());
    assert.equal(guarantorsResult.status, 200);
    assert.equal(collateralsResult.status, 200);
  });

  const guarantorRead = allCalls.find((call) => compactSql(call.sql).includes("FROM guarantors"));
  assert.ok(guarantorRead);
  assert.deepEqual(guarantorRead.params, [5, "tenant-route"]);

  const collateralRead = allCalls.find((call) => compactSql(call.sql).includes("FROM collateral_assets"));
  assert.ok(collateralRead);
  assert.deepEqual(collateralRead.params, [5, "tenant-route"]);

  const scopedClientRead = getCalls.find((call) => compactSql(call.sql).includes("FROM clients c"));
  assert.ok(scopedClientRead);
  assert.deepEqual(scopedClientRead.params, [5, "tenant-route"]);
});

test("loan creation scopes onboarding snapshot and selected officer lookups by tenant", async () => {
  const getCalls: SqlCall[] = [];

  const service = createLoanService({
    get: async (sql, params = []) => {
      getCalls.push({ sql, params });
      const normalized = compactSql(sql);

      if (normalized.includes("FROM clients WHERE id = ? AND tenant_id = ?") && normalized.includes("created_by_user_id")) {
        return {
          id: 5,
          branch_id: 9,
          is_active: 1,
          officer_id: null,
          created_by_user_id: 1,
          fee_payment_status: "paid",
        };
      }
      if (normalized.includes("FROM clients") && normalized.includes("onboarding_status")) {
        return {
          id: 5,
          onboarding_status: "complete",
          fee_payment_status: "paid",
          fees_paid_at: null,
          kyc_status: "verified",
        };
      }
      if (normalized.includes("FROM guarantors")) {
        return { total: 1 };
      }
      if (normalized.includes("FROM collateral_assets")) {
        return { total: 1 };
      }
      if (normalized.includes("SELECT id, role, is_active, branch_id FROM users")) {
        return null;
      }
      return null;
    },
    all: async () => [],
    run: async () => ({ changes: 1 }),
    executeTransaction: async () => {
      throw new Error("should not reach transaction");
    },
    hierarchyService: createHierarchyService() as any,
    calculateExpectedTotal: () => 0,
    resolveLoanProduct: async () => ({
      min_term_weeks: 1,
      max_term_weeks: 52,
      min_principal: 1,
      max_principal: 50000,
    }),
    writeAuditLog: async () => {},
    invalidateReportCaches: async () => {},
    allowConcurrentLoans: false,
  });

  await assert.rejects(
    runWithTenant("tenant-loan", () => service.createLoan({
      payload: {
        clientId: 5,
        principal: 1000,
        termWeeks: 12,
        officerId: 8,
      },
      user: makeUser(),
      ipAddress: "127.0.0.1",
    })),
    /Selected loan officer was not found/,
  );

  const onboardingClientLookup = getCalls.find((call) => compactSql(call.sql).includes("FROM clients") && compactSql(call.sql).includes("onboarding_status"));
  assert.ok(onboardingClientLookup);
  assert.deepEqual(onboardingClientLookup.params, [5, "tenant-loan"]);

  const onboardingGuarantorCount = getCalls.find((call) => compactSql(call.sql).includes("FROM guarantors") && compactSql(call.sql).includes("tenant_id = ?"));
  assert.ok(onboardingGuarantorCount);
  assert.deepEqual(onboardingGuarantorCount.params, [5, "tenant-loan"]);

  const onboardingCollateralCount = getCalls.find((call) => compactSql(call.sql).includes("FROM collateral_assets") && compactSql(call.sql).includes("tenant_id = ?"));
  assert.ok(onboardingCollateralCount);
  assert.deepEqual(onboardingCollateralCount.params, [5, "tenant-loan"]);

  const officerLookup = getCalls.find((call) => compactSql(call.sql).includes("SELECT id, role, is_active, branch_id FROM users"));
  assert.ok(officerLookup);
  assert.deepEqual(officerLookup.params, [8, "tenant-loan"]);
});
