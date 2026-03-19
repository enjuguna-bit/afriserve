import assert from "node:assert/strict";
import test from "node:test";
import { api, loginAsAdmin, startServer } from "./integration-helpers.js";

test("canonical api route aliases and structure are available", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const refresh = await api(baseUrl, "/api/auth/refresh-token", {
      method: "POST",
      body: { token: "invalid-token" },
    });
    assert.notEqual(refresh.status, 404);

    const createUser = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Route Structure Admin",
        email: `route-structure-${Date.now()}@example.com`,
        password: "StrongPass123!",
        role: "loan_officer",
      },
    });
    assert.equal(createUser.status, 201);
    const userId = Number(createUser.data?.id || createUser.data?.user?.id || 0);
    assert.ok(userId > 0);

    const updateUser = await api(baseUrl, `/api/users/${userId}`, {
      method: "PUT",
      token: adminToken,
      body: { fullName: "Route Structure Officer" },
    });
    assert.equal(updateUser.status, 200);

    const updateRoles = await api(baseUrl, `/api/users/${userId}/roles`, {
      method: "POST",
      token: adminToken,
      body: { role: "loan_officer", roles: ["loan_officer"] },
    });
    assert.equal(updateRoles.status, 200);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Route Client",
        phone: "+254700002001",
      },
    });
    assert.equal(createClient.status, 201);
    const clientId = Number(createClient.data?.id || 0);
    assert.ok(clientId > 0);

    const updateClient = await api(baseUrl, `/api/clients/${clientId}`, {
      method: "PUT",
      token: adminToken,
      body: { businessType: "retail" },
    });
    assert.equal(updateClient.status, 200);

    const submitKyc = await api(baseUrl, `/api/clients/${clientId}/kyc`, {
      method: "POST",
      token: adminToken,
      body: { status: "verified", note: "route structure test" },
    });
    assert.equal(submitKyc.status, 200);

    const clientLoans = await api(baseUrl, `/api/clients/${clientId}/loans`, {
      token: adminToken,
    });
    assert.equal(clientLoans.status, 200);
    assert.equal(Array.isArray(clientLoans.data?.loans), true);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId,
        principal: 10000,
        termWeeks: 8,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data?.id || 0);
    assert.ok(loanId > 0);

    const submitLoan = await api(baseUrl, `/api/loans/${loanId}/submit`, {
      method: "POST",
      token: adminToken,
      body: { note: "submit canonical route" },
    });
    assert.notEqual(submitLoan.status, 404);

    const repayLoan = await api(baseUrl, `/api/loans/${loanId}/repay`, {
      method: "POST",
      token: adminToken,
      body: { amount: 1000, note: "route structure payment" },
      skipLoanOnboardingAutomation: true,
    });
    assert.notEqual(repayLoan.status, 404);

    const approvalList = await api(baseUrl, "/api/approval-requests", {
      token: adminToken,
    });
    assert.equal(approvalList.status, 200);

    const approvalDetail = await api(baseUrl, "/api/approval-requests/999999", {
      token: adminToken,
    });
    assert.notEqual(approvalDetail.status, 400);

    const approvalApprove = await api(baseUrl, "/api/approval-requests/999999/approve", {
      method: "POST",
      token: adminToken,
      body: { note: "route structure alias" },
    });
    assert.notEqual(approvalApprove.status, 404);

    const approvalReject = await api(baseUrl, "/api/approval-requests/999999/reject", {
      method: "POST",
      token: adminToken,
      body: { note: "route structure alias" },
    });
    assert.notEqual(approvalReject.status, 404);

    const systemHealth = await api(baseUrl, "/api/system/health");
    assert.equal(systemHealth.status, 200);

    const systemConfig = await api(baseUrl, "/api/system/config", {
      token: adminToken,
    });
    assert.equal(systemConfig.status, 200);

    const systemStatus = await api(baseUrl, "/api/system/status", {
      token: adminToken,
    });
    assert.equal(systemStatus.status, 200);

    const loansDue = await api(baseUrl, "/api/reports/loans-due", {
      token: adminToken,
    });
    assert.equal(loansDue.status, 200);
  } finally {
    await stop();
  }
});