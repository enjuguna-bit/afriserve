import assert from "node:assert/strict";
import test from "node:test";
import { api, startServer } from "./integration-helpers.js";

function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function createUserAndLogin({
  baseUrl,
  adminToken,
  fullName,
  email,
  role,
  branchId,
  branchIds,
  primaryRegionId,
}: {
  baseUrl: string;
  adminToken: string;
  fullName: string;
  email: string;
  role: string;
  branchId?: number;
  branchIds?: number[];
  primaryRegionId?: number;
}) {
  const payload: Record<string, unknown> = {
    fullName,
    email,
    password: "Password@123",
    role,
  };

  if (Number.isInteger(branchId) && Number(branchId) > 0) {
    payload.branchId = branchId;
  }
  if (Array.isArray(branchIds) && branchIds.length > 0) {
    payload.branchIds = branchIds;
  }
  if (Number.isInteger(primaryRegionId) && Number(primaryRegionId) > 0) {
    payload.primaryRegionId = primaryRegionId;
  }

  const createUser = await api(baseUrl, "/api/users", {
    method: "POST",
    token: adminToken,
    body: payload,
  });
  assert.equal(createUser.status, 201);

  const login = await api(baseUrl, "/api/auth/login", {
    method: "POST",
    body: {
      email,
      password: "Password@123",
    },
  });
  assert.equal(login.status, 200);

  return {
    token: login.data.token,
    userId: Number(login.data.user.id),
  };
}

