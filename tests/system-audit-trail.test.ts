import test from "node:test";
import assert from "node:assert/strict";
import { startServer, api, loginAsAdmin, approveLoan, createHighRiskReviewerToken } from "./integration-helpers.js";

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
}: {
  baseUrl: string;
  adminToken: string;
  fullName: string;
  email: string;
  role: string;
  branchId?: number;
}) {
  const createUserPayload: any = {
    fullName,
    email,
    password: "Password@123",
    role,
  };
  if (Number.isInteger(branchId) && branchId > 0) {
    createUserPayload.branchId = branchId;
  }

  const createUser = await api(baseUrl, "/api/users", {
    method: "POST",
    token: adminToken,
    body: createUserPayload,
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

test("system audit trail allows admin, ceo, and operations_manager with action/date/user filters", async () => {
  const { baseUrl, stop } = await startServer();
  const suffix = uniqueSuffix();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const adminLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(adminLogin.status, 200);
    const adminUserId = Number(adminLogin.data.user.id);

    const branches = await api(baseUrl, "/api/branches?limit=1&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    const branchId = Number(branches.data.data?.[0]?.id);
    assert.ok(Number.isInteger(branchId) && branchId > 0);

    const ceo = await createUserAndLogin({
      baseUrl,
      adminToken,
      fullName: `Audit Trail CEO ${suffix}`,
      email: `audit.trail.ceo.${suffix}@example.com`,
      role: "ceo",
    });
    const operationsManager = await createUserAndLogin({
      baseUrl,
      adminToken,
      fullName: `Audit Trail Ops ${suffix}`,
      email: `audit.trail.ops.${suffix}@example.com`,
      role: "operations_manager",
      branchId,
    });
    const finance = await createUserAndLogin({
      baseUrl,
      adminToken,
      fullName: `Audit Trail Finance ${suffix}`,
      email: `audit.trail.finance.${suffix}@example.com`,
      role: "finance",
    });

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: `Audit Trail Client ${suffix}`,
        phone: "+254700881122",
      },
    });
    assert.equal(createClient.status, 201);
    const clientId = Number(createClient.data.id);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId,
        principal: 3200,
        termWeeks: 12,
      },
    });
    assert.equal(createLoan.status, 201);

    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);
    const approve = await approveLoan(baseUrl, Number(createLoan.data.id), checkerToken, {
      notes: "Approve for audit trail test",
    });

    assert.equal(approve.status, 200);

    const dateFrom = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const dateTo = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    const query = `/api/system/audit-trail?action=loan.approved&userId=${adminUserId}&dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}&limit=20&offset=0`;

    const adminTrail = await api(baseUrl, query, { token: adminToken });
    assert.equal(adminTrail.status, 200);
    assert.ok(Array.isArray(adminTrail.data.data));
    assert.equal(Number(adminTrail.data?.paging?.total || 0) >= 1, true);
    assert.equal(
      adminTrail.data.data.some((row) => String(row.action) === "loan.approved" && Number(row.user_id) === adminUserId),
      true,
    );

    const ceoTrail = await api(baseUrl, query, { token: ceo.token });
    assert.equal(ceoTrail.status, 200);
    assert.equal(Array.isArray(ceoTrail.data.data), true);

    const operationsTrail = await api(baseUrl, query, { token: operationsManager.token });
    assert.equal(operationsTrail.status, 200);
    assert.equal(Array.isArray(operationsTrail.data.data), true);

    const financeTrail = await api(baseUrl, query, { token: finance.token });
    assert.equal(financeTrail.status, 403);
  } finally {
    await stop();
  }
});

test("system audit trail validates invalid filters and date range", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const invalidUserId = await api(baseUrl, "/api/system/audit-trail?userId=abc", {
      token: adminToken,
    });
    assert.equal(invalidUserId.status, 400);

    const dateFrom = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const dateTo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const invalidDateRange = await api(
      baseUrl,
      `/api/system/audit-trail?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`,
      { token: adminToken },
    );
    assert.equal(invalidDateRange.status, 400);
  } finally {
    await stop();
  }
});
