import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import fs from "node:fs/promises";
import {
  startServer,
  api,
  loginAsAdmin,
  createHighRiskReviewerToken,
  approveLoan,
  submitAndReviewHighRiskRequest,
} from "./integration-helpers.js";
test("loan approval and disbursement are separated into distinct actions", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Separate Approval Disbursement Client",
        phone: "+254700002000",
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data.id),
        principal: 1000,
        termWeeks: 5,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);
    assert.ok(loanId > 0);

    const approval = await api(baseUrl, `/api/loans/${loanId}/approve`, {
      method: "POST",
      token: checkerToken,
      body: {
        notes: "Approve before disbursement",
      },
    });
    assert.equal(approval.status, 200);
    assert.equal(String(approval.data.status), "approved");
    assert.equal(approval.data.disbursed_at, null);

    const blockedRepayment = await api(baseUrl, `/api/loans/${loanId}/repayments`, {
      method: "POST",
      token: adminToken,
      body: {
        amount: 100,
        note: "Should fail before disbursement",
      },
    });
    assert.equal(blockedRepayment.status, 400);
    assert.match(String(blockedRepayment.data?.message || ""), /active|restructured/i);

    const disbursement = await api(baseUrl, `/api/loans/${loanId}/disburse`, {
      method: "POST",
      token: adminToken,
      body: {
        notes: "Cashier/finance disbursement step",
      },
    });
    assert.equal(disbursement.status, 200);
    assert.equal(String(disbursement.data?.loan?.status), "active");
    assert.ok(disbursement.data?.loan?.disbursed_at);

    const schedule = await api(baseUrl, `/api/loans/${loanId}/schedule`, {
      token: adminToken,
    });
    assert.equal(schedule.status, 200);
    assert.equal(Number(schedule.data?.summary?.total_installments || 0), 5);
  } finally {
    await stop();
  }
});

test("approved loans support multi-tranche disbursement before final activation", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Multi Tranche Client",
        phone: "+254700009001",
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data.id),
        principal: 1000,
        termWeeks: 8,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);

    const approval = await api(baseUrl, `/api/loans/${loanId}/approve`, {
      method: "POST",
      token: checkerToken,
      body: {
        notes: "Approve for tranche flow",
      },
    });
    assert.equal(approval.status, 200);
    assert.equal(String(approval.data.status), "approved");

    const firstTranche = await api(baseUrl, `/api/loans/${loanId}/disburse`, {
      method: "POST",
      token: adminToken,
      body: {
        amount: 400,
        notes: "Milestone 1",
      },
    });
    assert.equal(firstTranche.status, 200);
    assert.equal(String(firstTranche.data.message).toLowerCase(), "loan tranche disbursed");
    assert.equal(String(firstTranche.data.loan.status), "approved");
    assert.equal(Boolean(firstTranche.data.disbursement.finalDisbursement), false);
    assert.equal(Number(firstTranche.data.disbursement.remainingPrincipal || 0), 600);

    const trancheHistoryAfterFirst = await api(baseUrl, `/api/loans/${loanId}/disbursements`, {
      token: adminToken,
    });
    assert.equal(trancheHistoryAfterFirst.status, 200);
    assert.equal(Number(trancheHistoryAfterFirst.data.totalDisbursed || 0), 400);
    assert.equal(Number(trancheHistoryAfterFirst.data.remainingPrincipal || 0), 600);
    assert.equal(trancheHistoryAfterFirst.data.tranches.length, 1);

    const invalidOverDisbursement = await api(baseUrl, `/api/loans/${loanId}/disburse`, {
      method: "POST",
      token: adminToken,
      body: {
        amount: 601,
        notes: "Should exceed remaining principal",
      },
    });
    assert.equal(invalidOverDisbursement.status, 400);
    assert.match(String(invalidOverDisbursement.data?.message || ""), /exceeds approved remaining principal/i);

    const finalTranche = await api(baseUrl, `/api/loans/${loanId}/disburse`, {
      method: "POST",
      token: adminToken,
      body: {
        amount: 600,
        finalDisbursement: true,
        notes: "Milestone 2 final",
      },
    });
    assert.equal(finalTranche.status, 200);
    assert.equal(String(finalTranche.data.loan.status), "active");
    assert.equal(Boolean(finalTranche.data.disbursement.finalDisbursement), true);

    const trancheHistoryAfterFinal = await api(baseUrl, `/api/loans/${loanId}/disbursements`, {
      token: adminToken,
    });
    assert.equal(trancheHistoryAfterFinal.status, 200);
    assert.equal(Number(trancheHistoryAfterFinal.data.totalDisbursed || 0), 1000);
    assert.equal(Number(trancheHistoryAfterFinal.data.remainingPrincipal || 0), 0);
    assert.equal(trancheHistoryAfterFinal.data.tranches.length, 2);
    assert.equal(Boolean(trancheHistoryAfterFinal.data.tranches[1].is_final), true);

    const contracts = await api(baseUrl, `/api/loans/${loanId}/contracts`, {
      token: adminToken,
    });
    assert.equal(contracts.status, 200);
    assert.equal(contracts.data.versions.length, 3);

    const creationVersion = contracts.data.versions.find((row) => String(row.event_type || "").toLowerCase() === "creation");
    assert.ok(creationVersion, "Expected creation contract version");
    assert.equal(String(creationVersion.snapshot?.loan?.status || ""), "pending_approval");
    assert.equal(Number(creationVersion.snapshot?.disbursementSummary?.totalDisbursed || 0), 0);

    const trancheVersion = contracts.data.versions.find((row) => String(row.event_type || "").toLowerCase() === "disbursement_tranche");
    assert.ok(trancheVersion, "Expected disbursement_tranche contract version");
    assert.equal(String(trancheVersion.snapshot?.loan?.status || ""), "approved");
    assert.equal(Number(trancheVersion.snapshot?.disbursementSummary?.remainingPrincipal || 0), 600);
    assert.equal(Number(trancheVersion.snapshot?.tranche?.trancheNumber || 0), 1);

    const disbursementVersion = contracts.data.versions.find((row) => String(row.event_type || "").toLowerCase() === "disbursement");
    assert.ok(disbursementVersion, "Expected disbursement contract version");
    assert.equal(String(disbursementVersion.snapshot?.loan?.status || ""), "active");
    assert.equal(Number(disbursementVersion.snapshot?.disbursementSummary?.remainingPrincipal || 0), 0);
    assert.equal(Boolean(disbursementVersion.snapshot?.disbursement?.finalDisbursement), true);

    const transactions = await api(baseUrl, `/api/transactions?loanId=${loanId}&limit=50`, {
      token: adminToken,
    });
    assert.equal(transactions.status, 200);
    assert.ok(
      transactions.data.data.some((entry) => String(entry.tx_type || "") === "disbursement_tranche"),
      "Expected transactions list to include a tranche disbursement event",
    );
    assert.ok(
      transactions.data.data.some((entry) => String(entry.tx_type || "") === "disbursement"),
      "Expected transactions list to include a final disbursement event",
    );

    const schedule = await api(baseUrl, `/api/loans/${loanId}/schedule`, {
      token: adminToken,
    });
    assert.equal(schedule.status, 200);
    assert.equal(Number(schedule.data.summary.total_installments || 0), 8);
  } finally {
    await stop();
  }
});

test("loan lifecycle events remain available against legacy repayments schema", async () => {
  const dbPath = `.runtime/test-dbs/legacy-lifecycle-${Date.now()}.sqlite`;
  const initialServer = await startServer({
    envOverrides: {
      DB_PATH: dbPath,
    },
  });
  const { baseUrl, stop, dbFilePath } = initialServer;

  assert.ok(dbFilePath, "Expected sqlite test database path");

  let loanId = 0;

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Legacy Lifecycle Events Client",
        phone: "+254700002111",
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data.id),
        principal: 1500,
        termWeeks: 5,
      },
    });
    assert.equal(createLoan.status, 201);
    loanId = Number(createLoan.data.id);
    assert.ok(loanId > 0);

    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    const approveCreatedLoan = await approveLoan(baseUrl, loanId, checkerToken, {
      notes: "Approve legacy lifecycle schema client",
    });
    assert.equal(approveCreatedLoan.status, 200);
  } finally {
    await stop();
  }

  const legacyDb = new Database(dbFilePath);
  legacyDb.exec(`
    PRAGMA foreign_keys = OFF;
    ALTER TABLE repayments RENAME TO repayments_modern;
    CREATE TABLE repayments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      paid_at TEXT NOT NULL,
      note TEXT,
      recorded_by_user_id INTEGER,
      FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE ON UPDATE CASCADE,
      FOREIGN KEY (recorded_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
    );
    INSERT INTO repayments (id, loan_id, amount, paid_at, note, recorded_by_user_id)
    SELECT id, loan_id, amount, paid_at, note, recorded_by_user_id
    FROM repayments_modern;
    DROP TABLE repayments_modern;
    CREATE INDEX IF NOT EXISTS idx_repayments_loan_id ON repayments(loan_id);
    PRAGMA foreign_keys = ON;
  `);
  legacyDb.close();

  const restartedServer = await startServer({
    envOverrides: {
      DB_PATH: dbFilePath,
    },
  });

  try {
    const adminToken = await loginAsAdmin(restartedServer.baseUrl);
    const lifecycle = await api(restartedServer.baseUrl, `/api/loans/${loanId}/lifecycle-events`, {
      token: adminToken,
    });
    assert.equal(lifecycle.status, 200);
    assert.ok(Array.isArray(lifecycle.data.events));
    assert.ok(
      lifecycle.data.events.some((event) => String(event.event_type || "").toLowerCase() === "loan_created"),
      "Expected lifecycle events to include loan_created",
    );
    assert.ok(
      lifecycle.data.events.some((event) => String(event.event_type || "").toLowerCase() === "loan_approved"),
      "Expected lifecycle events to include loan_approved",
    );
  } finally {
    await restartedServer.stop();
    await Promise.all([
      fs.rm(dbFilePath, { force: true }),
      fs.rm(`${dbFilePath}-wal`, { force: true }),
      fs.rm(`${dbFilePath}-shm`, { force: true }),
    ]);
  }
});

test("startup backfills missing loan contract versions for existing loans", async () => {
  const dbPath = `.runtime/test-dbs/contract-backfill-${Date.now()}.sqlite`;
  const initialServer = await startServer({
    envOverrides: {
      DB_PATH: dbPath,
    },
  });
  const { baseUrl, stop, dbFilePath } = initialServer;

  assert.ok(dbFilePath, "Expected sqlite test database path");

  let loanId = 0;

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Contract Backfill Client",
        phone: "+254700002112",
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data.id),
        principal: 1800,
        termWeeks: 6,
      },
    });
    assert.equal(createLoan.status, 201);
    loanId = Number(createLoan.data.id);
    assert.ok(loanId > 0);

    const contractsBeforeDeletion = await api(baseUrl, `/api/loans/${loanId}/contracts`, {
      token: adminToken,
    });
    assert.equal(contractsBeforeDeletion.status, 200);
    assert.ok(contractsBeforeDeletion.data.versions.length > 0);
  } finally {
    await stop();
  }

  const backfillDb = new Database(dbFilePath);
  backfillDb.prepare("DELETE FROM loan_contract_versions WHERE loan_id = ?").run(loanId);
  const deletedCount = Number(
    backfillDb.prepare("SELECT COUNT(*) AS count FROM loan_contract_versions WHERE loan_id = ?").get(loanId)?.count || 0,
  );
  backfillDb.close();
  assert.equal(deletedCount, 0);

  const restartedServer = await startServer({
    envOverrides: {
      DB_PATH: dbFilePath,
    },
  });

  try {
    const adminToken = await loginAsAdmin(restartedServer.baseUrl);
    const contracts = await api(restartedServer.baseUrl, `/api/loans/${loanId}/contracts`, {
      token: adminToken,
    });
    assert.equal(contracts.status, 200);
    assert.ok(contracts.data.versions.length > 0, "Expected startup backfill to restore contract history");
    assert.ok(
      contracts.data.versions.some((row) => String(row.event_type || "").toLowerCase() === "creation"),
      "Expected backfilled contract history to include creation version",
    );
  } finally {
    await restartedServer.stop();
    await Promise.all([
      fs.rm(dbFilePath, { force: true }),
      fs.rm(`${dbFilePath}-wal`, { force: true }),
      fs.rm(`${dbFilePath}-shm`, { force: true }),
    ]);
  }
});

