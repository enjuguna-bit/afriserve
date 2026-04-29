import test from "node:test";
import assert from "node:assert/strict";
import { api, loginAsAdmin, startServer } from "./integration-helpers.ts";

function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function createLoanOfficer({
  baseUrl,
  adminToken,
  branchId,
  suffix,
}: {
  baseUrl: string;
  adminToken: string;
  branchId: number;
  suffix: string;
}) {
  const email = `dashboard.declined.${suffix}@example.com`;
  const createUser = await api(baseUrl, "/api/users", {
    method: "POST",
    token: adminToken,
    body: {
      fullName: `Dashboard Declined Officer ${suffix}`,
      email,
      password: "Password@123",
      role: "loan_officer",
      branchId,
    },
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

  const me = await api(baseUrl, "/api/auth/me", { token: login.data.token });
  assert.equal(me.status, 200);

  return {
    token: String(login.data.token),
    userId: Number(me.data.id),
  };
}

test("client summary report includes declined-loan counts for dashboard month filters", async () => {
  const { baseUrl, stop } = await startServer();
  const suffix = uniqueSuffix();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const branches = await api(baseUrl, "/api/branches?limit=20&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    const branchId = Number(branches.data.data[0].id);
    assert.ok(branchId > 0);

    const officer = await createLoanOfficer({
      baseUrl,
      adminToken,
      branchId,
      suffix,
    });

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: officer.token,
      body: {
        fullName: `Dashboard Declined Client ${suffix}`,
        phone: `+254703${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: officer.token,
      body: {
        clientId: Number(createClient.data.id),
        principal: 1800,
        termWeeks: 8,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);
    assert.ok(loanId > 0);

    const rejectLoan = await api(baseUrl, `/api/loans/${loanId}/reject`, {
      method: "POST",
      token: adminToken,
      body: {
        reason: "Dashboard declined metric regression test",
      },
    });
    assert.equal(rejectLoan.status, 200);

    const dateFrom = encodeURIComponent(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    const dateTo = encodeURIComponent(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
    const clientSummary = await api(
      baseUrl,
      `/api/reports/clients?branchId=${branchId}&officerId=${officer.userId}&dateFrom=${dateFrom}&dateTo=${dateTo}`,
      {
        token: adminToken,
      },
    );

    assert.equal(clientSummary.status, 200);
    assert.equal(Number(clientSummary.data.summary?.declined_loans || 0), 1);
    assert.equal(Number(clientSummary.data.summary?.declined_loans_in_period || 0), 1);
  } finally {
    await stop();
  }
});
