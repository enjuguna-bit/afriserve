import test from "node:test";
import assert from "node:assert/strict";
import { startServer, api, loginAsAdmin, approveLoan } from "./integration-helpers.js";
function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function createLoanOfficer({ baseUrl, adminToken, branchId, suffix, label }) {
  const email = `loan.officer.${label}.${suffix}@example.com`;
  const createUser = await api(baseUrl, "/api/users", {
    method: "POST",
    token: adminToken,
    body: {
      fullName: `Loan Officer ${label.toUpperCase()} ${suffix}`,
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
  return login.data.token;
}

async function createBranchManager({ baseUrl, adminToken, branchId, suffix }) {
  const email = `branch.manager.${suffix}@example.com`;
  const createUser = await api(baseUrl, "/api/users", {
    method: "POST",
    token: adminToken,
    body: {
      fullName: `Branch Manager ${suffix}`,
      email,
      password: "Password@123",
      role: "operations_manager",
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
  return login.data.token;
}

async function createClientAndLoan({ baseUrl, token, fullName, phone, principal, termWeeks }) {
  const createClient = await api(baseUrl, "/api/clients", {
    method: "POST",
    token,
    body: {
      fullName,
      phone,
    },
  });
  assert.equal(createClient.status, 201);

  const clientId = Number(createClient.data.id);
  assert.ok(clientId > 0);

  const createLoan = await api(baseUrl, "/api/loans", {
    method: "POST",
    token,
    body: {
      clientId,
      principal,
      termWeeks,
    },
  });
  assert.equal(createLoan.status, 201);

  const loanId = Number(createLoan.data.id);
  assert.ok(loanId > 0);

  return { clientId, loanId };
}

test("loan-officer scoped dashboard endpoints return personal portfolio and pipeline data", async () => {
  const { baseUrl, stop } = await startServer();
  const suffix = uniqueSuffix();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const branches = await api(baseUrl, "/api/branches?limit=200&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    const branchId = Number(branches.data.data[0].id);
    assert.ok(branchId > 0);

    const officerAToken = await createLoanOfficer({
      baseUrl,
      adminToken,
      branchId,
      suffix,
      label: "a",
    });
    const officerBToken = await createLoanOfficer({
      baseUrl,
      adminToken,
      branchId,
      suffix,
      label: "b",
    });

    const loanA1 = await createClientAndLoan({
      baseUrl,
      token: officerAToken,
      fullName: `Officer A Client 1 ${suffix}`,
      phone: `+254700${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      principal: 1200,
      termWeeks: 8,
    });
    const loanA2 = await createClientAndLoan({
      baseUrl,
      token: officerAToken,
      fullName: `Officer A Client 2 ${suffix}`,
      phone: `+254701${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      principal: 1500,
      termWeeks: 10,
    });
    const loanB1 = await createClientAndLoan({
      baseUrl,
      token: officerBToken,
      fullName: `Officer B Client 1 ${suffix}`,
      phone: `+254702${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      principal: 1700,
      termWeeks: 12,
    });

    const approveA2 = await approveLoan(baseUrl, loanA2.loanId, adminToken, {
      notes: "Approve one of officer A loans",
    });
    assert.equal(approveA2.status, 200);

    const minePortfolio = await api(baseUrl, "/api/reports/portfolio?scope=mine", {
      token: officerAToken,
    });
    assert.equal(minePortfolio.status, 200);
    assert.equal(Number(minePortfolio.data.total_loans || 0), 2);
    assert.equal(Number(minePortfolio.data.active_loans || 0), 1);
    assert.ok(Number.isFinite(Number(minePortfolio.data.overdue_amount || 0)));

    const globalPortfolio = await api(baseUrl, "/api/reports/portfolio", {
      token: officerAToken,
    });
    assert.equal(globalPortfolio.status, 200);
    assert.ok(
      Number(globalPortfolio.data.total_loans || 0) > Number(minePortfolio.data.total_loans || 0),
      "Expected global branch-scoped portfolio totals to exceed personal officer scope totals",
    );

    const invalidScope = await api(baseUrl, "/api/reports/portfolio?scope=invalid", {
      token: officerAToken,
    });
    assert.equal(invalidScope.status, 400);

    const myPendingA = await api(baseUrl, "/api/loans/my-pending?limit=20&sortBy=createdAt&sortOrder=desc", {
      token: officerAToken,
    });
    assert.equal(myPendingA.status, 200);
    const pendingIdsA = myPendingA.data.data.map((row) => Number(row.loan_id));
    assert.deepEqual(pendingIdsA, [loanA1.loanId]);
    assert.equal(String(myPendingA.data.data[0].status), "pending_approval");

    const myPendingB = await api(baseUrl, "/api/loans/my-pending?limit=20&sortBy=createdAt&sortOrder=desc", {
      token: officerBToken,
    });
    assert.equal(myPendingB.status, 200);
    const pendingIdsB = myPendingB.data.data.map((row) => Number(row.loan_id));
    assert.deepEqual(pendingIdsB, [loanB1.loanId]);

    const meA = await api(baseUrl, "/api/auth/me", {
      token: officerAToken,
    });
    assert.equal(meA.status, 200);
    const officerAId = Number(meA.data.id);
    assert.ok(officerAId > 0);
    assert.ok(String(meA.data.branch_name || "").trim().length > 0);
    assert.ok(String(meA.data.region_name || "").trim().length > 0);
    assert.equal(
      String(meA.data.role_description || "").trim(),
      "Client onboarding, loan origination, and collections operations.",
    );

    const createActionA = await api(baseUrl, "/api/collections/actions", {
      method: "POST",
      token: officerAToken,
      body: {
        loanId: loanA1.loanId,
        actionType: "note",
        actionNote: "Officer A follow-up",
      },
    });
    assert.equal(createActionA.status, 201);
    const actionAId = Number(createActionA.data.id);
    assert.ok(actionAId > 0);

    const createActionB = await api(baseUrl, "/api/collections/actions", {
      method: "POST",
      token: officerBToken,
      body: {
        loanId: loanB1.loanId,
        actionType: "note",
        actionNote: "Officer B follow-up",
      },
    });
    assert.equal(createActionB.status, 201);
    const actionBId = Number(createActionB.data.id);
    assert.ok(actionBId > 0);

    const mineActionsA = await api(baseUrl, "/api/collections/actions?mine=1&limit=20", {
      token: officerAToken,
    });
    assert.equal(mineActionsA.status, 200);
    const mineActionIdsA = mineActionsA.data.data.map((row) => Number(row.id));
    assert.ok(mineActionIdsA.includes(actionAId), "Expected mine=1 action list to include officer A action");
    assert.ok(!mineActionIdsA.includes(actionBId), "Expected mine=1 action list to exclude officer B action");

    const officerFilterActions = await api(baseUrl, `/api/collections/actions?officerId=${officerAId}&limit=20`, {
      token: adminToken,
    });
    assert.equal(officerFilterActions.status, 200);
    const officerFilterActionIds = officerFilterActions.data.data.map((row) => Number(row.id));
    assert.ok(officerFilterActionIds.includes(actionAId), "Expected officerId filter to include officer A action");
    assert.ok(!officerFilterActionIds.includes(actionBId), "Expected officerId filter to exclude officer B action");

    const summaryMineA = await api(baseUrl, "/api/reports/collections-summary?mine=1", {
      token: officerAToken,
    });
    assert.equal(summaryMineA.status, 200);
    assert.equal(Number(summaryMineA.data.open_collection_actions || 0), 1);
    assert.ok(Number.isFinite(Number(summaryMineA.data.overdue_loans_for_officer || 0)));
    assert.ok(Number.isFinite(Number(summaryMineA.data.overdue_amount_for_officer || 0)));

    const summaryByOfficerFilter = await api(baseUrl, `/api/reports/collections-summary?officerId=${officerAId}`, {
      token: adminToken,
    });
    assert.equal(summaryByOfficerFilter.status, 200);
    assert.equal(Number(summaryByOfficerFilter.data.open_collection_actions || 0), 1);
    assert.ok(Number.isFinite(Number(summaryByOfficerFilter.data.overdue_loans_for_officer || 0)));
    assert.ok(Number.isFinite(Number(summaryByOfficerFilter.data.overdue_amount_for_officer || 0)));

    const mineOverdue = await api(baseUrl, "/api/collections/overdue?mine=1&limit=20", {
      token: officerAToken,
    });
    assert.equal(mineOverdue.status, 200);

    const invalidOfficerFilter = await api(baseUrl, "/api/collections/actions?officerId=abc", {
      token: adminToken,
    });
    assert.equal(invalidOfficerFilter.status, 400);
  } finally {
    await stop();
  }
});

test("branch manager dashboard data can be narrowed to officers in the branch", async () => {
  const { baseUrl, stop } = await startServer();
  const suffix = uniqueSuffix();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const branches = await api(baseUrl, "/api/branches?limit=200&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    const branchId = Number(branches.data.data[0].id);
    assert.ok(branchId > 0);

    const branchManagerToken = await createBranchManager({
      baseUrl,
      adminToken,
      branchId,
      suffix,
    });
    const officerAToken = await createLoanOfficer({
      baseUrl,
      adminToken,
      branchId,
      suffix,
      label: "dashboard-a",
    });
    const officerBToken = await createLoanOfficer({
      baseUrl,
      adminToken,
      branchId,
      suffix,
      label: "dashboard-b",
    });

    const officerAMe = await api(baseUrl, "/api/auth/me", { token: officerAToken });
    assert.equal(officerAMe.status, 200);
    const officerAId = Number(officerAMe.data.id);
    assert.ok(officerAId > 0);

    const officerBMe = await api(baseUrl, "/api/auth/me", { token: officerBToken });
    assert.equal(officerBMe.status, 200);
    const officerBId = Number(officerBMe.data.id);
    assert.ok(officerBId > 0);

    await createClientAndLoan({
      baseUrl,
      token: officerAToken,
      fullName: `Dashboard Officer A Client 1 ${suffix}`,
      phone: `+254710${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      principal: 2400,
      termWeeks: 8,
    });
    await createClientAndLoan({
      baseUrl,
      token: officerAToken,
      fullName: `Dashboard Officer A Client 2 ${suffix}`,
      phone: `+254711${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      principal: 2600,
      termWeeks: 10,
    });
    await createClientAndLoan({
      baseUrl,
      token: officerBToken,
      fullName: `Dashboard Officer B Client 1 ${suffix}`,
      phone: `+254712${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      principal: 2800,
      termWeeks: 12,
    });

    const filterOptions = await api(baseUrl, "/api/reports/filter-options?agentRole=loan_officer", {
      token: branchManagerToken,
    });
    assert.equal(filterOptions.status, 200);
    assert.equal(filterOptions.data.offices.length, 1);
    assert.equal(Number(filterOptions.data.offices[0].id), branchId);
    const branchOfficerIds = new Set((filterOptions.data.agents || []).map((entry) => Number(entry.id)));
    assert.ok(branchOfficerIds.has(officerAId), "Expected officer A in branch manager dashboard filter options");
    assert.ok(branchOfficerIds.has(officerBId), "Expected officer B in branch manager dashboard filter options");

    const officerPortfolio = await api(baseUrl, `/api/reports/portfolio?branchId=${branchId}&officerId=${officerAId}`, {
      token: branchManagerToken,
    });
    assert.equal(officerPortfolio.status, 200);
    assert.equal(Number(officerPortfolio.data.total_loans || 0), 2);

    const officerClients = await api(baseUrl, `/api/clients?branchId=${branchId}&officerId=${officerAId}&limit=20`, {
      token: branchManagerToken,
    });
    assert.equal(officerClients.status, 200);
    assert.equal(Number(officerClients.data.paging.total || 0), 2);

    const officerClientSummary = await api(baseUrl, `/api/reports/clients?branchId=${branchId}&officerId=${officerAId}`, {
      token: branchManagerToken,
    });
    assert.equal(officerClientSummary.status, 200);
    assert.equal(Number(officerClientSummary.data.summary?.new_clients_registered || 0), 2);
  } finally {
    await stop();
  }
});
