import assert from "node:assert/strict";
import test from "node:test";
import { api, startServer } from "./integration-helpers.js";

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

test("rbac contract matrix enforces sensitive route policies", async () => {
  const { baseUrl, stop } = await startServer();
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

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

    const branchesResult = await api(baseUrl, "/api/branches?limit=100&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branchesResult.status, 200);
    const branch = branchesResult.data.data?.[0];
    assert.ok(branch);
    const branchId = Number(branch.id);
    const regionId = Number(branch.region_id);

    const finance = await createUserAndLogin({
      baseUrl,
      adminToken,
      fullName: `RBAC Finance ${suffix}`,
      email: `rbac.finance.${suffix}@example.com`,
      role: "finance",
    });
    const areaManager = await createUserAndLogin({
      baseUrl,
      adminToken,
      fullName: `RBAC Area ${suffix}`,
      email: `rbac.area.${suffix}@example.com`,
      role: "area_manager",
      primaryRegionId: regionId,
      branchIds: [branchId],
    });
    const loanOfficer = await createUserAndLogin({
      baseUrl,
      adminToken,
      fullName: `RBAC Officer ${suffix}`,
      email: `rbac.officer.${suffix}@example.com`,
      role: "loan_officer",
      branchId,
    });
    const it = await createUserAndLogin({
      baseUrl,
      adminToken,
      fullName: `RBAC IT ${suffix}`,
      email: `rbac.it.${suffix}@example.com`,
      role: "it",
    });
    const ceo = await createUserAndLogin({
      baseUrl,
      adminToken,
      fullName: `RBAC CEO ${suffix}`,
      email: `rbac.ceo.${suffix}@example.com`,
      role: "ceo",
    });
    const operationsManager = await createUserAndLogin({
      baseUrl,
      adminToken,
      fullName: `RBAC Ops ${suffix}`,
      email: `rbac.ops.${suffix}@example.com`,
      role: "operations_manager",
      branchId,
    });

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: `RBAC Client ${suffix}`,
        phone: "+254700991122",
        branchId,
      },
    });
    assert.equal(createClient.status, 201);
    const clientId = Number(createClient.data.id);

    const createLoanOne = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId,
        principal: 1500,
        termWeeks: 12,
      },
    });
    assert.equal(createLoanOne.status, 201);
    const loanOneId = Number(createLoanOne.data.id);

    const officerApprove = await api(baseUrl, `/api/loans/${loanOneId}/approve`, {
      method: "POST",
      token: loanOfficer.token,
      body: { notes: "Officer should not approve" },
    });
    assert.equal(officerApprove.status, 403);

    const financeApprove = await api(baseUrl, `/api/loans/${loanOneId}/approve`, {
      method: "POST",
      token: finance.token,
      body: { notes: "Finance approval per policy" },
    });
    assert.equal(financeApprove.status, 200);

    const createLoanTwo = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId,
        principal: 1700,
        termWeeks: 10,
      },
    });
    assert.equal(createLoanTwo.status, 201);
    const loanTwoId = Number(createLoanTwo.data.id);

    const areaApprove = await api(baseUrl, `/api/loans/${loanTwoId}/approve`, {
      method: "POST",
      token: areaManager.token,
      body: { notes: "Area manager approval per policy" },
    });
    assert.equal(areaApprove.status, 200);

    const opsWriteOff = await api(baseUrl, `/api/loans/${loanTwoId}/write-off`, {
      method: "POST",
      token: operationsManager.token,
      body: { note: "Ops should not write off" },
    });
    assert.equal(opsWriteOff.status, 403);

    const itCreateCashier = await api(baseUrl, "/api/users", {
      method: "POST",
      token: it.token,
      body: {
        fullName: `RBAC Cashier ${suffix}`,
        email: `rbac.cashier.${suffix}@example.com`,
        password: "Password@123",
        role: "cashier",
      },
    });
    assert.equal(itCreateCashier.status, 201);
    const cashierId = Number(itCreateCashier.data.id);

    const itUpdateProfile = await api(baseUrl, `/api/users/${cashierId}/profile`, {
      method: "PATCH",
      token: it.token,
      body: {
        fullName: `RBAC Cashier Updated ${suffix}`,
      },
    });
    assert.equal(itUpdateProfile.status, 200);

    const itAllocateRole = await api(baseUrl, `/api/users/${cashierId}/role`, {
      method: "PATCH",
      token: it.token,
      body: {
        role: "operations_manager",
        branchId,
        primaryRegionId: null,
      },
    });
    assert.equal(itAllocateRole.status, 200);

    const ceoAuditTrail = await api(baseUrl, "/api/system/audit-trail?limit=10&offset=0", {
      token: ceo.token,
    });
    assert.equal(ceoAuditTrail.status, 200);

    const financeAuditTrail = await api(baseUrl, "/api/system/audit-trail?limit=10&offset=0", {
      token: finance.token,
    });
    assert.equal(financeAuditTrail.status, 403);
  } finally {
    await stop();
  }
});
