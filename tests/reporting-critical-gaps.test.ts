import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import {
  startServer,
  api,
  loginAsAdmin,
  createHighRiskReviewerToken,
  approveLoan,
  submitAndReviewHighRiskRequest,
} from "./integration-helpers.js";

function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function assertApprox(actual: number, expected: number, epsilon: number = 0.01) {
  assert.ok(
    Math.abs(Number(actual) - Number(expected)) <= epsilon,
    `Expected ${actual} to be within ${epsilon} of ${expected}`
  );
}

async function fetchBinary(baseUrl: string, route: string, token: string) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const body = Buffer.from(await response.arrayBuffer());
  return {
    status: response.status,
    contentType: response.headers.get("content-type") || "",
    body,
  };
}

async function createClientAndApprovedLoan({
  baseUrl,
  token,
  fullName,
  phone,
  principal,
  termWeeks,
  branchId = null,
  approvalNotes,
  approvalToken,
}: {
  baseUrl: string;
  token: string;
  fullName: string;
  phone: string;
  principal: number;
  termWeeks: number;
  branchId?: number | null;
  approvalNotes?: string;
  approvalToken?: string;
}) {
  const createClient = await api(baseUrl, "/api/clients", {
    method: "POST",
    token,
    body: {
      fullName,
      phone,
      ...(branchId ? { branchId } : {}),
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

  const approveCreatedLoan = await approveLoan(baseUrl, loanId, approvalToken || token, {
    notes: approvalNotes || "Approve loan for reporting test",
  });
  assert.equal(approveCreatedLoan.status, 200);

  return {
    clientId,
    loanId,
    loan: createLoan.data,
  };
}

test("income statement, daily collections, write-offs, and portfolio report return expected KPIs", async () => {
  const { baseUrl, stop } = await startServer();
  const suffix = uniqueSuffix();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);
    await createHighRiskReviewerToken(baseUrl, adminToken, { role: "finance" });

    const branches = await api(baseUrl, "/api/branches?limit=1&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    const branchId = Number(branches.data.data[0].id);
    assert.ok(branchId > 0);

    const loanA = await createClientAndApprovedLoan({
      baseUrl,
      token: adminToken,
      approvalToken: checkerToken,
      fullName: `Reporting KPI Client A ${suffix}`,
      phone: `+254731${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      principal: 1000,
      termWeeks: 8,
      branchId,
      approvalNotes: "Approve income-statement loan A",
    });

    const loanB = await createClientAndApprovedLoan({
      baseUrl,
      token: adminToken,
      approvalToken: checkerToken,
      fullName: `Reporting KPI Client B ${suffix}`,
      phone: `+254732${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      principal: 1600,
      termWeeks: 10,
      branchId,
      approvalNotes: "Approve income-statement loan B",
    });

    const repaymentAmount = 350;
    const repayment = await api(baseUrl, `/api/loans/${loanA.loanId}/repayments`, {
      method: "POST",
      token: adminToken,
      body: {
        amount: repaymentAmount,
        note: "Repayment for income and daily collections report",
      },
    });
    assert.equal(repayment.status, 201);

    const writeOffFlow = await submitAndReviewHighRiskRequest(baseUrl, {
      loanId: loanB.loanId,
      action: "write-off",
      requestToken: adminToken,
      reviewToken: checkerToken,
      requestBody: {
        note: "Write-off for dedicated report validation",
      },
      reviewNote: "Approve write-off for dedicated report validation",
    });
    assert.equal(writeOffFlow.request.status, 200);
    assert.ok(Number(writeOffFlow.approvalRequest?.id || 0) > 0);
    assert.equal(writeOffFlow.review?.status, 200);

    // 1. Verify Portfolio Report
    const portfolio = await api(baseUrl, "/api/reports/portfolio", {
      token: adminToken,
    });
    assert.equal(portfolio.status, 200);
    assert.ok(Number(portfolio.data.total_loans || 0) >= 2);

    // Verify field mapping consistency (camelCase in response)
    assert.equal(Number(portfolio.data.totalLoans || 0), Number(portfolio.data.total_loans || 0));
    assert.equal(Number(portfolio.data.activeLoans || 0), Number(portfolio.data.active_loans || 0));
    assert.equal(Number(portfolio.data.totalDisbursed || 0), Number(portfolio.data.principal_disbursed || 0));
    assert.equal(Number(portfolio.data.totalOutstanding || 0), Number(portfolio.data.outstanding_balance || 0));
    assert.equal(Number(portfolio.data.totalCollected || 0), Number(portfolio.data.repaid_total || 0));
    assert.equal(Number(portfolio.data.overdueCount || 0), Number(portfolio.data.overdue_loans || 0));
    assert.equal(Number(portfolio.data.overdueAmount || 0), Number(portfolio.data.overdue_amount || 0));
    assert.equal(Number(portfolio.data.atRiskOutstanding || 0), Number(portfolio.data.at_risk_balance || 0));

    assert.equal(typeof portfolio.data.parRatio, "number");
    if (Number(portfolio.data.totalOutstanding || 0) > 0) {
      const expectedParRatio = Number(
        (Number(portfolio.data.atRiskOutstanding || 0) / Number(portfolio.data.totalOutstanding || 0)).toFixed(4)
      );
      assertApprox(Number(portfolio.data.parRatio || 0), expectedParRatio, 0.0001);
    }

    // 2. Verify Disbursements Report
    const disbursements = await api(baseUrl, "/api/reports/disbursements", {
      token: adminToken,
    });
    assert.equal(disbursements.status, 200);
    assert.ok(disbursements.data?.summary);
    assert.ok(Number(disbursements.data.summary.total_loans || 0) >= 2);

    // 3. Verify Income Statement
    const incomeStatement = await api(baseUrl, "/api/reports/income-statement", {
      token: adminToken,
    });
    assert.equal(incomeStatement.status, 200);

    const expectedDisbursed = Number(loanA.loan.principal || 0) + Number(loanB.loan.principal || 0);
    const expectedFees = (
      Number(loanA.loan.registration_fee || 0) +
      Number(loanA.loan.processing_fee || 0) +
      Number(loanB.loan.registration_fee || 0) +
      Number(loanB.loan.processing_fee || 0)
    );
    const expectedInterest = (
      (Number(loanA.loan.expected_total || 0) - Number(loanA.loan.principal || 0)) +
      (Number(loanB.loan.expected_total || 0) - Number(loanB.loan.principal || 0))
    );
    const expectedNetCash = repaymentAmount + expectedFees - expectedDisbursed;

    assertApprox(incomeStatement.data.total_disbursed, expectedDisbursed);
    assertApprox(incomeStatement.data.total_fees_collected, expectedFees);
    assertApprox(incomeStatement.data.total_interest_accrued, expectedInterest);
    assertApprox(incomeStatement.data.total_repaid, repaymentAmount);
    assertApprox(incomeStatement.data.net_cash_position, expectedNetCash);

    // 4. Verify Daily Collections
    const dateFrom = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const dateTo = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const dailyCollections = await api(
      baseUrl,
      `/api/reports/daily-collections?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`,
      {
        token: adminToken,
      }
    );
    assert.equal(dailyCollections.status, 200);
    assert.ok(Array.isArray(dailyCollections.data.dailyCollections));
    const repaymentDayRow = dailyCollections.data.dailyCollections.find(
      (row: any) => Number(row.total_collected || 0) >= repaymentAmount
    );
    assert.ok(repaymentDayRow, "Expected a daily collection row for the seeded repayment");
    assert.ok(Number(repaymentDayRow.repayment_count || 0) >= 1);
    assert.ok(Number(repaymentDayRow.unique_loans || 0) >= 1);
    assert.ok(Number(repaymentDayRow.current_due_collected || 0) >= 0);
    assert.ok(Number(repaymentDayRow.arrears_collected || 0) >= 0);

    // 5. Verify Write-offs Report
    const writeOffReport = await api(baseUrl, "/api/reports/write-offs", {
      token: adminToken,
    });
    assert.equal(writeOffReport.status, 200);
    assert.ok(Number(writeOffReport.data.summary.write_off_count || 0) >= 1);
    assert.ok(Array.isArray(writeOffReport.data.writeOffs));
    const seededWriteOff = writeOffReport.data.writeOffs.find(
      (row: any) => Number(row.loan_id) === loanB.loanId
    );
    assert.ok(seededWriteOff, "Expected write-off report row for seeded loan");
    assert.ok(Number(seededWriteOff.outstanding_balance_at_write_off || 0) > 0);

  } finally {
    await stop();
  }
});

test("daily and summary collections classify overdue recoveries separately from today's dues", async () => {
  const { baseUrl, stop, dbFilePath } = await startServer();
  const suffix = uniqueSuffix();
  let db: Database.Database | null = null;

  try {
    assert.ok(dbFilePath, "Expected sqlite-backed test run to expose dbFilePath");

    const adminToken = await loginAsAdmin(baseUrl);
    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    const branches = await api(baseUrl, "/api/branches?limit=1&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    const branchId = Number(branches.data.data[0].id);
    assert.ok(branchId > 0);

    const seededLoan = await createClientAndApprovedLoan({
      baseUrl,
      token: adminToken,
      approvalToken: checkerToken,
      fullName: `Collections Allocation Client ${suffix}`,
      phone: `+254735${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      principal: 1200,
      termWeeks: 6,
      branchId,
      approvalNotes: "Approve loan for collection allocation test",
    });

    db = new Database(String(dbFilePath));
    db.pragma("busy_timeout = 5000");

    const installments = db.prepare(
      `
        SELECT id, installment_number, amount_due
        FROM loan_installments
        WHERE loan_id = ?
        ORDER BY installment_number ASC, id ASC
      `,
    ).all(seededLoan.loanId) as Array<{ id: number; installment_number: number; amount_due: number }>;

    assert.ok(installments.length >= 2, "Expected at least two installments for seeded loan");

    const now = new Date();
    const overdueDueDate = new Date(now);
    overdueDueDate.setDate(overdueDueDate.getDate() - 7);
    overdueDueDate.setHours(9, 0, 0, 0);

    const todayDueDate = new Date(now);
    todayDueDate.setHours(12, 0, 0, 0);

    const resetInstallment = db.prepare(
      `
        UPDATE loan_installments
        SET due_date = ?, amount_paid = 0, status = 'pending', paid_at = NULL
        WHERE id = ?
      `,
    );

    resetInstallment.run(overdueDueDate.toISOString(), installments[0].id);
    resetInstallment.run(todayDueDate.toISOString(), installments[1].id);
    db.close();
    db = null;

    const repaymentAmount = Number(installments[0].amount_due || 0);
    assert.ok(repaymentAmount > 0);

    const repayment = await api(baseUrl, `/api/loans/${seededLoan.loanId}/repayments`, {
      method: "POST",
      token: adminToken,
      body: {
        amount: repaymentAmount,
        note: "Repayment that should clear only prior arrears",
      },
    });
    assert.equal(repayment.status, 201);

    const reportDateFrom = new Date(now);
    reportDateFrom.setHours(0, 0, 0, 0);
    const reportDateTo = new Date(now);
    reportDateTo.setHours(23, 59, 59, 999);

    const dailyCollections = await api(
      baseUrl,
      `/api/reports/daily-collections?dateFrom=${encodeURIComponent(reportDateFrom.toISOString())}&dateTo=${encodeURIComponent(reportDateTo.toISOString())}`,
      {
        token: adminToken,
      },
    );
    assert.equal(dailyCollections.status, 200);
    assert.ok(Array.isArray(dailyCollections.data.dailyCollections));

    const repaymentDayRow = dailyCollections.data.dailyCollections.find(
      (row: any) => Number(row.total_collected || 0) >= repaymentAmount,
    );
    assert.ok(repaymentDayRow, "Expected a daily collection row for the overdue-clearing repayment");
    assertApprox(Number(repaymentDayRow.total_collected || 0), repaymentAmount);
    assertApprox(Number(repaymentDayRow.arrears_collected || 0), repaymentAmount);
    assertApprox(Number(repaymentDayRow.current_due_collected || 0), 0);

    const collectionsSummary = await api(
      baseUrl,
      `/api/reports/collections?dateFrom=${encodeURIComponent(reportDateFrom.toISOString())}&dateTo=${encodeURIComponent(reportDateTo.toISOString())}`,
      {
        token: adminToken,
      },
    );
    assert.equal(collectionsSummary.status, 200);
    assertApprox(Number(collectionsSummary.data.summary.total_collected || 0), repaymentAmount);
    assertApprox(Number(collectionsSummary.data.summary.arrears_collected || 0), repaymentAmount);
    assertApprox(Number(collectionsSummary.data.summary.period_due_collected || 0), 0);
    assertApprox(Number(collectionsSummary.data.summary.collection_rate || 0), 0);

    const focusedCollectionsSummary = await api(
      baseUrl,
      `/api/reports/collections?dateFrom=${encodeURIComponent(reportDateFrom.toISOString())}&dateTo=${encodeURIComponent(reportDateTo.toISOString())}&collectionFocus=arrears_only`,
      {
        token: adminToken,
      },
    );
    assert.equal(focusedCollectionsSummary.status, 200);
    assertApprox(Number(focusedCollectionsSummary.data.summary.total_collected || 0), repaymentAmount);
    assertApprox(Number(focusedCollectionsSummary.data.summary.arrears_collected || 0), repaymentAmount);
    assert.equal(Number(focusedCollectionsSummary.data.summary.period_due_collected || 0), 0);
    assert.ok(Array.isArray(focusedCollectionsSummary.data.payments));
    assert.ok(focusedCollectionsSummary.data.payments.length >= 1);
    assert.ok(focusedCollectionsSummary.data.payments.every((row: any) => Number(row.arrears_collected || 0) > 0));
  } finally {
    db?.close();
    await stop();
  }
});

test("officer performance includes expected due and collection rate on officer portfolio", async () => {
  const { baseUrl, stop } = await startServer();
  const suffix = uniqueSuffix();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const branches = await api(baseUrl, "/api/branches?limit=1&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    const branchId = Number(branches.data.data[0].id);
    assert.ok(branchId > 0);

    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    // Create a specific loan officer (cashier with branch assignments)
    const createCashier = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: `Reporting Cashier ${suffix}`,
        email: `reporting.cashier.${suffix}@example.com`,
        password: "Password@123",
        role: "cashier",
        branchId,
      },
    });
    assert.equal(createCashier.status, 201);
    const cashierUserId = Number(createCashier.data.id);
    assert.ok(cashierUserId > 0);

    const cashierLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: `reporting.cashier.${suffix}@example.com`,
        password: "Password@123",
      },
    });
    assert.equal(cashierLogin.status, 200);

    // Seed a loan for the admin officer (ID 1)
    const seededLoan = await createClientAndApprovedLoan({
      baseUrl,
      token: adminToken,
      approvalToken: checkerToken,
      fullName: `Officer KPI Client ${suffix}`,
      phone: `+254733${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      principal: 1200,
      termWeeks: 6,
      branchId,
      approvalNotes: "Approve officer KPI loan",
    });

    // Record a repayment by the cashier
    const repaymentAmount = 240;
    const repayment = await api(baseUrl, `/api/loans/${seededLoan.loanId}/repayments`, {
      method: "POST",
      token: cashierLogin.data.token,
      body: {
        amount: repaymentAmount,
        note: "Cashier-recorded repayment for officer KPI",
      },
    });
    assert.equal(repayment.status, 201);

    const me = await api(baseUrl, "/api/auth/me", {
      token: adminToken,
    });
    assert.equal(me.status, 200);
    const adminUserId = Number(me.data.id);
    assert.ok(adminUserId > 0);

    const dateFrom = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const dateTo = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

    const officerPerformance = await api(
      baseUrl,
      `/api/reports/officer-performance?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`,
      {
        token: adminToken,
      }
    );
    assert.equal(officerPerformance.status, 200);
    assert.ok(Array.isArray(officerPerformance.data.officers));

    const adminRow = officerPerformance.data.officers.find(
      (row: any) => Number(row.user_id) === adminUserId
    );
    assert.ok(adminRow, "Expected officer performance row for admin officer");
    assert.ok(Number(adminRow.total_collected || 0) >= repaymentAmount);
    assert.ok(Number(adminRow.expected_due_in_period || 0) > 0);
    assert.equal(typeof adminRow.collection_rate_pct, "number");

    const expectedRate = Number(
      (Number(adminRow.total_collected || 0) / Number(adminRow.expected_due_in_period || 1)).toFixed(4)
    );
    assertApprox(adminRow.collection_rate_pct, expectedRate, 0.0001);

    // Verify cashier doesn't get collection attribution for someone else's loan
    const cashierRowWithCollections = officerPerformance.data.officers.find(
      (row: any) => Number(row.user_id) === cashierUserId && Number(row.total_collected || 0) > 0
    );
    assert.equal(
      Boolean(cashierRowWithCollections),
      false,
      "Expected collection attribution to follow loan officer ownership, not cashier recorder id"
    );

  } finally {
    await stop();
  }
});

test("portfolio report supports PDF and XLSX export formats", async () => {
  const { baseUrl, stop } = await startServer();
  const suffix = uniqueSuffix();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    await createClientAndApprovedLoan({
      baseUrl,
      token: adminToken,
      approvalToken: checkerToken,
      fullName: `Export Format Client ${suffix}`,
      phone: `+254734${String(Math.floor(Math.random() * 10000).toString()).padStart(6, "0")}`, // Shortened random to avoid overflow if any
      principal: 900,
      termWeeks: 6,
      approvalNotes: "Approve for report export format coverage",
    });

    const pdfExport = await fetchBinary(baseUrl, "/api/reports/portfolio?format=pdf", adminToken);
    assert.equal(pdfExport.status, 200);
    assert.ok(pdfExport.contentType.includes("application/pdf"));
    assert.ok(pdfExport.body.length > 100);
    assert.equal(pdfExport.body.subarray(0, 4).toString("utf8"), "%PDF");

    const xlsxExport = await fetchBinary(baseUrl, "/api/reports/portfolio?format=xlsx", adminToken);
    assert.equal(xlsxExport.status, 200);
    assert.ok(xlsxExport.contentType.includes("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
    assert.ok(xlsxExport.body.length > 100);
    assert.equal(xlsxExport.body.subarray(0, 2).toString("utf8"), "PK");

  } finally {
    await stop();
  }
});

test("GL reporting endpoints expose trial balance, account statement, income statement, and cash flow", async () => {
  const { baseUrl, stop } = await startServer();
  const suffix = uniqueSuffix();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const branches = await api(baseUrl, "/api/branches?limit=1&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    const branchId = Number(branches.data.data[0].id);
    assert.ok(branchId > 0);

    const createOpsManager = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: `GL Reports Ops Checker ${suffix}`,
        email: `gl.reports.ops.${suffix}@example.com`,
        password: "Password@123",
        role: "operations_manager",
        branchId,
      },
    });
    assert.equal(createOpsManager.status, 201);

    const opsLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: `gl.reports.ops.${suffix}@example.com`,
        password: "Password@123",
      },
    });
    assert.equal(opsLogin.status, 200);
    const opsToken = opsLogin.data.token;

    const loanA = await createClientAndApprovedLoan({
      baseUrl,
      token: adminToken,
      approvalToken: opsToken,
      fullName: `GL Reports Client A ${suffix}`,
      phone: `+254734${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      principal: 1100,
      termWeeks: 8,
      branchId,
      approvalNotes: "Approve GL report loan A",
    });

    const loanB = await createClientAndApprovedLoan({
      baseUrl,
      token: adminToken,
      approvalToken: opsToken,
      fullName: `GL Reports Client B ${suffix}`,
      phone: `+254735${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      principal: 1500,
      termWeeks: 10,
      branchId,
      approvalNotes: "Approve GL report loan B",
    });

    const repaymentAmount = 280;
    const repayment = await api(baseUrl, `/api/loans/${loanA.loanId}/repayments`, {
      method: "POST",
      token: adminToken,
      body: {
        amount: repaymentAmount,
        note: "Repayment for GL cash flow",
      },
    });
    assert.equal(repayment.status, 201);

    const writeOff = await api(baseUrl, `/api/loans/${loanB.loanId}/write-off`, {
      method: "POST",
      token: adminToken,
      body: {
        note: "Write-off for GL income statement",
      },
    });
    assert.equal(writeOff.status, 200);

    const pendingApprovals = await api(baseUrl, `/api/approval-requests?status=pending&loanId=${loanB.loanId}`, {
      token: opsToken,
    });
    assert.equal(pendingApprovals.status, 200);
    const writeOffRequest = pendingApprovals.data.rows.find(
      (row: any) => String(row.request_type) === "loan_write_off" && Number(row.loan_id) === loanB.loanId
    );
    assert.ok(writeOffRequest, "Expected pending write-off approval request");

    const approveWriteOff = await api(baseUrl, `/api/approval-requests/${Number(writeOffRequest.id)}/review`, {
      method: "POST",
      token: opsToken,
      body: {
        decision: "approve",
        note: "Approve write-off for GL reporting validation",
      },
    });
    assert.equal(Number(approveWriteOff.status || 0), 200);

    const dateFrom = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const dateTo = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const glAccounts = await api(baseUrl, "/api/reports/gl/accounts", { token: adminToken });
    assert.equal(glAccounts.status, 200);
    assert.ok(Array.isArray(glAccounts.data));
    assert.ok(glAccounts.data.some((row: any) => String(row.code) === "CASH"));

    const trialBalance = await api(
      baseUrl,
      `/api/reports/gl/trial-balance?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`,
      { token: adminToken }
    );
    assert.equal(trialBalance.status, 200);
    assert.equal(typeof trialBalance.data.balanced, "boolean");
    assert.ok(Array.isArray(trialBalance.data.rows));
    const cashRow = trialBalance.data.rows.find((row: any) => String(row.code) === "CASH");
    assert.ok(cashRow, "Expected CASH row in trial balance");

    const trialBalanceCsv = await fetchBinary(
      baseUrl,
      `/api/reports/gl/trial-balance?format=csv&dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`,
      adminToken
    );
    assert.equal(trialBalanceCsv.status, 200);
    assert.ok(trialBalanceCsv.contentType.includes("text/csv"));
    assert.ok(trialBalanceCsv.body.toString("utf8").includes("code,name"));

    const cashStatement = await api(
      baseUrl,
      `/api/reports/gl/accounts/${Number(cashRow.id)}/statement?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`,
      { token: adminToken }
    );
    assert.equal(cashStatement.status, 200);
    assert.equal(String(cashStatement.data.account.code), "CASH");
    assert.ok(Array.isArray(cashStatement.data.entries));
    assert.ok(Number(cashStatement.data.summary.entry_count || 0) >= 2);

    const incomeStatement = await api(
      baseUrl,
      `/api/reports/gl/income-statement?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`,
      { token: adminToken }
    );
    assert.equal(incomeStatement.status, 200);
    assert.ok(Number(incomeStatement.data.summary.interest_income || 0) >= 0);
    assert.ok(Number(incomeStatement.data.summary.write_off_expense || 0) > 0);

    const cashFlow = await api(
      baseUrl,
      `/api/reports/gl/cash-flow?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`,
      { token: adminToken }
    );
    assert.equal(cashFlow.status, 200);
    assert.ok(Number(cashFlow.data.totals.disbursements || 0) > 0);
    assert.ok(Number(cashFlow.data.totals.repayments || 0) >= repaymentAmount);
    assert.ok(Array.isArray(cashFlow.data.daily));

    const cashFlowXlsx = await fetchBinary(
      baseUrl,
      `/api/reports/gl/cash-flow?format=xlsx&dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`,
      adminToken
    );
    assert.equal(cashFlowXlsx.status, 200);
    assert.ok(cashFlowXlsx.contentType.includes("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
    assert.equal(cashFlowXlsx.body.subarray(0, 2).toString("utf8"), "PK");

  } finally {
    await stop();
  }
});



