import test from "node:test";
import assert from "node:assert/strict";
import { startServer, api, loginAsAdmin } from "./integration-helpers.js";
test("branch and hierarchy management flows are covered end-to-end", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const hierarchyTree = await api(baseUrl, "/api/hierarchy/tree", {
      token: adminToken,
    });
    assert.equal(hierarchyTree.status, 200);
    assert.ok(Array.isArray(hierarchyTree.data.regions));
    assert.ok(hierarchyTree.data.regions.length > 0);
    const regionId = Number(hierarchyTree.data.regions[0].id);

    const uniqueCodeSuffix = Date.now().toString(36).toUpperCase().slice(-6);
    const createBranch = await api(baseUrl, "/api/branches", {
      method: "POST",
      token: adminToken,
      body: {
        name: `Hierarchy Coverage Branch ${uniqueCodeSuffix}`,
        locationAddress: "77 Coverage Road",
        county: "Nairobi",
        town: "Nairobi",
        regionId,
        branchCode: `HC-${uniqueCodeSuffix}`,
      },
    });
    assert.equal(createBranch.status, 201);
    const branchId = Number(createBranch.data.id);

    const branchDetail = await api(baseUrl, `/api/branches/${branchId}`, {
      token: adminToken,
    });
    assert.equal(branchDetail.status, 200);
    assert.equal(Number(branchDetail.data.id), branchId);
    assert.ok(branchDetail.data.stats);
    assert.equal(typeof branchDetail.data.stats.total_loans, "number");
    assert.equal(typeof branchDetail.data.stats.overdue_installments, "number");

    const updateBranch = await api(baseUrl, `/api/branches/${branchId}`, {
      method: "PATCH",
      token: adminToken,
      body: {
        town: "Westlands",
        contactPhone: "+254700002201",
      },
    });
    assert.equal(updateBranch.status, 200);
    assert.equal(updateBranch.data.branch.town, "Westlands");

    const deactivateBranch = await api(baseUrl, `/api/branches/${branchId}`, {
      method: "DELETE",
      token: adminToken,
    });
    assert.equal(deactivateBranch.status, 200);

    const branchAfterDeactivate = await api(baseUrl, `/api/branches/${branchId}`, {
      token: adminToken,
    });
    assert.equal(branchAfterDeactivate.status, 200);
    assert.equal(Number(branchAfterDeactivate.data.is_active), 0);

    const hierarchyEvents = await api(baseUrl, "/api/hierarchy/events?sinceId=0&limit=200", {
      token: adminToken,
    });
    assert.equal(hierarchyEvents.status, 200);
    assert.ok(
      hierarchyEvents.data.data.some((event) => Number(event.branch_id) === branchId),
      "Expected hierarchy event stream to include branch changes",
    );
  } finally {
    await stop();
  }
});

test("role enforcement across management routes remains explicit", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const branches = await api(baseUrl, "/api/branches?limit=200&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    const branchId = Number(branches.data.data[0].id);

    const createItUser = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Hierarchy IT User",
        email: "hierarchy.it.user@example.com",
        password: "Password@123",
        role: "it",
      },
    });
    assert.equal(createItUser.status, 201);

    const createOpsManager = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Hierarchy Ops Manager",
        email: "hierarchy.ops.manager@example.com",
        password: "Password@123",
        role: "operations_manager",
        branchId,
      },
    });
    assert.equal(createOpsManager.status, 201);

    const itLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "hierarchy.it.user@example.com",
        password: "Password@123",
      },
    });
    assert.equal(itLogin.status, 200);
    const itToken = itLogin.data.token;

    const opsLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "hierarchy.ops.manager@example.com",
        password: "Password@123",
      },
    });
    assert.equal(opsLogin.status, 200);
    const opsToken = opsLogin.data.token;

    const itHierarchyTree = await api(baseUrl, "/api/hierarchy/tree", {
      token: itToken,
    });
    assert.equal(itHierarchyTree.status, 403);

    const itHierarchyPerformance = await api(baseUrl, "/api/reports/hierarchy/performance", {
      token: itToken,
    });
    assert.equal(itHierarchyPerformance.status, 403);

    const opsUsersList = await api(baseUrl, "/api/users", {
      token: opsToken,
    });
    assert.equal(opsUsersList.status, 403);

    const opsBranchList = await api(baseUrl, "/api/branches", {
      token: opsToken,
    });
    assert.equal(opsBranchList.status, 200);
  } finally {
    await stop();
  }
});

