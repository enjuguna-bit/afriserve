import test from "node:test";
import assert from "node:assert/strict";
import { startServer, api, loginAsAdmin, approveLoan } from "./integration-helpers.js";
function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function createLoanOfficer({ baseUrl, adminToken, branchId, suffix, label }) {
  const email = `client.history.officer.${label}.${suffix}@example.com`;
  const createUser = await api(baseUrl, "/api/users", {
    method: "POST",
    token: adminToken,
    body: {
      fullName: `Client History Officer ${label.toUpperCase()} ${suffix}`,
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

  return {
    email,
    token: login.data.token,
    userId: Number(login.data.user.id),
  };
}

test("client history endpoint returns profile, KYC, loans, repayments, and collection actions", async () => {
  const { baseUrl, stop } = await startServer();
  const suffix = uniqueSuffix();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const branches = await api(baseUrl, "/api/branches?limit=1&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    const branchId = Number(branches.data.data?.[0]?.id);
    assert.ok(Number.isInteger(branchId) && branchId > 0);

    const officer = await createLoanOfficer({
      baseUrl,
      adminToken,
      branchId,
      suffix,
      label: "a",
    });

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: officer.token,
      body: {
        fullName: `Client History Demo ${suffix}`,
        phone: `+2547${String(Math.floor(Math.random() * 100000000)).padStart(8, "0")}`,
        businessType: "Retail",
        businessYears: 6,
        businessLocation: "Nairobi CBD",
        residentialAddress: "Kasarani, Nairobi",
        nextOfKinName: "Next Kin Demo",
        nextOfKinPhone: "+254701234567",
        nextOfKinRelation: "Sibling",
      },
    });
    assert.equal(createClient.status, 201);
    const clientId = Number(createClient.data.id);
    assert.ok(Number.isInteger(clientId) && clientId > 0);

    const verifyKyc = await api(baseUrl, `/api/clients/${clientId}/kyc`, {
      method: "PATCH",
      token: adminToken,
      body: {
        status: "verified",
        note: "KYC documents validated",
      },
    });
    assert.equal(verifyKyc.status, 200);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: officer.token,
      body: {
        clientId,
        principal: 3200,
        termWeeks: 10,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);
    assert.ok(Number.isInteger(loanId) && loanId > 0);

    const approve = await approveLoan(baseUrl, loanId, adminToken, {
      notes: "Approve for client history test",
    });
    assert.equal(approve.status, 200);

    const recordRepayment = await api(baseUrl, `/api/loans/${loanId}/repayments`, {
      method: "POST",
      token: officer.token,
      body: {
        amount: 600,
      },
    });
    assert.equal(recordRepayment.status, 201);

    const createAction = await api(baseUrl, "/api/collections/actions", {
      method: "POST",
      token: officer.token,
      body: {
        loanId,
        actionType: "note",
        actionStatus: "open",
        actionNote: "Client requested callback",
      },
    });
    assert.equal(createAction.status, 201);

    const history = await api(baseUrl, `/api/clients/${clientId}/history`, {
      token: officer.token,
    });
    assert.equal(history.status, 200);

    assert.equal(Number(history.data.clientProfile.id), clientId);
    assert.equal(history.data.clientProfile.business_type, "Retail");
    assert.equal(Number(history.data.clientProfile.assigned_officer_id), officer.userId);

    assert.equal(history.data.kycStatus.status, "verified");
    assert.equal(history.data.kycStatus.isVerified, true);

    assert.equal(Number(history.data.loanSummary.total_loans), 1);
    assert.equal(Number(history.data.loanSummary.total_repayment_transactions), 1);
    assert.ok(Number(history.data.loanSummary.total_repaid || 0) >= 600);
    assert.equal(Number(history.data.loanSummary.overdue_history.total_installments || 0) > 0, true);

    assert.ok(Array.isArray(history.data.loans));
    assert.equal(history.data.loans.length, 1);
    assert.equal(Number(history.data.loans[0].id), loanId);

    assert.ok(Array.isArray(history.data.repaymentHistory));
    assert.equal(history.data.repaymentHistory.length, 1);
    assert.equal(Number(history.data.repaymentHistory[0].loan_id), loanId);
    assert.equal(Number(history.data.repaymentHistory[0].amount), 600);

    assert.ok(Array.isArray(history.data.collectionActions));
    assert.equal(history.data.collectionActions.length, 1);
    assert.equal(Number(history.data.collectionActions[0].loan_id), loanId);
    assert.equal(String(history.data.collectionActions[0].action_type), "note");
  } finally {
    await stop();
  }
});

test("client history endpoint enforces loan-officer ownership while finance can view", async () => {
  const { baseUrl, stop } = await startServer();
  const suffix = uniqueSuffix();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const branches = await api(baseUrl, "/api/branches?limit=1&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    const branchId = Number(branches.data.data?.[0]?.id);
    assert.ok(Number.isInteger(branchId) && branchId > 0);

    const officerOne = await createLoanOfficer({
      baseUrl,
      adminToken,
      branchId,
      suffix,
      label: "owner",
    });
    const officerTwo = await createLoanOfficer({
      baseUrl,
      adminToken,
      branchId,
      suffix,
      label: "other",
    });

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: officerOne.token,
      body: {
        fullName: `Ownership Client ${suffix}`,
        phone: "+254700998877",
      },
    });
    assert.equal(createClient.status, 201);
    const clientId = Number(createClient.data.id);
    assert.ok(Number.isInteger(clientId) && clientId > 0);

    const ownerAccess = await api(baseUrl, `/api/clients/${clientId}/history`, {
      token: officerOne.token,
    });
    assert.equal(ownerAccess.status, 200);

    const unauthorizedOfficerAccess = await api(baseUrl, `/api/clients/${clientId}/history`, {
      token: officerTwo.token,
    });
    assert.equal(unauthorizedOfficerAccess.status, 403);

    const createFinance = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: `Finance Role ${suffix}`,
        email: `client.history.finance.${suffix}@example.com`,
        password: "Password@123",
        role: "finance",
      },
    });
    assert.equal(createFinance.status, 201);

    const financeLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: `client.history.finance.${suffix}@example.com`,
        password: "Password@123",
      },
    });
    assert.equal(financeLogin.status, 200);

    const financeAccess = await api(baseUrl, `/api/clients/${clientId}/history`, {
      token: financeLogin.data.token,
    });
    assert.equal(financeAccess.status, 200);
    assert.equal(Number(financeAccess.data?.clientProfile?.id), clientId);
  } finally {
    await stop();
  }
});