test("loan top-up workflow creates approval execution and contract version history", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Top-up Workflow Client",
        phone: "+254700009002",
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data.id),
        principal: 1200,
        termWeeks: 12,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);

    const disbursement = await approveLoan(baseUrl, loanId, checkerToken, {
      notes: "Approve and disburse before top-up",
    });
    assert.equal(disbursement.status, 200);

    const loanBeforeTopUp = await api(baseUrl, `/api/loans/${loanId}`, {
      token: adminToken,
    });
    assert.equal(loanBeforeTopUp.status, 200);
    const balanceBeforeTopUp = Number(loanBeforeTopUp.data.balance || 0);

    const topUpFlow = await submitAndReviewHighRiskRequest(baseUrl, {
      loanId,
      action: "top-up",
      requestToken: adminToken,
      reviewToken: checkerToken,
      requestBody: {
        additionalPrincipal: 300,
        newTermWeeks: 16,
        note: "Expand facility for seasonal inventory",
      },
      reviewNote: "Approve top-up",
    });
    if (topUpFlow.review?.status !== 200) {
      console.error("Top-up review failed:", JSON.stringify(topUpFlow.review?.data, null, 2));
    }
    assert.equal(topUpFlow.request.status, 200);
    assert.equal(topUpFlow.review?.status, 200);
    const fs = require('node:fs');
    if (String(topUpFlow.review?.data?.execution?.transaction?.tx_type || "") !== "top_up") {
        fs.writeFileSync('topup_response.json', JSON.stringify(topUpFlow.review?.data, null, 2));
    }


    assert.equal(String(topUpFlow.review?.data?.execution?.transaction?.tx_type || ""), "top_up");


    const loanAfterTopUp = await api(baseUrl, `/api/loans/${loanId}`, {
      token: adminToken,
    });
    assert.equal(loanAfterTopUp.status, 200);
    assert.ok(Number(loanAfterTopUp.data.balance || 0) > balanceBeforeTopUp);

    const contracts = await api(baseUrl, `/api/loans/${loanId}/contracts`, {
      token: adminToken,
    });
    assert.equal(contracts.status, 200);
    assert.ok(
      contracts.data.versions.some((row) => String(row.event_type || "").toLowerCase() === "top_up"),
      "Expected top_up contract version",
    );
  } finally {
    await stop();
  }
});

test("approval request listings include workflow metadata and execution timestamps", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Approval Listing Client",
        phone: "+254700009099",
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data.id),
        principal: 1800,
        termWeeks: 12,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);

    const disbursement = await approveLoan(baseUrl, loanId, checkerToken, {
      notes: "Approve before approval queue metadata test",
    });
    assert.equal(disbursement.status, 200);

    const topUpRequest = await api(baseUrl, `/api/loans/${loanId}/top-up`, {
      method: "POST",
      token: adminToken,
      body: {
        additionalPrincipal: 250,
        newTermWeeks: 14,
        note: "Metadata test top-up request",
      },
    });
    assert.equal(topUpRequest.status, 200);

    const pendingApprovals = await api(baseUrl, `/api/approval-requests?status=pending&loanId=${loanId}`, {
      token: adminToken,
    });
    assert.equal(pendingApprovals.status, 200);

    const pendingRequest = pendingApprovals.data.rows.find(
      (row) => String(row.request_type || "").toLowerCase() === "loan_top_up",
    );
    assert.ok(pendingRequest, "Expected pending top-up approval request");
    assert.equal(String(pendingRequest.client_name || ""), "Approval Listing Client");
    assert.equal(String(pendingRequest.requested_by_name || "").length > 0, true);
    assert.equal(String(pendingRequest.execution_state || ""), "pending");
    assert.equal(pendingRequest.executed_at, null);

    const review = await api(baseUrl, `/api/approval-requests/${Number(pendingRequest.id)}/review`, {
      method: "POST",
      token: checkerToken,
      body: {
        decision: "approve",
        note: "Approve metadata test top-up",
      },
    });
    assert.equal(review.status, 200);

    const approvedApprovals = await api(baseUrl, `/api/approval-requests?status=approved&loanId=${loanId}`, {
      token: adminToken,
    });
    assert.equal(approvedApprovals.status, 200);

    const approvedRequest = approvedApprovals.data.rows.find((row) => Number(row.id) === Number(pendingRequest.id));
    assert.ok(approvedRequest, "Expected approved top-up approval request");
    assert.equal(String(approvedRequest.execution_state || ""), "executed");
    assert.equal(String(approvedRequest.checker_name || "").length > 0, true);
    assert.ok(approvedRequest.approved_at, "Expected approval timestamp");
    assert.ok(approvedRequest.executed_at, "Expected execution timestamp after workflow execution");
    assert.equal(String(approvedRequest.review_note || ""), "Approve metadata test top-up");
  } finally {
    await stop();
  }
});

test("maker-checker blocks admins from reviewing their own high-risk requests", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Maker Checker Admin Block Client",
        phone: "+254700009199",
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data.id),
        principal: 1300,
        termWeeks: 10,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);

    const disbursement = await approveLoan(baseUrl, loanId, adminToken, {
      notes: "Approve before maker-checker admin block test",
    });
    assert.equal(disbursement.status, 200);

    const topUpRequest = await api(baseUrl, `/api/loans/${loanId}/top-up`, {
      method: "POST",
      token: adminToken,
      body: {
        additionalPrincipal: 200,
        newTermWeeks: 12,
        note: "Admin self-review must be blocked",
      },
    });
    assert.equal(topUpRequest.status, 200);
    const approvalRequestId = Number(topUpRequest.data?.approvalRequest?.id || 0);
    assert.ok(approvalRequestId > 0, "Expected top-up approval request id");

    const selfReview = await api(baseUrl, `/api/approval-requests/${approvalRequestId}/review`, {
      method: "POST",
      token: adminToken,
      body: {
        decision: "approve",
        note: "Admin self-approval attempt",
      },
    });
    assert.equal(selfReview.status, 403);
    assert.match(String(selfReview.data?.message || ""), /maker-checker|own request/i);
  } finally {
    await stop();
  }
});

test("refinance and term extension workflows execute through approval queue and version history", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Refinance Extension Client",
        phone: "+254700009003",
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data.id),
        principal: 1500,
        termWeeks: 10,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);

    const disbursement = await approveLoan(baseUrl, loanId, checkerToken, {
      notes: "Approve before refinance",
    });
    assert.equal(disbursement.status, 200);

    const refinanceFlow = await submitAndReviewHighRiskRequest(baseUrl, {
      loanId,
      action: "refinance",
      requestToken: adminToken,
      reviewToken: checkerToken,
      requestBody: {
        newInterestRate: 12,
        newTermWeeks: 18,
        additionalPrincipal: 100,
        note: "Refinance to lower rate and extend runway",
      },
      reviewNote: "Approve refinance",
    });
    assert.equal(refinanceFlow.request.status, 200);
    assert.equal(refinanceFlow.review?.status, 200);
    assert.equal(String(refinanceFlow.review?.data?.execution?.transaction?.tx_type || ""), "refinance");
    assert.equal(Number(refinanceFlow.review?.data?.loan?.interest_rate || 0), 12);
    assert.equal(Number(refinanceFlow.review?.data?.loan?.term_weeks || 0), 18);

    const extensionFlow = await submitAndReviewHighRiskRequest(baseUrl, {
      loanId,
      action: "term-extension",
      requestToken: adminToken,
      reviewToken: checkerToken,
      requestBody: {
        newTermWeeks: 24,
        note: "Extension based on revised cashflow cycle",
      },
      reviewNote: "Approve term extension",
    });
    assert.equal(extensionFlow.request.status, 200);
    assert.equal(extensionFlow.review?.status, 200);
    assert.equal(String(extensionFlow.review?.data?.execution?.transaction?.tx_type || ""), "term_extension");
    assert.equal(Number(extensionFlow.review?.data?.loan?.term_weeks || 0), 24);

    const contracts = await api(baseUrl, `/api/loans/${loanId}/contracts`, {
      token: adminToken,
    });
    assert.equal(contracts.status, 200);
    assert.ok(
      contracts.data.versions.some((row) => String(row.event_type || "").toLowerCase() === "refinance"),
      "Expected refinance contract version",
    );
    assert.ok(
      contracts.data.versions.some((row) => String(row.event_type || "").toLowerCase() === "term_extension"),
      "Expected term extension contract version",
    );
  } finally {
    await stop();
  }
});

test("repayment allocation is oldest-first and schedule reflects installment progress", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Installment Allocation Client",
        phone: "+254700002001",
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data.id),
        principal: 1000,
        termWeeks: 4,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);

    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    const approveCreatedLoan = await approveLoan(baseUrl, loanId, checkerToken, {
      notes: "Approve test loan before schedule assertions",
    });
    assert.equal(approveCreatedLoan.status, 200);

    const scheduleBefore = await api(baseUrl, `/api/loans/${loanId}/schedule`, {
      token: adminToken,
    });
    assert.equal(scheduleBefore.status, 200);
    assert.equal(Number(scheduleBefore.data.summary.total_installments || 0), 4);
    const installmentsBefore = scheduleBefore.data.installments;
    assert.equal(installmentsBefore.length, 4);

    const firstInstallmentDue = Number(installmentsBefore[0].amount_due || 0);
    const secondInstallmentDue = Number(installmentsBefore[1].amount_due || 0);
    const repaymentAmount = Number((firstInstallmentDue + (secondInstallmentDue / 2)).toFixed(2));

    const postRepayment = await api(baseUrl, `/api/loans/${loanId}/repayments`, {
      method: "POST",
      token: adminToken,
      body: {
        amount: repaymentAmount,
        note: "Allocation behavior test",
      },
    });
    assert.equal(postRepayment.status, 201);

    const scheduleAfter = await api(baseUrl, `/api/loans/${loanId}/schedule`, {
      token: adminToken,
    });
    assert.equal(scheduleAfter.status, 200);

    const installmentsAfter = scheduleAfter.data.installments;
    const firstAfter = installmentsAfter[0];
    const secondAfter = installmentsAfter[1];
    const thirdAfter = installmentsAfter[2];

    assert.equal(firstAfter.status, "paid");
    assert.equal(Number(firstAfter.amount_paid || 0), Number(firstAfter.amount_due || 0));
    assert.ok(Number(secondAfter.amount_paid || 0) > 0);
    assert.ok(Number(secondAfter.amount_paid || 0) < Number(secondAfter.amount_due || 0));
    assert.equal(Number(thirdAfter.amount_paid || 0), 0);
    assert.equal(Number(scheduleAfter.data.summary.paid_installments || 0), 1);
  } finally {
    await stop();
  }
});

test("repayment waterfall clears penalties before scheduled installments", async () => {
  const { baseUrl, stop, dbFilePath } = await startServer();

  try {
    assert.ok(dbFilePath, "Expected sqlite database path");
    const adminToken = await loginAsAdmin(baseUrl);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Penalty Waterfall Client",
        phone: "+254700002090",
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data.id),
        principal: 1200,
        termWeeks: 6,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);
    assert.ok(loanId > 0);

    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    const approveCreatedLoan = await approveLoan(baseUrl, loanId, checkerToken, {
      notes: "Approve for penalty waterfall assertions",
    });
    assert.equal(approveCreatedLoan.status, 200);

    const penaltyAmount = 100;
    const db = new Database(String(dbFilePath));
    try {
      db.prepare(`
        UPDATE loan_installments
        SET penalty_amount_accrued = ?
        WHERE loan_id = ? AND installment_number = 1
      `).run(penaltyAmount, loanId);
      db.prepare(`
        UPDATE loans
        SET
          expected_total = ROUND(expected_total + ?, 2),
          balance = ROUND(balance + ?, 2)
        WHERE id = ?
      `).run(penaltyAmount, penaltyAmount, loanId);
    } finally {
      db.close();
    }

    const repaymentAmount = 150;
    const repayment = await api(baseUrl, `/api/loans/${loanId}/repayments`, {
      method: "POST",
      token: adminToken,
      body: {
        amount: repaymentAmount,
        note: "Penalty-first repayment",
      },
    });
    assert.equal(repayment.status, 201);

    const verifyDb = new Database(String(dbFilePath), { readonly: true });
    try {
      const firstInstallment = verifyDb.prepare(`
        SELECT amount_paid, penalty_amount_accrued
        FROM loan_installments
        WHERE loan_id = ? AND installment_number = 1
      `).get(loanId) as { amount_paid: number; penalty_amount_accrued: number } | undefined;
      const secondInstallment = verifyDb.prepare(`
        SELECT amount_paid
        FROM loan_installments
        WHERE loan_id = ? AND installment_number = 2
      `).get(loanId) as { amount_paid: number } | undefined;

      assert.ok(firstInstallment, "Expected first installment row");
      assert.ok(secondInstallment, "Expected second installment row");
      assert.equal(Number(firstInstallment?.penalty_amount_accrued || 0), 0);
      assert.equal(Number(firstInstallment?.amount_paid || 0), 50);
      assert.equal(Number(secondInstallment?.amount_paid || 0), 0);
    } finally {
      verifyDb.close();
    }
  } finally {
    await stop();
  }
});

