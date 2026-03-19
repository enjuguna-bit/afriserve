import test from "node:test";
import assert from "node:assert/strict";
import { startServer, api, loginAsAdmin, approveLoan } from "./integration-helpers.js";
test("collection actions support create, update lifecycle, and status filtering", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Collection Workflow Client",
        phone: "+254700002101",
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data.id),
        principal: 1100,
        termWeeks: 12,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);

    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);
    const approveCreatedLoan = await approveLoan(baseUrl, loanId, checkerToken, {
      notes: "Approve collection workflow loan",
    });
    assert.equal(approveCreatedLoan.status, 200);

    const loanSchedule = await api(baseUrl, `/api/loans/${loanId}/schedule`, {
      token: adminToken,
    });
    assert.equal(loanSchedule.status, 200);
    const installmentId = Number(loanSchedule.data.installments[0].id);
    const promiseDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

    const createAction = await api(baseUrl, "/api/collections/actions", {
      method: "POST",
      token: adminToken,
      body: {
        loanId,
        installmentId,
        actionType: "promise_to_pay",
        actionNote: "Client promised to pay",
        promiseDate,
        actionStatus: "open",
      },
    });
    assert.equal(createAction.status, 201);
    const actionId = Number(createAction.data.id);
    assert.equal(createAction.data.action_status, "open");

    const markCompleted = await api(baseUrl, `/api/collections/actions/${actionId}`, {
      method: "PATCH",
      token: adminToken,
      body: {
        actionStatus: "completed",
        actionNote: "Client paid as promised",
      },
    });
    assert.equal(markCompleted.status, 200);
    assert.equal(markCompleted.data.action.action_status, "completed");
    assert.equal(markCompleted.data.action.action_note, "Client paid as promised");

    const markCancelled = await api(baseUrl, `/api/collections/actions/${actionId}`, {
      method: "PATCH",
      token: adminToken,
      body: {
        actionStatus: "cancelled",
      },
    });
    assert.equal(markCancelled.status, 200);
    assert.equal(markCancelled.data.action.action_status, "cancelled");

    const cancelledActions = await api(baseUrl, `/api/collections/actions?loanId=${loanId}&status=cancelled`, {
      token: adminToken,
    });
    assert.equal(cancelledActions.status, 200);
    assert.ok(
      cancelledActions.data.data.some((action) => Number(action.id) === actionId),
      "Expected cancelled actions filter to return updated action",
    );
  } finally {
    await stop();
  }
});

test("collection routes enforce role boundaries for manage vs view capabilities", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const branches = await api(baseUrl, "/api/branches?limit=200&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    const branchId = Number(branches.data.data[0].id);

    const createFinanceUser = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Collection Finance User",
        email: "collection.finance.user@example.com",
        password: "Password@123",
        role: "finance",
      },
    });
    assert.equal(createFinanceUser.status, 201);

    const createOpsManager = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Collection Ops Manager",
        email: "collection.ops.manager@example.com",
        password: "Password@123",
        role: "operations_manager",
        branchId,
      },
    });
    assert.equal(createOpsManager.status, 201);

    const financeLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "collection.finance.user@example.com",
        password: "Password@123",
      },
    });
    assert.equal(financeLogin.status, 200);
    const financeToken = financeLogin.data.token;

    const opsLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "collection.ops.manager@example.com",
        password: "Password@123",
      },
    });
    assert.equal(opsLogin.status, 200);
    const opsToken = opsLogin.data.token;

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Collection Role Client",
        phone: "+254700002102",
        branchId,
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data.id),
        principal: 1300,
        termWeeks: 12,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);

    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);
    const approveCreatedLoan = await approveLoan(baseUrl, loanId, checkerToken, {
      notes: "Approve collection role-boundary loan",
    });
    assert.equal(approveCreatedLoan.status, 200);

    const financeCreateAction = await api(baseUrl, "/api/collections/actions", {
      method: "POST",
      token: financeToken,
      body: {
        loanId,
        actionType: "note",
        actionNote: "Finance should not manage actions",
      },
    });
    assert.equal(financeCreateAction.status, 403);

    const financeViewActions = await api(baseUrl, `/api/collections/actions?loanId=${loanId}`, {
      token: financeToken,
    });
    assert.equal(financeViewActions.status, 200);

    const opsCreateAction = await api(baseUrl, "/api/collections/actions", {
      method: "POST",
      token: opsToken,
      body: {
        loanId,
        actionType: "note",
        actionNote: "Operations manager follow-up",
      },
    });
    assert.equal(opsCreateAction.status, 201);
  } finally {
    await stop();
  }
});