test("report filter options return role-scoped reports and selector modes", async () => {
  const { baseUrl, stop } = await startServer();
  const suffix = uniqueSuffix();

  try {
    const adminLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;

    const branchesResult = await api(baseUrl, "/api/branches?limit=500&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branchesResult.status, 200);
    const branches = branchesResult.data.data;
    assert.ok(Array.isArray(branches) && branches.length >= 2);

    const branchesByRegion = new Map<number, number[]>();
    for (const branch of branches) {
      const regionId = Number(branch.region_id);
      if (!branchesByRegion.has(regionId)) {
        branchesByRegion.set(regionId, []);
      }
      branchesByRegion.get(regionId)?.push(Number(branch.id));
    }

    const targetRegionEntry = [...branchesByRegion.entries()].find(([, branchIds]) => branchIds.length >= 2);
    assert.ok(targetRegionEntry, "Expected at least one region with two active branches");
    const targetRegionId = Number(targetRegionEntry[0]);
    const [branchAId, branchBId] = targetRegionEntry[1];

    const itUser = await createUserAndLogin({
      baseUrl,
      adminToken,
      fullName: `Report Filter IT ${suffix}`,
      email: `report.filter.it.${suffix}@example.com`,
      role: "it",
    });
    const areaManager = await createUserAndLogin({
      baseUrl,
      adminToken,
      fullName: `Report Filter Area ${suffix}`,
      email: `report.filter.area.${suffix}@example.com`,
      role: "area_manager",
      primaryRegionId: targetRegionId,
      branchIds: [branchAId, branchBId],
    });
    const branchManager = await createUserAndLogin({
      baseUrl,
      adminToken,
      fullName: `Report Filter Branch ${suffix}`,
      email: `report.filter.branch.${suffix}@example.com`,
      role: "operations_manager",
      branchId: branchAId,
    });
    const loanOfficer = await createUserAndLogin({
      baseUrl,
      adminToken,
      fullName: `Report Filter Officer ${suffix}`,
      email: `report.filter.officer.${suffix}@example.com`,
      role: "loan_officer",
      branchId: branchAId,
    });

    const itOptions = await api(baseUrl, "/api/reports/filter-options", {
      token: itUser.token,
    });
    assert.equal(itOptions.status, 200);
    assert.deepEqual(itOptions.data.levels, ["hq"]);
    assert.equal(itOptions.data.ui.levelLocked, true);
    assert.equal(itOptions.data.ui.officeLocked, true);
    assert.equal(itOptions.data.ui.agentLocked, true);
    assert.equal(itOptions.data.offices.length, 1);
    assert.equal(itOptions.data.offices[0].scopeType, "overall");
    assert.equal(itOptions.data.agents.length, 1);
    assert.equal(itOptions.data.agents[0].scopeType, "overall");
    const itReportIds = new Set((itOptions.data.reports || []).map((entry) => String(entry.id)));
    const itCategoryIds = new Set((itOptions.data.categories || []).map((entry) => String(entry.id)));
    assert.ok((itOptions.data.reports || []).every((entry) => String(entry.description || '').trim().length > 0));
    assert.ok(itReportIds.has("operations-olb"));
    assert.ok(itReportIds.has("executive-board-summary"));
    assert.ok(!itReportIds.has("operations-cumulative-officer"));
    assert.ok(!itReportIds.has("executive-officer-performance"));
    assert.ok(!itReportIds.has("finance-income-statement"));
    assert.ok(!itCategoryIds.has("finance"));

    const areaOptions = await api(baseUrl, "/api/reports/filter-options", {
      token: areaManager.token,
    });
    assert.equal(areaOptions.status, 200);
    assert.deepEqual(areaOptions.data.levels, ["region"]);
    assert.equal(areaOptions.data.ui.levelLocked, true);
    assert.equal(areaOptions.data.ui.officeLocked, false);
    assert.equal(areaOptions.data.ui.agentLocked, false);
    assert.equal(areaOptions.data.ui.officeLabel, "Area");
    assert.ok(Array.isArray(areaOptions.data.offices) && areaOptions.data.offices.length >= 1);
    assert.ok(areaOptions.data.offices.every((entry) => entry.scopeType === "region"));
    assert.ok(areaOptions.data.offices.every((entry) => Number(entry.regionId) === targetRegionId));
    const areaReportIds = new Set((areaOptions.data.reports || []).map((entry) => String(entry.id)));
    assert.ok(areaReportIds.has("finance-income-statement"));
    assert.ok(areaReportIds.has("executive-officer-performance"));

    const branchManagerOptions = await api(baseUrl, "/api/reports/filter-options", {
      token: branchManager.token,
    });
    assert.equal(branchManagerOptions.status, 200);
    assert.deepEqual(branchManagerOptions.data.levels, ["branch"]);
    assert.equal(branchManagerOptions.data.offices.length, 1);
    assert.equal(branchManagerOptions.data.offices[0].scopeType, "branch");
    assert.equal(Number(branchManagerOptions.data.offices[0].id), branchAId);
    const branchManagerReportIds = new Set((branchManagerOptions.data.reports || []).map((entry) => String(entry.id)));
    assert.ok(branchManagerReportIds.has("operations-cumulative-officer"));
    assert.ok(branchManagerReportIds.has("finance-income-statement"));

    const loanOfficerOptions = await api(baseUrl, "/api/reports/filter-options", {
      token: loanOfficer.token,
    });
    assert.equal(loanOfficerOptions.status, 200);
    assert.deepEqual(loanOfficerOptions.data.levels, ["branch"]);
    assert.equal(loanOfficerOptions.data.offices.length, 1);
    assert.equal(loanOfficerOptions.data.offices[0].scopeType, "branch");
    assert.equal(Number(loanOfficerOptions.data.offices[0].id), branchAId);
    const loanOfficerReportIds = new Set((loanOfficerOptions.data.reports || []).map((entry) => String(entry.id)));
    const loanOfficerCategoryIds = new Set((loanOfficerOptions.data.categories || []).map((entry) => String(entry.id)));
    assert.ok(loanOfficerReportIds.has("operations-olb"));
    assert.ok(!loanOfficerReportIds.has("operations-cumulative-officer"));
    assert.ok(!loanOfficerReportIds.has("finance-income-statement"));
    assert.ok(!loanOfficerCategoryIds.has("finance"));
  } finally {
    await stop();
  }
});

test("all catalogued reports are accessible through the shared report generator flow", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;

    const filterOptions = await api(baseUrl, "/api/reports/filter-options", {
      token: adminToken,
    });
    assert.equal(filterOptions.status, 200);

    const reports = Array.isArray(filterOptions.data?.reports) ? filterOptions.data.reports : [];
    assert.ok(reports.length > 0, "Expected report catalog entries for generator flow");

    for (const report of reports) {
      const endpoint = String(report.endpoint || "").trim();
      assert.ok(endpoint.startsWith("/api/reports/"), `Unexpected report endpoint: ${endpoint}`);

      const response = await fetch(
        `${baseUrl}${endpoint}?dateFrom=${encodeURIComponent("2026-03-01T00:00:00.000Z")}&dateTo=${encodeURIComponent("2026-03-07T23:59:59.999Z")}`,
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        },
      );

      assert.equal(
        response.status,
        200,
        `Expected report ${String(report.label || endpoint)} to be accessible from generator flow`,
      );
    }
  } finally {
    await stop();
  }
});

test("legacy-mapped generator reports expose expected Cemes-style titles", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(adminLogin.status, 200);

    const filterOptions = await api(baseUrl, "/api/reports/filter-options", {
      token: adminLogin.data.token,
    });
    assert.equal(filterOptions.status, 200);

    const reports = Array.isArray(filterOptions.data?.reports) ? filterOptions.data.reports : [];
    const labelsById = new Map(
      reports.map((report) => [String(report.id || "").trim(), String(report.label || "").trim()]),
    );

    assert.equal(labelsById.get("operations-loans-due"), "Loans Due Report");
    assert.equal(labelsById.get("collections-dues"), "Loans Due Report");
    assert.equal(labelsById.get("operations-disbursement"), "Disbursment Report");
    assert.equal(labelsById.get("operations-red-flag"), "Arrears Report");
    assert.equal(labelsById.get("risk-arrears"), "Arrears Report");
  } finally {
    await stop();
  }
});