test("repayment idempotency key prevents duplicate retries", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Repayment Idempotency Client",
        phone: "+254700002091",
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data.id),
        principal: 1000,
        termWeeks: 8,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);
    assert.ok(loanId > 0);

    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    const approveCreatedLoan = await approveLoan(baseUrl, loanId, checkerToken, {
      notes: "Approve for repayment idempotency test",
    });
    assert.equal(approveCreatedLoan.status, 200);

    const idempotencyKey = `repay-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const firstRepayment = await api(baseUrl, `/api/loans/${loanId}/repayments`, {
      method: "POST",
      token: adminToken,
      body: {
        amount: 200,
        note: "Initial repayment",
        clientIdempotencyKey: idempotencyKey,
      },
    });
    assert.equal(firstRepayment.status, 201);
    const firstRepaymentId = Number(firstRepayment.data?.repayment?.id || 0);
    assert.ok(firstRepaymentId > 0);

    const replayRepayment = await api(baseUrl, `/api/loans/${loanId}/repayments`, {
      method: "POST",
      token: adminToken,
      body: {
        amount: 200,
        note: "Retry repayment with same key",
        clientIdempotencyKey: idempotencyKey,
      },
    });
    assert.equal(replayRepayment.status, 201);
    assert.equal(Number(replayRepayment.data?.repayment?.id || 0), firstRepaymentId);

    const mismatchedReplay = await api(baseUrl, `/api/loans/${loanId}/repayments`, {
      method: "POST",
      token: adminToken,
      body: {
        amount: 250,
        note: "Retry with different amount should fail",
        clientIdempotencyKey: idempotencyKey,
      },
    });
    assert.equal(mismatchedReplay.status, 400);
    assert.match(String(mismatchedReplay.data?.message || ""), /idempotency key/i);

    const repaymentHistory = await api(baseUrl, `/api/loans/${loanId}/repayments`, {
      token: adminToken,
    });
    assert.equal(repaymentHistory.status, 200);
    assert.equal(Array.isArray(repaymentHistory.data), true);
    assert.equal(repaymentHistory.data.length, 1);
    assert.equal(Number(repaymentHistory.data[0]?.id || 0), firstRepaymentId);

    const loanAfterReplay = await api(baseUrl, `/api/loans/${loanId}`, {
      token: adminToken,
    });
    assert.equal(loanAfterReplay.status, 200);
    assert.equal(Number(loanAfterReplay.data.repaid_total || 0), 200);
  } finally {
    await stop();
  }
});

test("overpayment is accepted and excess is captured as an advance credit memo", async () => {
  const { baseUrl, stop, dbFilePath } = await startServer();

  try {
    assert.ok(dbFilePath, "Expected sqlite database path");
    const adminToken = await loginAsAdmin(baseUrl);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Overpayment Credit Client",
        phone: "+254700002092",
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data.id),
        principal: 1000,
        termWeeks: 8,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);
    assert.ok(loanId > 0);

    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    const approveCreatedLoan = await approveLoan(baseUrl, loanId, checkerToken, {
      notes: "Approve for overpayment credit memo test",
    });
    assert.equal(approveCreatedLoan.status, 200);

    const loanBeforeRepayment = await api(baseUrl, `/api/loans/${loanId}`, {
      token: adminToken,
    });
    assert.equal(loanBeforeRepayment.status, 200);
    const outstandingBefore = Number(loanBeforeRepayment.data.balance || 0);
    assert.ok(outstandingBefore > 0);

    const overpaymentExcess = 125;
    const repaymentAmount = Number((outstandingBefore + overpaymentExcess).toFixed(2));
    const repayment = await api(baseUrl, `/api/loans/${loanId}/repayments`, {
      method: "POST",
      token: adminToken,
      body: {
        amount: repaymentAmount,
        note: "Customer overpaid loan closure amount",
      },
    });
    assert.equal(repayment.status, 201);
    assert.equal(Number(repayment.data?.repayment?.amount || 0), repaymentAmount);
    assert.equal(Number(repayment.data?.overpaymentCredit?.amount || 0), overpaymentExcess);
    const repaymentId = Number(repayment.data?.repayment?.id || 0);
    assert.ok(repaymentId > 0);

    const loanAfterRepayment = await api(baseUrl, `/api/loans/${loanId}`, {
      token: adminToken,
    });
    assert.equal(loanAfterRepayment.status, 200);
    assert.equal(String(loanAfterRepayment.data.status), "closed");
    assert.equal(Number(loanAfterRepayment.data.balance || 0), 0);
    assert.equal(Number(loanAfterRepayment.data.repaid_total || 0), Number((outstandingBefore).toFixed(2)));

    const creditDb = new Database(String(dbFilePath), { readonly: true });
    try {
      const creditMemo = creditDb.prepare(`
        SELECT repayment_id, amount, status
        FROM loan_overpayment_credits
        WHERE loan_id = ?
        ORDER BY id DESC
        LIMIT 1
      `).get(loanId) as { repayment_id: number; amount: number; status: string } | undefined;
      assert.ok(creditMemo, "Expected overpayment credit memo row");
      assert.equal(Number(creditMemo?.repayment_id || 0), repaymentId);
      assert.equal(Number(creditMemo?.amount || 0), overpaymentExcess);
      assert.equal(String(creditMemo?.status || ""), "open");
    } finally {
      creditDb.close();
    }

    const loanJournals = await api(baseUrl, `/api/loans/${loanId}/gl-journals`, {
      token: adminToken,
    });
    assert.equal(loanJournals.status, 200);
    const repaymentJournal = loanJournals.data.journals.find((row) => row.reference_type === "loan_repayment");
    assert.ok(repaymentJournal, "Expected repayment GL journal");
    assert.ok(
      repaymentJournal.entries.some((line) => line.account_code === "CASH" && line.side === "debit" && Number(line.amount || 0) === repaymentAmount),
    );
    assert.ok(
      repaymentJournal.entries.some((line) => line.account_code === "LOAN_RECEIVABLE" && line.side === "credit" && Number(line.amount || 0) === Number(outstandingBefore.toFixed(2))),
    );
    assert.ok(
      repaymentJournal.entries.some((line) => line.account_code === "SUSPENSE_FUNDS" && line.side === "credit" && Number(line.amount || 0) === overpaymentExcess),
    );
  } finally {
    await stop();
  }
});

test("top-up after partial repayment keeps schedule totals aligned with loan balances", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Top-up Partial Repayment Client",
        phone: "+2547000020011",
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data.id),
        principal: 1000,
        termWeeks: 8,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);

    const disbursement = await approveLoan(baseUrl, loanId, checkerToken, {
      notes: "Approve before top-up partial repayment regression",
    });
    assert.equal(disbursement.status, 200);

    const scheduleBefore = await api(baseUrl, `/api/loans/${loanId}/schedule`, {
      token: adminToken,
    });
    assert.equal(scheduleBefore.status, 200);

    const firstInstallmentDue = Number(scheduleBefore.data.installments[0].amount_due || 0);
    const secondInstallmentDue = Number(scheduleBefore.data.installments[1].amount_due || 0);
    const repaymentAmount = Number((firstInstallmentDue + (secondInstallmentDue / 2)).toFixed(2));

    const repayment = await api(baseUrl, `/api/loans/${loanId}/repayments`, {
      method: "POST",
      token: adminToken,
      body: {
        amount: repaymentAmount,
        note: "Partial repayment before top-up",
      },
    });
    assert.equal(repayment.status, 201);

    const topUpFlow = await submitAndReviewHighRiskRequest(baseUrl, {
      loanId,
      action: "top-up",
      requestToken: adminToken,
      reviewToken: checkerToken,
      requestBody: {
        additionalPrincipal: 250,
        newTermWeeks: 10,
        note: "Top-up after partial repayment",
      },
      reviewNote: "Approve top-up after partial repayment",
    });
    assert.equal(topUpFlow.request.status, 200);
    assert.equal(topUpFlow.review?.status, 200);

    const loanAfterTopUp = await api(baseUrl, `/api/loans/${loanId}`, {
      token: adminToken,
    });
    assert.equal(loanAfterTopUp.status, 200);

    const scheduleAfterTopUp = await api(baseUrl, `/api/loans/${loanId}/schedule`, {
      token: adminToken,
    });
    assert.equal(scheduleAfterTopUp.status, 200);

    const totalDueCents = Math.round(Number(scheduleAfterTopUp.data.summary.total_due || 0) * 100);
    const totalPaidCents = Math.round(Number(scheduleAfterTopUp.data.summary.total_paid || 0) * 100);
    const balanceCents = Math.round(Number(loanAfterTopUp.data.balance || 0) * 100);
    const expectedTotalCents = Math.round(Number(loanAfterTopUp.data.expected_total || 0) * 100);
    const repaidTotalCents = Math.round(Number(loanAfterTopUp.data.repaid_total || 0) * 100);

    assert.equal(Number(scheduleAfterTopUp.data.summary.total_installments || 0), 10);
    assert.equal(scheduleAfterTopUp.data.installments.length, 10);
    assert.equal(Number(scheduleAfterTopUp.data.installments[0].installment_number || 0), 1);
    assert.equal(Number(scheduleAfterTopUp.data.installments[9].installment_number || 0), 10);
    assert.equal(totalDueCents, expectedTotalCents);
    assert.equal(totalPaidCents, repaidTotalCents);
    assert.equal(totalDueCents - totalPaidCents, balanceCents);
    assert.equal(
      scheduleAfterTopUp.data.installments.some((row: Record<string, unknown>) => Number(row.amount_paid || 0) > 0),
      true,
    );
  } finally {
    await stop();
  }
});

test("loan installments endpoint returns rows and supports status filter", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Installment Endpoint Client",
        phone: "+254700002002",
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data.id),
        principal: 1200,
        termWeeks: 4,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);

    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    const approveCreatedLoan = await approveLoan(baseUrl, loanId, checkerToken, {
      notes: "Approve test loan before installment endpoint assertions",
    });
    assert.equal(approveCreatedLoan.status, 200);

    const allInstallments = await api(baseUrl, `/api/loans/${loanId}/installments`, {
      token: adminToken,
    });
    assert.equal(allInstallments.status, 200);
    assert.equal(allInstallments.data.length, 4);
    const firstInstallment = allInstallments.data[0];
    assert.deepEqual(
      Object.keys(firstInstallment).sort(),
      ["installment_number", "due_date", "amount_due", "amount_paid", "status", "paid_at"].sort(),
    );
    assert.equal(Object.prototype.hasOwnProperty.call(firstInstallment, "id"), false);

    const pendingBeforeRepayment = await api(baseUrl, `/api/loans/${loanId}/installments?status=pending`, {
      token: adminToken,
    });
    assert.equal(pendingBeforeRepayment.status, 200);
    assert.equal(pendingBeforeRepayment.data.length, 4);

    const overdueBeforeRepayment = await api(baseUrl, `/api/loans/${loanId}/installments?status=overdue`, {
      token: adminToken,
    });
    assert.equal(overdueBeforeRepayment.status, 200);
    assert.equal(overdueBeforeRepayment.data.length, 0);

    const firstInstallmentDue = Number(allInstallments.data[0].amount_due || 0);
    const secondInstallmentDue = Number(allInstallments.data[1].amount_due || 0);
    const repaymentAmount = Number((firstInstallmentDue + (secondInstallmentDue / 2)).toFixed(2));

    const postRepayment = await api(baseUrl, `/api/loans/${loanId}/repayments`, {
      method: "POST",
      token: adminToken,
      body: {
        amount: repaymentAmount,
        note: "Installment endpoint filter test",
      },
    });
    assert.equal(postRepayment.status, 201);

    const paidAfterRepayment = await api(baseUrl, `/api/loans/${loanId}/installments?status=paid`, {
      token: adminToken,
    });
    assert.equal(paidAfterRepayment.status, 200);
    assert.equal(paidAfterRepayment.data.length, 1);
    assert.equal(paidAfterRepayment.data[0].status, "paid");

    const pendingAfterRepayment = await api(baseUrl, `/api/loans/${loanId}/installments?status=pending`, {
      token: adminToken,
    });
    assert.equal(pendingAfterRepayment.status, 200);
    assert.equal(pendingAfterRepayment.data.length, 3);
    assert.ok(pendingAfterRepayment.data.every((item) => item.status === "pending"));

    const invalidStatus = await api(baseUrl, `/api/loans/${loanId}/installments?status=active`, {
      token: adminToken,
    });
    assert.equal(invalidStatus.status, 400);
    assert.equal(invalidStatus.data.message, "Invalid status filter. Use overdue, pending, or paid");
  } finally {
    await stop();
  }
});

test("loan restructuring regenerates schedule and records a restructure transaction", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Restructure Deep Flow Client",
        phone: "+254700002003",
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data.id),
        principal: 2000,
        termWeeks: 12,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);

    const approveCreatedLoan = await approveLoan(baseUrl, loanId, checkerToken, {
      notes: "Approve before deep restructure assertions",
    });
    assert.equal(approveCreatedLoan.status, 200);

    const loanBeforeRestructure = await api(baseUrl, `/api/loans/${loanId}`, {
      token: adminToken,
    });
    assert.equal(loanBeforeRestructure.status, 200);
    const previousBalance = Number(loanBeforeRestructure.data.balance || 0);
    assert.ok(previousBalance > 0);

    const scheduleBefore = await api(baseUrl, `/api/loans/${loanId}/schedule`, {
      token: adminToken,
    });
    assert.equal(scheduleBefore.status, 200);
    assert.equal(scheduleBefore.data.installments.length, 12);
    const previousFirstInstallmentId = Number(scheduleBefore.data.installments[0].id);

    const restructureFlow = await submitAndReviewHighRiskRequest(baseUrl, {
      loanId,
      action: "restructure",
      requestToken: adminToken,
      reviewToken: checkerToken,
      requestBody: {
        newTermWeeks: 6,
        note: "Restructure to a shorter plan and waive interest",
        waiveInterest: true,
      },
      reviewNote: "Approve restructure request for lifecycle verification",
    });
    assert.equal(restructureFlow.request.status, 200);
    assert.ok(Number(restructureFlow.approvalRequest?.id || 0) > 0);
    assert.equal(restructureFlow.review?.status, 200);
    assert.equal(String(restructureFlow.review?.data?.loan?.status), "restructured");
    assert.equal(Number(restructureFlow.review?.data?.loan?.term_weeks), 6);
    assert.equal(Number(restructureFlow.review?.data?.loan?.interest_rate), 0);
    const restructuredBalance = Number(restructureFlow.review?.data?.loan?.balance || 0);
    const restructuredExpectedTotal = Number(restructureFlow.review?.data?.loan?.expected_total || 0);
    assert.ok(restructuredBalance > 0);
    assert.ok(restructuredBalance <= previousBalance);
    assert.equal(restructuredExpectedTotal, restructuredBalance);
    assert.equal(Number(restructureFlow.review?.data?.loan?.repaid_total), 0);
    assert.equal(String(restructureFlow.review?.data?.execution?.transaction?.tx_type), "restructure");

    const scheduleAfter = await api(baseUrl, `/api/loans/${loanId}/schedule`, {
      token: adminToken,
    });
    assert.equal(scheduleAfter.status, 200);
    assert.equal(scheduleAfter.data.installments.length, 6);
    assert.ok(scheduleAfter.data.installments.every((item) => item.status === "pending"));
    assert.ok(Number(scheduleAfter.data.installments[0].id) !== previousFirstInstallmentId);
    assert.ok(new Date(scheduleAfter.data.installments[0].due_date).getTime() > Date.now());

    const transactions = await api(baseUrl, `/api/transactions?loanId=${loanId}&limit=50`, {
      token: adminToken,
    });
    assert.equal(transactions.status, 200);
    assert.ok(
      transactions.data.data.some((entry) => String(entry.tx_type) === "restructure"),
      "Expected transactions list to include a restructure event",
    );
  } finally {
    await stop();
  }
});

test("restructure after partial repayment resets schedule to the new contract only", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Restructure Partial Repayment Client",
        phone: "+2547000020012",
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data.id),
        principal: 1200,
        termWeeks: 8,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);

    const disbursement = await approveLoan(baseUrl, loanId, checkerToken, {
      notes: "Approve before restructure partial repayment regression",
    });
    assert.equal(disbursement.status, 200);

    const scheduleBefore = await api(baseUrl, `/api/loans/${loanId}/schedule`, {
      token: adminToken,
    });
    assert.equal(scheduleBefore.status, 200);

    const firstInstallmentDue = Number(scheduleBefore.data.installments[0].amount_due || 0);
    const secondInstallmentDue = Number(scheduleBefore.data.installments[1].amount_due || 0);
    const repaymentAmount = Number((firstInstallmentDue + (secondInstallmentDue / 2)).toFixed(2));

    const repayment = await api(baseUrl, `/api/loans/${loanId}/repayments`, {
      method: "POST",
      token: adminToken,
      body: {
        amount: repaymentAmount,
        note: "Partial repayment before restructure",
      },
    });
    assert.equal(repayment.status, 201);

    const restructureFlow = await submitAndReviewHighRiskRequest(baseUrl, {
      loanId,
      action: "restructure",
      requestToken: adminToken,
      reviewToken: checkerToken,
      requestBody: {
        newTermWeeks: 6,
        waiveInterest: true,
        note: "Restructure after partial repayment",
      },
      reviewNote: "Approve restructure after partial repayment",
    });
    assert.equal(restructureFlow.request.status, 200);
    assert.equal(restructureFlow.review?.status, 200);

    const loanAfterRestructure = await api(baseUrl, `/api/loans/${loanId}`, {
      token: adminToken,
    });
    assert.equal(loanAfterRestructure.status, 200);
    assert.equal(String(loanAfterRestructure.data.status), "restructured");
    assert.equal(Number(loanAfterRestructure.data.repaid_total || 0), 0);

    const scheduleAfterRestructure = await api(baseUrl, `/api/loans/${loanId}/schedule`, {
      token: adminToken,
    });
    assert.equal(scheduleAfterRestructure.status, 200);

    const totalDueCents = Math.round(Number(scheduleAfterRestructure.data.summary.total_due || 0) * 100);
    const totalPaidCents = Math.round(Number(scheduleAfterRestructure.data.summary.total_paid || 0) * 100);
    const balanceCents = Math.round(Number(loanAfterRestructure.data.balance || 0) * 100);
    const expectedTotalCents = Math.round(Number(loanAfterRestructure.data.expected_total || 0) * 100);

    assert.equal(Number(scheduleAfterRestructure.data.summary.total_installments || 0), 6);
    assert.equal(scheduleAfterRestructure.data.installments.length, 6);
    assert.equal(Number(scheduleAfterRestructure.data.installments[0].installment_number || 0), 1);
    assert.equal(Number(scheduleAfterRestructure.data.installments[5].installment_number || 0), 6);
    assert.equal(totalDueCents, expectedTotalCents);
    assert.equal(totalPaidCents, 0);
    assert.equal(totalDueCents - totalPaidCents, balanceCents);
    assert.equal(
      scheduleAfterRestructure.data.installments.some((row: Record<string, unknown>) => Number(row.amount_paid || 0) > 0),
      false,
    );
  } finally {
    await stop();
  }
});

test("loan products are admin-managed and loan origination derives pricing from product", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const branches = await api(baseUrl, "/api/branches?limit=20&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    const branchId = Number(branches.data.data[0].id);
    assert.ok(branchId > 0);

    const createOfficer = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Loan Product Officer",
        email: "loan.product.officer@example.com",
        password: "Password@123",
        role: "loan_officer",
        branchId,
      },
    });
    assert.equal(createOfficer.status, 201);

    const officerLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "loan.product.officer@example.com",
        password: "Password@123",
      },
    });
    assert.equal(officerLogin.status, 200);
    const officerToken = officerLogin.data.token;

    const officerLoanProductsDenied = await api(baseUrl, "/api/loan-products", {
      token: officerToken,
    });
    assert.equal(officerLoanProductsDenied.status, 200);

    const createLoanProduct = await api(baseUrl, "/api/loan-products", {
      method: "POST",
      token: adminToken,
      body: {
        name: "Agri Booster",
        interestRate: 30,
        interestAccrualMethod: "daily",
        registrationFee: 80,
        processingFee: 150,
        penaltyRateDaily: 1.5,
        penaltyFlatAmount: 50,
        penaltyGraceDays: 3,
        penaltyCapAmount: 250,
        penaltyCompoundingMethod: "compound",
        penaltyBaseAmount: "full_balance",
        penaltyCapPercentOfOutstanding: 12,
        minPrincipal: 500,
        maxPrincipal: 5000,
        minTermWeeks: 8,
        maxTermWeeks: 24,
        isActive: true,
      },
    });
    assert.equal(createLoanProduct.status, 201);
    const productId = Number(createLoanProduct.data.id);
    assert.ok(productId > 0);
    assert.equal(String(createLoanProduct.data.interest_accrual_method), "daily_eod");
    assert.equal(String(createLoanProduct.data.penalty_base_amount), "full_balance");
    assert.equal(Number(createLoanProduct.data.min_principal), 500);
    assert.equal(Number(createLoanProduct.data.max_principal), 5000);

    assert.ok(officerLoanProductsDenied.data.some((item: Record<string, unknown>) => Number(item.id) === productId) === false);

    const officerVisibleProducts = await api(baseUrl, "/api/loan-products", {
      token: officerToken,
    });
    assert.equal(officerVisibleProducts.status, 200);
    assert.ok(officerVisibleProducts.data.some((item: Record<string, unknown>) => Number(item.id) === productId));

    const updateLoanProduct = await api(baseUrl, `/api/loan-products/${productId}`, {
      method: "PATCH",
      token: adminToken,
      body: {
        processingFee: 200,
        penaltyFlatAmount: 75,
      },
    });
    assert.equal(updateLoanProduct.status, 200);
    assert.equal(Number(updateLoanProduct.data.processing_fee), 200);
    assert.equal(Number(updateLoanProduct.data.penalty_flat_amount), 75);

    const loanProducts = await api(baseUrl, "/api/loan-products?includeInactive=1", {
      token: adminToken,
    });
    assert.equal(loanProducts.status, 200);
    assert.ok(loanProducts.data.some((item) => Number(item.id) === productId));

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Loan Product Pricing Client",
        phone: "+254700002004",
        branchId,
        officerId: Number(createOfficer.data.id),
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data.id),
        productId,
        principal: 1000,
        termWeeks: 10,
      },
    });
    assert.equal(createLoan.status, 201);
    assert.equal(Number(createLoan.data.product_id), productId);
    assert.equal(Number(createLoan.data.interest_rate), 30);
    assert.equal(Number(createLoan.data.registration_fee), 80);
    assert.equal(Number(createLoan.data.processing_fee), 200);
    const expectedTotal = Number((1000 + (1000 * 0.3 * (10 / 52))).toFixed(2));
    assert.equal(Number(createLoan.data.expected_total), expectedTotal);

    const officerOverrideLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: officerToken,
      body: {
        clientId: Number(createClient.data.id),
        productId,
        principal: 900,
        termWeeks: 10,
        interestRate: 45,
      },
    });
    assert.equal(officerOverrideLoan.status, 403);
    assert.match(String(officerOverrideLoan.data?.message || ""), /override loan product pricing/i);

    const createHybridOfficer = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Loan Product Hybrid Override Officer",
        email: "loan.product.hybrid.override@example.com",
        password: "Password@123",
        roles: ["loan_officer", "finance"],
        branchId,
      },
    });
    assert.equal(createHybridOfficer.status, 201);

    const hybridOfficerLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "loan.product.hybrid.override@example.com",
        password: "Password@123",
      },
    });
    assert.equal(hybridOfficerLogin.status, 200);
    const hybridOfficerToken = hybridOfficerLogin.data.token;

    const createHybridClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: hybridOfficerToken,
      body: {
        fullName: "Loan Product Hybrid Override Client",
        phone: "+254700002444",
      },
    });
    assert.equal(createHybridClient.status, 201);

    const hybridOverrideLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: hybridOfficerToken,
      body: {
        clientId: Number(createHybridClient.data.id),
        productId,
        principal: 1200,
        termWeeks: 10,
        interestRate: 40,
      },
    });
    assert.equal(hybridOverrideLoan.status, 201);
    assert.equal(Number(hybridOverrideLoan.data.interest_rate), 40);

    const createClientAdminOverride = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Loan Product Admin Override Client",
        phone: "+254700002044",
      },
    });
    assert.equal(createClientAdminOverride.status, 201);

    const adminOverrideLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClientAdminOverride.data.id),
        productId,
        principal: 1000,
        termWeeks: 10,
        interestRate: 35,
        registrationFee: 50,
        processingFee: 120,
      },
    });
    assert.equal(adminOverrideLoan.status, 201);
    assert.equal(Number(adminOverrideLoan.data.interest_rate), 35);
    assert.equal(Number(adminOverrideLoan.data.registration_fee), 50);
    assert.equal(Number(adminOverrideLoan.data.processing_fee), 120);

    const deactivateProduct = await api(baseUrl, `/api/loan-products/${productId}/deactivate`, {
      method: "POST",
      token: adminToken,
    });
    assert.equal(deactivateProduct.status, 200);
    assert.equal(Number(deactivateProduct.data.is_active), 0);

    const createClientInactiveProduct = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Inactive Product Loan Client",
        phone: "+254700002045",
      },
    });
    assert.equal(createClientInactiveProduct.status, 201);

    const createLoanWithInactiveProduct = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClientInactiveProduct.data.id),
        productId,
        principal: 900,
        termWeeks: 10,
      },
    });
    assert.equal(createLoanWithInactiveProduct.status, 400);
    assert.match(String(createLoanWithInactiveProduct.data?.message || ""), /inactive/i);

    const activateProduct = await api(baseUrl, `/api/loan-products/${productId}/activate`, {
      method: "POST",
      token: adminToken,
    });
    assert.equal(activateProduct.status, 200);
    assert.equal(Number(activateProduct.data.is_active), 1);

    const createGuideProduct = await api(baseUrl, "/api/loan-products", {
      method: "POST",
      token: adminToken,
      body: {
        name: "Guide Income Booster",
        interestRate: 0,
        registrationFee: 200,
        processingFee: 500,
        pricingStrategy: "graduated_weekly_income",
        pricingConfig: {
          principalMin: 3000,
          principalMax: 30000,
          principalStep: 1000,
          supportedTerms: [5, 7, 10],
          weeklyInterestBase: 50,
          weeklyInterestRate: 0.05,
          registrationFee: 200,
          processingFee: 500,
        },
        minTermWeeks: 5,
        maxTermWeeks: 10,
        isActive: true,
      },
    });
    assert.equal(createGuideProduct.status, 201);
    assert.equal(String(createGuideProduct.data.pricing_strategy), "graduated_weekly_income");

    const guideProductId = Number(createGuideProduct.data.id);
    const createGuideClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Guide Pricing Client",
        phone: "+254700002046",
      },
    });
    assert.equal(createGuideClient.status, 201);

    const guideLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createGuideClient.data.id),
        productId: guideProductId,
        principal: 5000,
        termWeeks: 5,
      },
    });
    assert.equal(guideLoan.status, 201);
    assert.equal(Number(guideLoan.data.registration_fee), 200);
    assert.equal(Number(guideLoan.data.processing_fee), 500);
    assert.equal(Number(guideLoan.data.expected_total), 6500);
    assert.equal(Number(guideLoan.data.interest_rate), 312);

    const invalidGuideTermLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createGuideClient.data.id),
        productId: guideProductId,
        principal: 5000,
        termWeeks: 6,
      },
    });
    assert.equal(invalidGuideTermLoan.status, 400);
    assert.match(String(invalidGuideTermLoan.data?.message || ""), /termWeeks must be one of 5, 7, 10/i);

    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    const approveGuideLoan = await approveLoan(baseUrl, Number(guideLoan.data.id), checkerToken, {
      notes: "Approve guided pricing schedule",
    });
    assert.equal(approveGuideLoan.status, 200);

    const guideSchedule = await api(baseUrl, `/api/loans/${Number(guideLoan.data.id)}/schedule`, {
      token: adminToken,
    });
    assert.equal(guideSchedule.status, 200);
    assert.equal(Number(guideSchedule.data.summary.total_installments || 0), 5);
    assert.ok(
      guideSchedule.data.installments.every((row: Record<string, unknown>) => Number(row.amount_due || 0) === 1300),
      "Expected a 5000 guide loan over 5 weeks to schedule 1300 weekly installments",
    );

    const createClientOutOfRange = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Loan Product Range Client",
        phone: "+254700002005",
      },
    });
    assert.equal(createClientOutOfRange.status, 201);

    const createOutOfRangeLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClientOutOfRange.data.id),
        productId,
        principal: 900,
        termWeeks: 5,
      },
    });
    assert.equal(createOutOfRangeLoan.status, 400);
    assert.ok(String(createOutOfRangeLoan.data.message || "").includes("termWeeks must be between 8 and 24"));

    const createLowPrincipalLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClientOutOfRange.data.id),
        productId,
        principal: 499,
        termWeeks: 10,
      },
    });
    assert.equal(createLowPrincipalLoan.status, 400);
    assert.match(String(createLowPrincipalLoan.data?.message || ""), /principal must be between 500 and 5000/i);

    const createHighPrincipalLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClientOutOfRange.data.id),
        productId,
        principal: 5001,
        termWeeks: 10,
      },
    });
    assert.equal(createHighPrincipalLoan.status, 400);
    assert.match(String(createHighPrincipalLoan.data?.message || ""), /principal must be between 500 and 5000/i);
  } finally {
    await stop();
  }
});

test("loan origination blocks concurrent active or restructured loans per client", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Concurrent Loan Guard Client",
        phone: "+254700002006",
      },
    });
    assert.equal(createClient.status, 201);
    const clientId = Number(createClient.data.id);

    const createFirstLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId,
        principal: 1300,
        termWeeks: 12,
      },
    });
    assert.equal(createFirstLoan.status, 201);
    const firstLoanId = Number(createFirstLoan.data.id);

    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    const approveFirstLoan = await approveLoan(baseUrl, firstLoanId, checkerToken, {
      notes: "Approve first loan to activate concurrent-loan guard",
    });
    assert.equal(approveFirstLoan.status, 200);

    const createSecondLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId,
        principal: 900,
        termWeeks: 10,
      },
    });
    assert.equal(createSecondLoan.status, 409);
    assert.equal(
      createSecondLoan.data.message,
      "Client already has an active loan. Concurrent active loans are not allowed.",
    );
  } finally {
    await stop();
  }
});

test("loan origination allows concurrent active loans when ALLOW_CONCURRENT_LOANS=true", async () => {
  const { baseUrl, stop } = await startServer({
    envOverrides: {
      ALLOW_CONCURRENT_LOANS: "true",
    },
  });

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Concurrent Loan Toggle Client",
        phone: "+254700002606",
      },
    });
    assert.equal(createClient.status, 201);
    const clientId = Number(createClient.data.id);

    const createFirstLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId,
        principal: 1300,
        termWeeks: 12,
      },
    });
    assert.equal(createFirstLoan.status, 201);
    const firstLoanId = Number(createFirstLoan.data.id);

    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    const approveFirstLoan = await approveLoan(baseUrl, firstLoanId, checkerToken, {
      notes: "Approve first loan to confirm concurrent loan env override",
    });
    assert.equal(approveFirstLoan.status, 200);

    const createSecondLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId,
        principal: 900,
        termWeeks: 10,
      },
    });
    assert.equal(createSecondLoan.status, 201);
    assert.equal(Number(createSecondLoan.data.client_id), clientId);
    assert.equal(String(createSecondLoan.data.status), "pending_approval");
  } finally {
    await stop();
  }
});

test("loan origination requires an explicit or inherited branch assignment", async () => {
  const { baseUrl, stop, dbFilePath } = await startServer();

  try {
    assert.ok(dbFilePath, "Expected sqlite database path");
    const adminToken = await loginAsAdmin(baseUrl);

    const createUnassignedAdmin = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Unassigned Branch Admin",
        email: "loan.branch.required.admin@example.com",
        password: "Password@123",
        role: "admin",
      },
    });
    assert.equal(createUnassignedAdmin.status, 201);

    const unassignedAdminLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "loan.branch.required.admin@example.com",
        password: "Password@123",
      },
    });
    assert.equal(unassignedAdminLogin.status, 200);
    const unassignedAdminToken = unassignedAdminLogin.data.token;

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: unassignedAdminToken,
      body: {
        fullName: "Branch Required Client",
        phone: "+254700002607",
      },
    });
    assert.equal(createClient.status, 201);
    const clientId = Number(createClient.data.id);
    assert.ok(clientId > 0);

    const db = new Database(String(dbFilePath));
    try {
      db.prepare("UPDATE clients SET branch_id = NULL, updated_at = datetime('now') WHERE id = ?").run(clientId);
    } finally {
      db.close();
    }

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: unassignedAdminToken,
      body: {
        clientId,
        principal: 1400,
        termWeeks: 10,
      },
    });
    assert.equal(createLoan.status, 400);
    assert.match(String(createLoan.data?.message || ""), /loan branch is required/i);
  } finally {
    await stop();
  }
});

test("rejection metadata is visible in my-pending and loans list responses", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const branches = await api(baseUrl, "/api/branches?limit=20&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    const branchId = Number(branches.data.data[0].id);
    assert.ok(branchId > 0);

    const createOfficer = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Rejected Queue Officer",
        email: "rejected.queue.officer@example.com",
        password: "Password@123",
        role: "loan_officer",
        branchId,
      },
    });
    assert.equal(createOfficer.status, 201);

    const officerLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "rejected.queue.officer@example.com",
        password: "Password@123",
      },
    });
    assert.equal(officerLogin.status, 200);
    const officerToken = officerLogin.data.token;

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: officerToken,
      body: {
        fullName: "Rejected Queue Client",
        phone: "+254700002007",
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: officerToken,
      body: {
        clientId: Number(createClient.data.id),
        principal: 1200,
        termWeeks: 12,
      },
    });
    assert.equal(createLoan.status, 201);
    const rejectedLoanId = Number(createLoan.data.id);

    const rejectLoan = await api(baseUrl, `/api/loans/${rejectedLoanId}/reject`, {
      method: "POST",
      token: adminToken,
      body: {
        reason: "Missing mandatory documentation",
      },
    });
    assert.equal(rejectLoan.status, 200);

    const myPending = await api(baseUrl, "/api/loans/my-pending?limit=20&sortBy=createdAt&sortOrder=desc", {
      token: officerToken,
    });
    assert.equal(myPending.status, 200);
    const rejectedRow = myPending.data.data.find((row) => Number(row.loan_id) === rejectedLoanId);
    assert.ok(rejectedRow, "Expected rejected loan to be visible in officer queue");
    assert.equal(String(rejectedRow.status), "rejected");
    assert.equal(String(rejectedRow.rejection_reason), "Missing mandatory documentation");
    assert.ok(String(rejectedRow.rejected_at || "").length > 0);
    assert.ok(Number(rejectedRow.rejected_by_user_id || 0) > 0);

    const loanList = await api(baseUrl, `/api/loans?loanId=${rejectedLoanId}`, {
      token: officerToken,
    });
    assert.equal(loanList.status, 200);
    assert.equal(Number(loanList.data.paging?.total || 0), 1);
    assert.equal(String(loanList.data.data[0].status), "rejected");
    assert.equal(String(loanList.data.data[0].rejection_reason), "Missing mandatory documentation");
    assert.ok(Number(loanList.data.data[0].rejected_by_user_id || 0) > 0);
    assert.ok(String(loanList.data.data[0].rejected_at || "").length > 0);
  } finally {
    await stop();
  }
});

test("loan lifecycle routes enforce roles and valid status transitions", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const branches = await api(baseUrl, "/api/branches?limit=200&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    const branchId = Number(branches.data.data[0].id);

    const createOpsManager = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Loan Lifecycle Ops Manager",
        email: "loan.lifecycle.ops.manager@example.com",
        password: "Password@123",
        role: "operations_manager",
        branchId,
      },
    });
    assert.equal(createOpsManager.status, 201);

    const createFinance = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Loan Lifecycle Finance",
        email: "loan.lifecycle.finance@example.com",
        password: "Password@123",
        role: "finance",
      },
    });
    assert.equal(createFinance.status, 201);

    const opsLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "loan.lifecycle.ops.manager@example.com",
        password: "Password@123",
      },
    });
    assert.equal(opsLogin.status, 200);
    const opsToken = opsLogin.data.token;

    const financeLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "loan.lifecycle.finance@example.com",
        password: "Password@123",
      },
    });
    assert.equal(financeLogin.status, 200);
    const financeToken = financeLogin.data.token;

    const createClientA = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Lifecycle Client A",
        phone: "+254700002011",
        branchId,
      },
    });
    assert.equal(createClientA.status, 201);

    const createLoanA = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClientA.data.id),
        principal: 1400,
        termWeeks: 12,
      },
    });
    assert.equal(createLoanA.status, 201);
    const loanAId = Number(createLoanA.data.id);

    const approveLoanA = await approveLoan(baseUrl, loanAId, opsToken, {
      notes: "Approve lifecycle loan A",
    });
    assert.equal(approveLoanA.status, 200);

    const opsRestructureFlow = await submitAndReviewHighRiskRequest(baseUrl, {
      loanId: loanAId,
      action: "restructure",
      requestToken: opsToken,
      reviewToken: financeToken,
      requestBody: {
        newTermWeeks: 10,
        note: "Ops-managed restructure",
      },
      reviewNote: "Finance review of operations restructure request",
    });
    assert.equal(opsRestructureFlow.request.status, 200);
    assert.ok(Number(opsRestructureFlow.approvalRequest?.id || 0) > 0);
    assert.equal(opsRestructureFlow.review?.status, 200);
    assert.equal(opsRestructureFlow.review?.data?.loan?.status, "restructured");

    const createClientB = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Lifecycle Client B",
        phone: "+254700002012",
        branchId,
      },
    });
    assert.equal(createClientB.status, 201);

    const createLoanB = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClientB.data.id),
        principal: 1600,
        termWeeks: 12,
      },
    });
    assert.equal(createLoanB.status, 201);
    const loanBId = Number(createLoanB.data.id);

    const approveLoanB = await approveLoan(baseUrl, loanBId, opsToken, {
      notes: "Approve lifecycle loan B",
    });
    assert.equal(approveLoanB.status, 200);

    const opsWriteOffDenied = await api(baseUrl, `/api/loans/${loanBId}/write-off`, {
      method: "POST",
      token: opsToken,
      body: {
        note: "Should be denied for operations_manager",
      },
    });
    assert.equal(opsWriteOffDenied.status, 403);

    const financeWriteOffFlow = await submitAndReviewHighRiskRequest(baseUrl, {
      loanId: loanBId,
      action: "write-off",
      requestToken: financeToken,
      reviewToken: opsToken,
      requestBody: {
        note: "Finance approved write-off",
      },
      reviewNote: "Operations review of finance write-off request",
    });
    assert.equal(financeWriteOffFlow.request.status, 200);
    assert.ok(Number(financeWriteOffFlow.approvalRequest?.id || 0) > 0);
    assert.equal(financeWriteOffFlow.review?.status, 200);
    assert.equal(financeWriteOffFlow.review?.data?.loan?.status, "written_off");

    const financeRestructureWrittenOff = await api(baseUrl, `/api/loans/${loanBId}/restructure`, {
      method: "POST",
      token: financeToken,
      body: {
        newTermWeeks: 8,
        note: "Should fail because loan is written off",
      },
    });
    assert.equal(financeRestructureWrittenOff.status, 409);
  } finally {
    await stop();
  }
});

test("loan officer reassignment updates assignment, records audit log, and invalidates report cache", async () => {
  const { baseUrl, stop } = await startServer({
    envOverrides: {
      REPORT_CACHE_ENABLED: "true",
      REPORT_CACHE_TTL_MS: "600000",
    },
  });

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const branches = await api(baseUrl, "/api/branches?limit=200&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    const branchId = Number(branches.data.data[0].id);
    assert.ok(branchId > 0);

    const createOfficerA = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Assignment Officer A",
        email: "loan.assignment.officer.a@example.com",
        password: "Password@123",
        role: "loan_officer",
        branchId,
      },
    });
    assert.equal(createOfficerA.status, 201);
    const officerAId = Number(createOfficerA.data.id);

    const createOfficerB = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Assignment Officer B",
        email: "loan.assignment.officer.b@example.com",
        password: "Password@123",
        role: "loan_officer",
        branchId,
      },
    });
    assert.equal(createOfficerB.status, 201);
    const officerBId = Number(createOfficerB.data.id);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Assignment Flow Client",
        phone: "+254700002031",
        branchId,
      },
    });
    assert.equal(createClient.status, 201);
    const clientId = Number(createClient.data.id);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId,
        principal: 1500,
        termWeeks: 10,
        branchId,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);

    const assignOfficerA = await api(baseUrl, `/api/loans/${loanId}/assign-officer`, {
      method: "PATCH",
      token: adminToken,
      body: {
        officerId: officerAId,
      },
    });
    assert.equal(assignOfficerA.status, 200);
    assert.equal(Number(assignOfficerA.data.loan.officer_id), officerAId);

    const metricsBefore = await api(baseUrl, "/health/details");
    assert.equal(metricsBefore.status, 200);
    const invalidationsBefore = Number(metricsBefore.data.metrics?.reportCache?.invalidations || 0);

    const assignOfficerB = await api(baseUrl, `/api/loans/${loanId}/assign-officer`, {
      method: "PATCH",
      token: adminToken,
      body: {
        officerId: officerBId,
      },
    });
    assert.equal(assignOfficerB.status, 200);
    assert.equal(Number(assignOfficerB.data.loan.officer_id), officerBId);

    const metricsAfter = await api(baseUrl, "/health/details");
    assert.equal(metricsAfter.status, 200);
    const invalidationsAfter = Number(metricsAfter.data.metrics?.reportCache?.invalidations || 0);
    assert.ok(invalidationsAfter > invalidationsBefore);

    const auditLogs = await api(
      baseUrl,
      `/api/audit-logs?action=${encodeURIComponent("loan.officer.reassigned")}&targetType=loan&targetId=${loanId}&limit=20&offset=0`,
      { token: adminToken },
    );
    assert.equal(auditLogs.status, 200);
    assert.ok(Array.isArray(auditLogs.data.data));

    const matchingLog = auditLogs.data.data.find((row) => {
      try {
        const details = JSON.parse(String(row.details || "{}"));
        return Number(details.previousOfficerId) === officerAId && Number(details.nextOfficerId) === officerBId;
      } catch (_error) {
        return false;
      }
    });
    assert.ok(matchingLog, "Expected reassignment audit log with previous and next officer ids");
  } finally {
    await stop();
  }
});

test("loan officer reassignment permits operations and area managers and blocks loan officers", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const branches = await api(baseUrl, "/api/branches?limit=200&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    const branchId = Number(branches.data.data[0].id);
    const regionId = Number(branches.data.data[0].region_id);
    assert.ok(branchId > 0);
    assert.ok(regionId > 0);

    const createOfficerA = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Role Matrix Officer A",
        email: "loan.assign.role.officer.a@example.com",
        password: "Password@123",
        role: "loan_officer",
        branchId,
      },
    });
    assert.equal(createOfficerA.status, 201);
    const officerAId = Number(createOfficerA.data.id);

    const createOfficerB = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Role Matrix Officer B",
        email: "loan.assign.role.officer.b@example.com",
        password: "Password@123",
        role: "loan_officer",
        branchId,
      },
    });
    assert.equal(createOfficerB.status, 201);
    const officerBId = Number(createOfficerB.data.id);

    const createOperationsManager = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Role Matrix Operations Manager",
        email: "loan.assign.role.ops@example.com",
        password: "Password@123",
        role: "operations_manager",
        branchId,
      },
    });
    assert.equal(createOperationsManager.status, 201);

    const createAreaManager = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Role Matrix Area Manager",
        email: "loan.assign.role.area@example.com",
        password: "Password@123",
        role: "area_manager",
        branchIds: [branchId],
        primaryRegionId: regionId,
      },
    });
    assert.equal(createAreaManager.status, 201);

    const officerLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "loan.assign.role.officer.a@example.com",
        password: "Password@123",
      },
    });
    assert.equal(officerLogin.status, 200);
    const officerToken = officerLogin.data.token;

    const operationsManagerLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "loan.assign.role.ops@example.com",
        password: "Password@123",
      },
    });
    assert.equal(operationsManagerLogin.status, 200);
    const operationsManagerToken = operationsManagerLogin.data.token;

    const areaManagerLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "loan.assign.role.area@example.com",
        password: "Password@123",
      },
    });
    assert.equal(areaManagerLogin.status, 200);
    const areaManagerToken = areaManagerLogin.data.token;

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Role Matrix Client",
        phone: "+254700002041",
        branchId,
      },
    });
    assert.equal(createClient.status, 201);
    const clientId = Number(createClient.data.id);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId,
        principal: 1800,
        termWeeks: 12,
        branchId,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);

    const officerDenied = await api(baseUrl, `/api/loans/${loanId}/assign-officer`, {
      method: "PATCH",
      token: officerToken,
      body: {
        officerId: officerBId,
      },
    });
    assert.equal(officerDenied.status, 403);

    const operationsManagerAllowed = await api(baseUrl, `/api/loans/${loanId}/assign-officer`, {
      method: "PATCH",
      token: operationsManagerToken,
      body: {
        officerId: officerAId,
      },
    });
    assert.equal(operationsManagerAllowed.status, 200);
    assert.equal(Number(operationsManagerAllowed.data.loan.officer_id), officerAId);

    const areaManagerAllowed = await api(baseUrl, `/api/loans/${loanId}/assign-officer`, {
      method: "PATCH",
      token: areaManagerToken,
      body: {
        officerId: officerBId,
      },
    });
    assert.equal(areaManagerAllowed.status, 200);
    assert.equal(Number(areaManagerAllowed.data.loan.officer_id), officerBId);
  } finally {
    await stop();
  }
});

test("pending approval queue supports manager filters and scope-aware visibility", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const branches = await api(baseUrl, "/api/branches?limit=200&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    assert.ok(Array.isArray(branches.data.data));
    assert.ok(branches.data.data.length >= 2, "Expected at least two seeded branches");

    const branchA = branches.data.data[0];
    const branchB = branches.data.data.find((row) => Number(row.id) !== Number(branchA.id));
    assert.ok(branchB, "Expected a second distinct branch");

    const branchAId = Number(branchA.id);
    const branchBId = Number(branchB.id);
    const branchARegionId = Number(branchA.region_id);
    assert.ok(branchAId > 0);
    assert.ok(branchBId > 0);
    assert.ok(branchARegionId > 0);

    const createOfficerA = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Queue Filter Officer A",
        email: "loan.queue.officer.a@example.com",
        password: "Password@123",
        role: "loan_officer",
        branchId: branchAId,
      },
    });
    assert.equal(createOfficerA.status, 201);
    const officerAId = Number(createOfficerA.data.id);

    const createOfficerB = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Queue Filter Officer B",
        email: "loan.queue.officer.b@example.com",
        password: "Password@123",
        role: "loan_officer",
        branchId: branchBId,
      },
    });
    assert.equal(createOfficerB.status, 201);
    const officerBId = Number(createOfficerB.data.id);

    const createOperationsManager = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Queue Filter Operations Manager",
        email: "loan.queue.ops.manager@example.com",
        password: "Password@123",
        role: "operations_manager",
        branchId: branchAId,
      },
    });
    assert.equal(createOperationsManager.status, 201);

    const createAreaManager = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Queue Filter Area Manager",
        email: "loan.queue.area.manager@example.com",
        password: "Password@123",
        role: "area_manager",
        branchIds: [branchAId],
        primaryRegionId: branchARegionId,
      },
    });
    assert.equal(createAreaManager.status, 201);

    const officerALogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "loan.queue.officer.a@example.com",
        password: "Password@123",
      },
    });
    assert.equal(officerALogin.status, 200);
    const officerAToken = officerALogin.data.token;

    const officerBLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "loan.queue.officer.b@example.com",
        password: "Password@123",
      },
    });
    assert.equal(officerBLogin.status, 200);
    const officerBToken = officerBLogin.data.token;

    const operationsManagerLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "loan.queue.ops.manager@example.com",
        password: "Password@123",
      },
    });
    assert.equal(operationsManagerLogin.status, 200);
    const operationsManagerToken = operationsManagerLogin.data.token;

    const areaManagerLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "loan.queue.area.manager@example.com",
        password: "Password@123",
      },
    });
    assert.equal(areaManagerLogin.status, 200);
    const areaManagerToken = areaManagerLogin.data.token;

    const createClientA1 = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: officerAToken,
      body: {
        fullName: "Queue Client A1",
        phone: "+254700002051",
      },
    });
    assert.equal(createClientA1.status, 201);
    const clientA1Id = Number(createClientA1.data.id);

    const createLoanA1 = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: officerAToken,
      body: {
        clientId: clientA1Id,
        principal: 1300,
        termWeeks: 8,
      },
    });
    assert.equal(createLoanA1.status, 201);
    const loanA1Id = Number(createLoanA1.data.id);

    const createClientA2 = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: officerAToken,
      body: {
        fullName: "Queue Client A2",
        phone: "+254700002052",
      },
    });
    assert.equal(createClientA2.status, 201);
    const clientA2Id = Number(createClientA2.data.id);

    const createLoanA2 = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: officerAToken,
      body: {
        clientId: clientA2Id,
        principal: 1450,
        termWeeks: 10,
      },
    });
    assert.equal(createLoanA2.status, 201);
    const loanA2Id = Number(createLoanA2.data.id);

    const approveLoanA2 = await approveLoan(baseUrl, loanA2Id, adminToken, {
      notes: "Approved so it must be excluded from pending queue",
    });
    assert.equal(approveLoanA2.status, 200);

    const createClientB1 = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: officerBToken,
      body: {
        fullName: "Queue Client B1",
        phone: "+254700002053",
      },
    });
    assert.equal(createClientB1.status, 201);
    const clientB1Id = Number(createClientB1.data.id);

    const createLoanB1 = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: officerBToken,
      body: {
        clientId: clientB1Id,
        principal: 1650,
        termWeeks: 12,
      },
    });
    assert.equal(createLoanB1.status, 201);
    const loanB1Id = Number(createLoanB1.data.id);

    const adminQueue = await api(baseUrl, "/api/loans/pending-approval?limit=50&sortBy=loanId&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(adminQueue.status, 200);
    const adminPendingIds = adminQueue.data.data.map((row) => Number(row.loan_id));
    assert.ok(adminPendingIds.includes(loanA1Id), "Expected branch A pending loan in admin queue");
    assert.ok(adminPendingIds.includes(loanB1Id), "Expected branch B pending loan in admin queue");
    assert.ok(!adminPendingIds.includes(loanA2Id), "Expected approved loan to be excluded");

    const adminBranchFilter = await api(baseUrl, `/api/loans/pending-approval?branchId=${branchAId}&limit=50`, {
      token: adminToken,
    });
    assert.equal(adminBranchFilter.status, 200);
    const branchFilteredIds = adminBranchFilter.data.data.map((row) => Number(row.loan_id));
    assert.deepEqual(branchFilteredIds, [loanA1Id]);

    const adminOfficerFilter = await api(baseUrl, `/api/loans/pending-approval?officerId=${officerBId}&limit=50`, {
      token: adminToken,
    });
    assert.equal(adminOfficerFilter.status, 200);
    const officerFilteredIds = adminOfficerFilter.data.data.map((row) => Number(row.loan_id));
    assert.deepEqual(officerFilteredIds, [loanB1Id]);

    const futureDateFrom = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const adminFutureFilter = await api(
      baseUrl,
      `/api/loans/pending-approval?dateFrom=${encodeURIComponent(futureDateFrom)}&limit=50`,
      { token: adminToken },
    );
    assert.equal(adminFutureFilter.status, 200);
    assert.equal(Number(adminFutureFilter.data.total || 0), 0);

    const invalidOfficerFilter = await api(baseUrl, "/api/loans/pending-approval?officerId=abc", {
      token: adminToken,
    });
    assert.equal(invalidOfficerFilter.status, 400);

    const invalidDateRange = await api(
      baseUrl,
      `/api/loans/pending-approval?dateFrom=${encodeURIComponent(futureDateFrom)}&dateTo=${encodeURIComponent(new Date().toISOString())}`,
      { token: adminToken },
    );
    assert.equal(invalidDateRange.status, 400);

    const operationsQueue = await api(baseUrl, "/api/loans/pending-approval?limit=50&sortBy=loanId&sortOrder=asc", {
      token: operationsManagerToken,
    });
    assert.equal(operationsQueue.status, 200);
    const operationsPendingIds = operationsQueue.data.data.map((row) => Number(row.loan_id));
    assert.deepEqual(operationsPendingIds, [loanA1Id]);

    const areaQueue = await api(baseUrl, "/api/loans/pending-approval?limit=50&sortBy=loanId&sortOrder=asc", {
      token: areaManagerToken,
    });
    assert.equal(areaQueue.status, 200);
    const areaPendingIds = areaQueue.data.data.map((row) => Number(row.loan_id));
    assert.deepEqual(areaPendingIds, [loanA1Id]);

    const areaOutsideScope = await api(baseUrl, `/api/loans/pending-approval?branchId=${branchBId}`, {
      token: areaManagerToken,
    });
    assert.equal(areaOutsideScope.status, 403);

    const loanOfficerDenied = await api(baseUrl, "/api/loans/pending-approval", {
      token: officerAToken,
    });
    assert.equal(loanOfficerDenied.status, 403);
  } finally {
    await stop();
  }
});

test("loan statement and repayment receipt endpoints return detailed JSON payloads", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const branches = await api(baseUrl, "/api/branches?limit=200&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    const branchId = Number(branches.data.data[0].id);
    assert.ok(branchId > 0);

    const createOfficer = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Statement Officer",
        email: "loan.statement.officer@example.com",
        password: "Password@123",
        role: "loan_officer",
        branchId,
      },
    });
    assert.equal(createOfficer.status, 201);

    const officerLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "loan.statement.officer@example.com",
        password: "Password@123",
      },
    });
    assert.equal(officerLogin.status, 200);
    const officerToken = officerLogin.data.token;

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: officerToken,
      body: {
        fullName: "Statement Client",
        phone: "+254700002061",
      },
    });
    assert.equal(createClient.status, 201);
    const clientId = Number(createClient.data.id);
    assert.ok(clientId > 0);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: officerToken,
      body: {
        clientId,
        principal: 2000,
        termWeeks: 6,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);
    assert.ok(loanId > 0);

    const approveCreatedLoan = await approveLoan(baseUrl, loanId, adminToken, {
      notes: "Approve for statement and receipt validation",
    });
    assert.equal(approveCreatedLoan.status, 200);

    const createRepayment = await api(baseUrl, `/api/loans/${loanId}/repayments`, {
      method: "POST",
      token: officerToken,
      body: {
        amount: 300,
        note: "Receipt endpoint validation payment",
        paymentChannel: "bank_transfer",
        paymentProvider: "KCB",
        externalReceipt: "DEP-300-XYZ",
        externalReference: "STMT-4491",
        payerPhone: "+254700002061",
      },
    });
    assert.equal(createRepayment.status, 201);
    const repaymentId = Number(createRepayment.data.repayment.id);
    assert.ok(repaymentId > 0);
    assert.equal(createRepayment.data.repayment.payment_channel, "bank_transfer");
    assert.equal(createRepayment.data.repayment.payment_provider, "KCB");
    assert.equal(createRepayment.data.repayment.external_receipt, "DEP-300-XYZ");
    assert.equal(createRepayment.data.repayment.external_reference, "STMT-4491");
    assert.equal(createRepayment.data.repayment.payer_phone, "+254700002061");

    const statement = await api(baseUrl, `/api/loans/${loanId}/statement?format=json`, {
      token: officerToken,
    });
    assert.equal(statement.status, 200);
    assert.equal(statement.data.format, "json");
    assert.equal(Number(statement.data.loan.id), loanId);
    assert.ok(Array.isArray(statement.data.amortization));
    assert.equal(statement.data.amortization.length, 6);
    assert.ok(Array.isArray(statement.data.repayments));
    assert.ok(statement.data.repayments.some((row) => Number(row.id) === repaymentId));
    const statementRepayment = statement.data.repayments.find((row) => Number(row.id) === repaymentId);
    assert.equal(statementRepayment?.payment_channel, "bank_transfer");
    assert.equal(statementRepayment?.payment_provider, "KCB");
    assert.equal(statementRepayment?.external_receipt, "DEP-300-XYZ");
    assert.equal(statementRepayment?.external_reference, "STMT-4491");
    assert.equal(statementRepayment?.payer_phone, "+254700002061");
    assert.equal(Number(statement.data.summary.repayment_count || 0), 1);
    assert.equal(Number(statement.data.summary.total_repayments || 0), 300);

    const repayments = await api(baseUrl, `/api/loans/${loanId}/repayments`, {
      token: officerToken,
    });
    assert.equal(repayments.status, 200);
    assert.ok(Array.isArray(repayments.data));
    assert.equal(repayments.data[0]?.payment_channel, "bank_transfer");
    assert.equal(repayments.data[0]?.external_receipt, "DEP-300-XYZ");

    const receipt = await api(baseUrl, `/api/repayments/${repaymentId}/receipt?format=json`, {
      token: officerToken,
    });
    assert.equal(receipt.status, 200);
    assert.equal(receipt.data.format, "json");
    assert.equal(Number(receipt.data.receipt.repayment_id), repaymentId);
    assert.equal(Number(receipt.data.receipt.loan_id), loanId);
    assert.equal(Number(receipt.data.receipt.amount || 0), 300);
    assert.ok(String(receipt.data.receipt.receipt_number || "").startsWith("RCP-"));
    assert.equal(receipt.data.receipt.payment_channel, "bank_transfer");
    assert.equal(receipt.data.receipt.payment_provider, "KCB");
    assert.equal(receipt.data.receipt.external_receipt, "DEP-300-XYZ");
    assert.equal(receipt.data.receipt.external_reference, "STMT-4491");
    assert.equal(receipt.data.receipt.payer_phone, "+254700002061");
    assert.equal(
      Number(receipt.data.receipt.outstanding_balance_after_receipt || 0),
      Number((Number(receipt.data.receipt.expected_total || 0) - 300).toFixed(2)),
    );

    const statementPdf = await api(baseUrl, `/api/loans/${loanId}/statement?format=pdf`, {
      token: officerToken,
    });
    assert.equal(statementPdf.status, 501);

    const receiptPdf = await api(baseUrl, `/api/repayments/${repaymentId}/receipt?format=pdf`, {
      token: officerToken,
    });
    assert.equal(receiptPdf.status, 501);

    const invalidStatementFormat = await api(baseUrl, `/api/loans/${loanId}/statement?format=xml`, {
      token: officerToken,
    });
    assert.equal(invalidStatementFormat.status, 400);
  } finally {
    await stop();
  }
});

test("statement and receipt endpoints enforce branch scope", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const branches = await api(baseUrl, "/api/branches?limit=200&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    assert.ok(Array.isArray(branches.data.data));
    assert.ok(branches.data.data.length >= 2, "Expected at least two seeded branches");

    const branchA = branches.data.data[0];
    const branchB = branches.data.data.find((row) => Number(row.id) !== Number(branchA.id));
    assert.ok(branchB, "Expected a second distinct branch");

    const branchAId = Number(branchA.id);
    const branchBId = Number(branchB.id);
    assert.ok(branchAId > 0);
    assert.ok(branchBId > 0);

    const createOfficerA = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Scope Test Officer A",
        email: "loan.statement.scope.officer.a@example.com",
        password: "Password@123",
        role: "loan_officer",
        branchId: branchAId,
      },
    });
    assert.equal(createOfficerA.status, 201);

    const createOfficerB = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Scope Test Officer B",
        email: "loan.statement.scope.officer.b@example.com",
        password: "Password@123",
        role: "loan_officer",
        branchId: branchBId,
      },
    });
    assert.equal(createOfficerB.status, 201);

    const officerALogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "loan.statement.scope.officer.a@example.com",
        password: "Password@123",
      },
    });
    assert.equal(officerALogin.status, 200);
    const officerAToken = officerALogin.data.token;

    const officerBLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "loan.statement.scope.officer.b@example.com",
        password: "Password@123",
      },
    });
    assert.equal(officerBLogin.status, 200);
    const officerBToken = officerBLogin.data.token;

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: officerAToken,
      body: {
        fullName: "Scope Statement Client",
        phone: "+254700002071",
      },
    });
    assert.equal(createClient.status, 201);
    const clientId = Number(createClient.data.id);
    assert.ok(clientId > 0);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: officerAToken,
      body: {
        clientId,
        principal: 2200,
        termWeeks: 8,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);
    assert.ok(loanId > 0);

    const approveCreatedLoan = await approveLoan(baseUrl, loanId, adminToken, {
      notes: "Approve for scope checks",
    });
    assert.equal(approveCreatedLoan.status, 200);

    const createRepayment = await api(baseUrl, `/api/loans/${loanId}/repayments`, {
      method: "POST",
      token: officerAToken,
      body: {
        amount: 400,
        note: "Scope check repayment",
      },
    });
    assert.equal(createRepayment.status, 201);
    const repaymentId = Number(createRepayment.data.repayment.id);
    assert.ok(repaymentId > 0);

    const outOfScopeStatement = await api(baseUrl, `/api/loans/${loanId}/statement`, {
      token: officerBToken,
    });
    assert.equal(outOfScopeStatement.status, 403);

    const outOfScopeReceipt = await api(baseUrl, `/api/repayments/${repaymentId}/receipt`, {
      token: officerBToken,
    });
    assert.equal(outOfScopeReceipt.status, 403);
  } finally {
    await stop();
  }
});

test("disbursement and repayment create balanced double-entry journals", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "GL Posting Client",
        phone: "+254700002081",
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data.id),
        principal: 1500,
        termWeeks: 6,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);

    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    const approveCreatedLoan = await api(baseUrl, `/api/loans/${loanId}/approve`, {
      method: "POST",
      token: checkerToken,
      body: { notes: "GL approval" },
    });
    assert.equal(approveCreatedLoan.status, 200);

    const disburseLoan = await api(baseUrl, `/api/loans/${loanId}/disburse`, {
      method: "POST",
      token: adminToken,
      body: { notes: "GL disbursement" },
    });
    assert.equal(disburseLoan.status, 200);

    const recordRepayment = await api(baseUrl, `/api/loans/${loanId}/repayments`, {
      method: "POST",
      token: adminToken,
      body: {
        amount: 300,
        note: "GL repayment",
      },
    });
    assert.equal(recordRepayment.status, 201);

    const loanJournals = await api(baseUrl, `/api/loans/${loanId}/gl-journals`, {
      token: adminToken,
    });
    assert.equal(loanJournals.status, 200);
    assert.ok(Array.isArray(loanJournals.data.journals));
    assert.ok(loanJournals.data.journals.length >= 2);

    const disbursementJournal = loanJournals.data.journals.find((row) => row.reference_type === "loan_disbursement");
    assert.ok(disbursementJournal, "Expected disbursement GL journal");
    assert.equal(
      Number(disbursementJournal.total_debit || 0),
      Number(disbursementJournal.total_credit || 0),
      "Disbursement journal must be balanced",
    );
    assert.ok(
      disbursementJournal.entries.some((line) => line.account_code === "LOAN_RECEIVABLE" && line.side === "debit"),
    );
    assert.ok(disbursementJournal.entries.some((line) => line.account_code === "CASH" && line.side === "credit"));

    const repaymentJournal = loanJournals.data.journals.find((row) => row.reference_type === "loan_repayment");
    assert.ok(repaymentJournal, "Expected repayment GL journal");
    assert.equal(
      Number(repaymentJournal.total_debit || 0),
      Number(repaymentJournal.total_credit || 0),
      "Repayment journal must be balanced",
    );
    assert.deepEqual(
      repaymentJournal.entries.map((line) => [line.account_code, line.side, Number(line.amount || 0)]),
      [
        ["CASH", "debit", 300],
        ["LOAN_RECEIVABLE", "credit", 300],
      ],
    );
  } finally {
    await stop();
  }
});

test("write-off creates balanced write-off journal entries", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Write-off GL Client",
        phone: "+254700002082",
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data.id),
        principal: 1200,
        termWeeks: 8,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);

    const approveCreatedLoan = await approveLoan(baseUrl, loanId, checkerToken, {
      notes: "approve before write-off",
    });
    assert.equal(approveCreatedLoan.status, 200);

    const writeOffFlow = await submitAndReviewHighRiskRequest(baseUrl, {
      loanId,
      action: "write-off",
      requestToken: adminToken,
      reviewToken: checkerToken,
      requestBody: {
        note: "Unrecoverable account",
      },
      reviewNote: "Admin review for write-off journal validation",
    });
    assert.equal(writeOffFlow.request.status, 200);
    assert.ok(Number(writeOffFlow.approvalRequest?.id || 0) > 0);
    assert.equal(writeOffFlow.review?.status, 200);

    const loanJournals = await api(baseUrl, `/api/loans/${loanId}/gl-journals`, {
      token: adminToken,
    });
    assert.equal(loanJournals.status, 200);

    const writeOffJournal = loanJournals.data.journals.find((row) => row.reference_type === "loan_write_off");
    assert.ok(writeOffJournal, "Expected write-off GL journal");
    assert.equal(Number(writeOffJournal.total_debit || 0), Number(writeOffJournal.total_credit || 0));
    assert.ok(
      writeOffJournal.entries.some((line) => line.account_code === "WRITE_OFF_EXPENSE" && line.side === "debit"),
    );
    assert.ok(
      writeOffJournal.entries.some((line) => line.account_code === "LOAN_RECEIVABLE" && line.side === "credit"),
    );
  } finally {
    await stop();
  }
});

test("loan applications support guarantor linking workflow", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Guarantor Workflow Client",
        phone: "+254700002083",
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data.id),
        principal: 1800,
        termWeeks: 12,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);

    const createGuarantor = await api(baseUrl, "/api/guarantors", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Primary Guarantor",
        phone: "+254711002083",
        nationalId: "GRT002083",
        monthlyIncome: 45000,
      },
    });
    assert.equal(createGuarantor.status, 201);
    const guarantorId = Number(createGuarantor.data.id);
    assert.ok(guarantorId > 0);

    const linkGuarantor = await api(baseUrl, `/api/loans/${loanId}/guarantors`, {
      method: "POST",
      token: adminToken,
      body: {
        guarantorId,
        guaranteeAmount: 1000,
        relationshipToClient: "Business Partner",
        liabilityType: "corporate",
      },
    });
    assert.equal(linkGuarantor.status, 201);
    assert.equal(Number(linkGuarantor.data.loan_id), loanId);
    assert.equal(Number(linkGuarantor.data.guarantor_id), guarantorId);
    assert.equal(Number(linkGuarantor.data.guarantee_amount), 1000);
    assert.equal(String(linkGuarantor.data.liability_type), "corporate");

    const loanGuarantors = await api(baseUrl, `/api/loans/${loanId}/guarantors`, {
      token: adminToken,
    });
    assert.equal(loanGuarantors.status, 200);
    assert.ok(Array.isArray(loanGuarantors.data));
    assert.ok(loanGuarantors.data.some((row) => Number(row.guarantor_id) === guarantorId));

    const loanGuarantorLink = loanGuarantors.data.find((row) => Number(row.guarantor_id) === guarantorId);
    assert.ok(loanGuarantorLink);

    const unlinkGuarantor = await api(baseUrl, `/api/loans/${loanId}/guarantors/${Number(loanGuarantorLink.loan_guarantor_id)}`, {
      method: "DELETE",
      token: adminToken,
    });
    assert.equal(unlinkGuarantor.status, 200);

    const loanGuarantorsAfterUnlink = await api(baseUrl, `/api/loans/${loanId}/guarantors`, {
      token: adminToken,
    });
    assert.equal(loanGuarantorsAfterUnlink.status, 200);
    assert.ok(Array.isArray(loanGuarantorsAfterUnlink.data));
    assert.ok(loanGuarantorsAfterUnlink.data.every((row) => Number(row.guarantor_id) !== guarantorId));
  } finally {
    await stop();
  }
});

test("loan applications support collateral registration and linking workflow", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Collateral Workflow Client",
        phone: "+254700002084",
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data.id),
        principal: 2600,
        termWeeks: 16,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);

    const createCollateral = await api(baseUrl, "/api/collateral-assets", {
      method: "POST",
      token: adminToken,
      body: {
        assetType: "equipment",
        description: "Commercial milling machine",
        estimatedValue: 900000,
        ownershipType: "guarantor",
        ownerName: "Primary Guarantor",
        registrationNumber: "EQP084X",
      },
    });
    assert.equal(createCollateral.status, 201);
    const collateralAssetId = Number(createCollateral.data.id);
    assert.ok(collateralAssetId > 0);
    assert.equal(String(createCollateral.data.asset_type), "equipment");
    assert.equal(String(createCollateral.data.ownership_type), "guarantor");

    const filteredCollateral = await api(baseUrl, "/api/collateral-assets?assetType=equipment", {
      token: adminToken,
    });
    assert.equal(filteredCollateral.status, 200);
    assert.ok(Array.isArray(filteredCollateral.data.data));
    assert.ok(filteredCollateral.data.data.some((row) => Number(row.id) === collateralAssetId));

    const linkCollateral = await api(baseUrl, `/api/loans/${loanId}/collaterals`, {
      method: "POST",
      token: adminToken,
      body: {
        collateralAssetId,
        forcedSaleValue: 600000,
        lienRank: 1,
      },
    });
    assert.equal(linkCollateral.status, 201);
    assert.equal(Number(linkCollateral.data.loan_id), loanId);
    assert.equal(Number(linkCollateral.data.collateral_asset_id), collateralAssetId);

    const loanCollaterals = await api(baseUrl, `/api/loans/${loanId}/collaterals`, {
      token: adminToken,
    });
    assert.equal(loanCollaterals.status, 200);
    assert.ok(Array.isArray(loanCollaterals.data));
    assert.ok(loanCollaterals.data.some((row) => Number(row.collateral_asset_id) === collateralAssetId));

    const linkedCollateral = loanCollaterals.data.find((row) => Number(row.collateral_asset_id) === collateralAssetId);
    assert.ok(linkedCollateral);

    const releaseCollateral = await api(baseUrl, `/api/loans/${loanId}/collaterals/${Number(linkedCollateral.loan_collateral_id)}/release`, {
      method: "POST",
      token: adminToken,
    });
    assert.equal(releaseCollateral.status, 200);
    assert.equal(String(releaseCollateral.data.collateralAsset.status), "released");

    const loanCollateralsAfterRelease = await api(baseUrl, `/api/loans/${loanId}/collaterals`, {
      token: adminToken,
    });
    assert.equal(loanCollateralsAfterRelease.status, 200);
    assert.ok(Array.isArray(loanCollateralsAfterRelease.data));
    assert.ok(loanCollateralsAfterRelease.data.every((row) => Number(row.collateral_asset_id) !== collateralAssetId));
  } finally {
    await stop();
  }
});