test("branch patch governance blocks unsafe deactivation and cross-region assignment drift", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const hierarchyTree = await api(baseUrl, "/api/hierarchy/tree", {
      token: adminToken,
    });
    assert.equal(hierarchyTree.status, 200);
    const defaultRegionId = Number(hierarchyTree.data.regions[0]?.id || 0);
    assert.ok(defaultRegionId > 0);

    const uniqueCodeSuffix = Date.now().toString(36).toUpperCase().slice(-6);
    const createBranch = await api(baseUrl, "/api/branches", {
      method: "POST",
      token: adminToken,
      body: {
        name: `Patch Governance Branch ${uniqueCodeSuffix}`,
        locationAddress: "91 Governance Avenue",
        county: "Nairobi",
        town: "Nairobi",
        regionId: defaultRegionId,
        branchCode: `PG-${uniqueCodeSuffix}`,
      },
    });
    assert.equal(createBranch.status, 201);
    const guardedBranchId = Number(createBranch.data.id);
    assert.ok(guardedBranchId > 0);

    const createOfficer = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Branch Guard Officer",
        email: `branch.guard.officer.${Date.now()}@example.com`,
        password: "Password@123",
        role: "loan_officer",
        branchId: guardedBranchId,
      },
    });
    assert.equal(createOfficer.status, 201);
    const officerId = Number(createOfficer.data.id);
    assert.ok(officerId > 0);

    const patchDeactivateDenied = await api(baseUrl, `/api/branches/${guardedBranchId}`, {
      method: "PATCH",
      token: adminToken,
      body: {
        isActive: false,
      },
    });
    assert.equal(patchDeactivateDenied.status, 409);

    const deactivateOfficer = await api(baseUrl, `/api/users/${officerId}/deactivate`, {
      method: "POST",
      token: adminToken,
      body: {},
    });
    assert.equal(deactivateOfficer.status, 200);

    const patchDeactivateAllowed = await api(baseUrl, `/api/branches/${guardedBranchId}`, {
      method: "PATCH",
      token: adminToken,
      body: {
        isActive: false,
      },
    });
    assert.equal(patchDeactivateAllowed.status, 200);
    assert.equal(Number(patchDeactivateAllowed.data.branch.is_active || 0), 0);

    const branches = await api(baseUrl, "/api/branches?isActive=true&limit=500&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    assert.ok(Array.isArray(branches.data.data));

    const activeBranches = branches.data.data;
    const sourceBranch = activeBranches.find((branch) => Number(branch.region_id || 0) > 0);
    assert.ok(sourceBranch, "Expected at least one active branch");

    const siblingBranch = activeBranches.find(
      (branch) => Number(branch.id) !== Number(sourceBranch.id)
        && Number(branch.region_id) === Number(sourceBranch.region_id),
    );
    assert.ok(siblingBranch, "Expected at least two active branches in one region");

    const branchInDifferentRegion = activeBranches.find(
      (branch) => Number(branch.region_id) !== Number(sourceBranch.region_id),
    );
    assert.ok(branchInDifferentRegion, "Expected an active branch in a different region");

    const areaManagerEmail = `branch.guard.area.${Date.now()}@example.com`;
    const createAreaManager = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Branch Guard Area Manager",
        email: areaManagerEmail,
        password: "Password@123",
        role: "area_manager",
        branchIds: [Number(sourceBranch.id), Number(siblingBranch.id)],
        primaryRegionId: Number(sourceBranch.region_id),
      },
    });
    assert.equal(createAreaManager.status, 201);
    const areaManagerId = Number(createAreaManager.data.id);
    assert.ok(areaManagerId > 0);

    const patchRegionDenied = await api(baseUrl, `/api/branches/${Number(sourceBranch.id)}`, {
      method: "PATCH",
      token: adminToken,
      body: {
        regionId: Number(branchInDifferentRegion.region_id),
      },
    });
    assert.equal(patchRegionDenied.status, 409);
    assert.ok(
      Array.isArray(patchRegionDenied.data?.conflictingAreaManagerIds)
      && patchRegionDenied.data.conflictingAreaManagerIds.includes(areaManagerId),
    );
  } finally {
    await stop();
  }
});

test("IT system admin capability can create users for any role", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const itEmail = `system.admin.it.${Date.now()}@example.com`;
    const createItUser = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "System Admin IT",
        email: itEmail,
        password: "Password@123",
        role: "it",
      },
    });
    assert.equal(createItUser.status, 201);

    const itLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: itEmail,
        password: "Password@123",
      },
    });
    assert.equal(itLogin.status, 200);
    const itToken = itLogin.data.token;

    const createdByItEmail = `it.provisioned.admin.${Date.now()}@example.com`;
    const createAdminByIt = await api(baseUrl, "/api/users", {
      method: "POST",
      token: itToken,
      body: {
        fullName: "Provisioned Admin By IT",
        email: createdByItEmail,
        password: "Password@123",
        role: "admin",
      },
    });
    assert.equal(createAdminByIt.status, 201);
    assert.equal(String(createAdminByIt.data.role), "admin");
  } finally {
    await stop();
  }
});
