import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { api, approveLoan, loginAsAdmin, startServer, createHighRiskReviewerToken } from "./integration-helpers.js";


function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function createClientAndApprovedLoan({
  baseUrl,
  token,
  fullName,
  phone,
  branchId,
  principal = 1200,
  termWeeks = 8,
  approvalToken,
}: {
  baseUrl: string;
  token: string;
  fullName: string;
  phone: string;
  branchId: number;
  principal?: number;
  termWeeks?: number;
  approvalToken?: string;
}) {
  const client = await api(baseUrl, "/api/clients", {
    method: "POST",
    token,
    body: {
      fullName,
      phone,
      branchId,
    },
  });
  assert.equal(client.status, 201);
  const clientId = Number(client.data.id);
  assert.ok(clientId > 0);

  const loan = await api(baseUrl, "/api/loans", {
    method: "POST",
    token,
    body: {
      clientId,
      principal,
      termWeeks,
    },
  });
  assert.equal(loan.status, 201);
  const loanId = Number(loan.data.id);
  assert.ok(loanId > 0);

  const approval = await approveLoan(baseUrl, loanId, approvalToken || token, {
    notes: "Approve portfolio contract test loan",
  });

  assert.equal(approval.status, 200);

  return {
    clientId,
    loanId,
  };
}

async function createApprovedLoanForExistingClient({
  baseUrl,
  token,
  clientId,
  principal = 1200,
  termWeeks = 8,
  approvalToken,
}: {
  baseUrl: string;
  token: string;
  clientId: number;
  principal?: number;
  termWeeks?: number;
  approvalToken?: string;
}) {
  const loan = await api(baseUrl, "/api/loans", {
    method: "POST",
    token,
    body: {
      clientId,
      principal,
      termWeeks,
    },
  });
  assert.equal(loan.status, 201);

  const loanId = Number(loan.data.id);
  assert.ok(loanId > 0);

  const approval = await approveLoan(baseUrl, loanId, approvalToken || token, {
    notes: "Approve repeat-history loan",
  });

  assert.equal(approval.status, 200);

  return {
    loanId,
  };
}

function moveRemainingInstallmentsBeyondSnapshot(db: Database.Database, loanId: number) {
  const futureDates = [
    [2, "2026-04-13T09:00:00.000Z"],
    [3, "2026-04-20T09:00:00.000Z"],
    [4, "2026-04-27T09:00:00.000Z"],
    [5, "2026-05-04T09:00:00.000Z"],
  ] as const;

  for (const [installmentNumber, dueDate] of futureDates) {
    db.prepare(`
      UPDATE loan_installments
      SET due_date = ?, amount_paid = 0, status = 'pending'
      WHERE loan_id = ? AND installment_number = ?
    `).run(dueDate, loanId, installmentNumber);
  }
}

test("portfolio report honors frontend branch and report date query filters", async () => {
  const { baseUrl, stop } = await startServer();
  const suffix = uniqueSuffix();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const branches = await api(baseUrl, "/api/branches?limit=2&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    assert.ok(Array.isArray(branches.data?.data) && branches.data.data.length >= 2);

    const [branchA, branchB] = branches.data.data;
    const branchAId = Number(branchA.id);
    const branchBId = Number(branchB.id);
    assert.ok(branchAId > 0);
    assert.ok(branchBId > 0);

    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    await createClientAndApprovedLoan({
      baseUrl,
      token: adminToken,
      fullName: `Portfolio Contract Branch A ${suffix}`,
      phone: `+254733${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      branchId: branchAId,
      principal: 1400,
      termWeeks: 10,
      approvalToken: checkerToken,
    });

    await createClientAndApprovedLoan({
      baseUrl,
      token: adminToken,
      fullName: `Portfolio Contract Branch B ${suffix}`,
      phone: `+254734${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      branchId: branchBId,
      principal: 1800,
      termWeeks: 12,
    });

    const scopedBranchReport = await api(
      baseUrl,
      `/api/reports/portfolio?includeBreakdown=true&branchId=${branchAId}`,
      {
        token: adminToken,
      },
    );
    assert.equal(scopedBranchReport.status, 200);
    assert.equal(scopedBranchReport.data?.period?.dateFrom ?? null, null);
    assert.equal(scopedBranchReport.data?.period?.dateTo ?? null, null);
    assert.ok(Number(scopedBranchReport.data?.total_loans || 0) >= 1);
    assert.ok(Array.isArray(scopedBranchReport.data?.branchBreakdown));
    assert.equal(scopedBranchReport.data.branchBreakdown.length, 1);
    assert.equal(Number(scopedBranchReport.data.branchBreakdown[0].branch_id || 0), branchAId);
    assert.ok(Number(scopedBranchReport.data.branchBreakdown[0].total_loans || 0) >= 1);

    const futureDateFrom = new Date(Date.now() + (35 * 24 * 60 * 60 * 1000)).toISOString();
    const futureDateTo = new Date(Date.now() + (45 * 24 * 60 * 60 * 1000)).toISOString();
    const futureScopedReport = await api(
      baseUrl,
      `/api/reports/portfolio?includeBreakdown=true&branchId=${branchAId}&dateFrom=${encodeURIComponent(futureDateFrom)}&dateTo=${encodeURIComponent(futureDateTo)}`,
      {
        token: adminToken,
      },
    );
    assert.equal(futureScopedReport.status, 200);
    assert.equal(futureScopedReport.data?.period?.dateFrom, futureDateFrom);
    assert.equal(futureScopedReport.data?.period?.dateTo, futureDateTo);
    assert.equal(Number(futureScopedReport.data?.total_loans || 0), 0);
    assert.equal(Number(futureScopedReport.data?.active_loans || 0), 0);
    assert.ok(Array.isArray(futureScopedReport.data?.branchBreakdown));
    assert.equal(futureScopedReport.data.branchBreakdown.length, 1);
    assert.equal(Number(futureScopedReport.data.branchBreakdown[0].branch_id || 0), branchAId);
    assert.equal(Number(futureScopedReport.data.branchBreakdown[0].total_loans || 0), 0);
  } finally {
    await stop();
  }
});

test("portfolio report accepts multiple officer ids for subset filtering", async () => {
  const { baseUrl, stop, dbFilePath } = await startServer();
  const suffix = uniqueSuffix();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);


    const branches = await api(baseUrl, "/api/branches?limit=1&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    const branchId = Number(branches.data.data[0].id);
    assert.ok(branchId > 0);
    assert.ok(dbFilePath, "Expected sqlite test database path");

    const createOfficerA = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: `Report Officer A ${suffix}`,
        email: `report.officer.a.${suffix}@example.com`,
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
        fullName: `Report Officer B ${suffix}`,
        email: `report.officer.b.${suffix}@example.com`,
        password: "Password@123",
        role: "loan_officer",
        branchId,
      },
    });
    assert.equal(createOfficerB.status, 201);
    const officerBId = Number(createOfficerB.data.id);

    const loanA = await createClientAndApprovedLoan({
      baseUrl,
      token: adminToken,
      fullName: `Officer Filter Client A ${suffix}`,
      phone: `+254741${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      branchId,
      principal: 1400,
      termWeeks: 8,
      approvalToken: checkerToken,
    });

    const loanB = await createClientAndApprovedLoan({
      baseUrl,
      token: adminToken,
      fullName: `Officer Filter Client B ${suffix}`,
      phone: `+254742${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      branchId,
      principal: 1600,
      termWeeks: 8,
      approvalToken: checkerToken,
    });
    const db = new Database(String(dbFilePath));
    try {
      db.prepare("UPDATE loans SET officer_id = ? WHERE id = ?").run(officerAId, loanA.loanId);
      db.prepare("UPDATE loans SET officer_id = ? WHERE id = ?").run(officerBId, loanB.loanId);

      const singleOfficerReport = await api(
        baseUrl,
        `/api/reports/portfolio?branchId=${branchId}&officerIds=${officerAId}`,
        {
          token: adminToken,
        },
      );
      assert.equal(singleOfficerReport.status, 200);
      assert.equal(Number(singleOfficerReport.data?.total_loans || 0), 1);

      const multiOfficerReport = await api(
        baseUrl,
        `/api/reports/portfolio?branchId=${branchId}&officerIds=${officerAId},${officerBId}`,
        {
          token: adminToken,
        },
      );
      assert.equal(multiOfficerReport.status, 200);
      assert.equal(Number(multiOfficerReport.data?.total_loans || 0), 2);
    } finally {
      db.close();
    }
  } finally {
    await stop();
  }
});

test("dues report returns all unpaid installments for loans with a scheduled due inside the selected window", async () => {
  const { baseUrl, stop, dbFilePath } = await startServer();
  const suffix = uniqueSuffix();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const branches = await api(baseUrl, "/api/branches?limit=1&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    const branchId = Number(branches.data.data[0].id);
    assert.ok(branchId > 0);
    assert.ok(dbFilePath, "Expected sqlite test database path");

    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    const cohortLoan = await createClientAndApprovedLoan({
      baseUrl,
      token: adminToken,
      fullName: `Dues Cohort Loan ${suffix}`,
      phone: `+254735${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      branchId,
      principal: 5000,
      termWeeks: 5,
      approvalToken: checkerToken,
    });
    const controlLoan = await createClientAndApprovedLoan({
      baseUrl,
      token: adminToken,
      fullName: `Dues Control Loan ${suffix}`,
      phone: `+254736${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      branchId,
      principal: 5000,
      termWeeks: 5,
      approvalToken: checkerToken,
    });


    const db = new Database(String(dbFilePath));
    try {
      const windowStart = "2026-03-01T00:00:00.000Z";
      const windowEnd = "2026-03-07T23:59:59.999Z";

      db.prepare(`
        UPDATE loan_installments
        SET due_date = ?, amount_paid = amount_due, status = 'paid'
        WHERE loan_id = ? AND installment_number = 1
      `).run("2026-03-05T00:00:00.000Z", cohortLoan.loanId);

      const cohortFutureDates = [
        [2, "2026-03-06T00:00:00.000Z", "overdue"],
        [3, "2026-03-19T00:00:00.000Z", "pending"],
        [4, "2026-03-26T00:00:00.000Z", "pending"],
        [5, "2026-04-02T00:00:00.000Z", "pending"],
      ] as const;
      for (const [installmentNumber, dueDate, status] of cohortFutureDates) {
        db.prepare(`
          UPDATE loan_installments
          SET due_date = ?, amount_paid = 0, status = ?
          WHERE loan_id = ? AND installment_number = ?
        `).run(dueDate, status, cohortLoan.loanId, installmentNumber);
      }

      const cohortOverdueInstallment = db.prepare(`
        SELECT amount_due, amount_paid
        FROM loan_installments
        WHERE loan_id = ? AND installment_number = 2
      `).get(cohortLoan.loanId) as { amount_due: number; amount_paid: number };
      const expectedArrears = Number(
        (Number(cohortOverdueInstallment.amount_due || 0) - Number(cohortOverdueInstallment.amount_paid || 0)).toFixed(2),
      );

      const controlFutureDates = [
        [1, "2026-03-12T00:00:00.000Z"],
        [2, "2026-03-19T00:00:00.000Z"],
        [3, "2026-03-26T00:00:00.000Z"],
        [4, "2026-04-02T00:00:00.000Z"],
        [5, "2026-04-09T00:00:00.000Z"],
      ] as const;
      for (const [installmentNumber, dueDate] of controlFutureDates) {
        db.prepare(`
          UPDATE loan_installments
          SET due_date = ?, amount_paid = 0, status = 'pending'
          WHERE loan_id = ? AND installment_number = ?
        `).run(dueDate, controlLoan.loanId, installmentNumber);
      }

      const duesReport = await api(
        baseUrl,
        `/api/reports/dues?branchId=${branchId}&dateFrom=${encodeURIComponent(windowStart)}&dateTo=${encodeURIComponent(windowEnd)}`,
        {
          token: adminToken,
        },
      );
      assert.equal(duesReport.status, 200);

      const dueItems = Array.isArray(duesReport.data?.dueItems) ? duesReport.data.dueItems : [];
      const cohortDueItems = dueItems.filter((row) => Number(row.loanid) === cohortLoan.loanId);
      assert.equal(cohortDueItems.length, 1);
      assert.deepEqual(
        cohortDueItems.map((row) => Number(row.installmentno)),
        [2],
      );
      assert.equal(
        dueItems.some((row) => Number(row.loanid) === controlLoan.loanId),
        false,
      );

      const reportRows = Array.isArray(duesReport.data?.reportRows) ? duesReport.data.reportRows : [];
      const cohortReportRows = reportRows.filter((row) => Number(row.LoanId) === cohortLoan.loanId);
      assert.equal(cohortReportRows.length, 1);
      assert.deepEqual(
        cohortReportRows.map((row) => Number(row.InstallmentNo)),
        [2],
      );
      assert.deepEqual(
        cohortReportRows.map((row) => Number(row.Arrears)),
        [expectedArrears],
      );
    } finally {
      db.close();
    }
  } finally {
    await stop();
  }
});

test("dues report matches installments by calendar date instead of timestamp precision", async () => {
  const { baseUrl, stop, dbFilePath } = await startServer();
  const suffix = uniqueSuffix();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    const branches = await api(baseUrl, "/api/branches?limit=1&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    const branchId = Number(branches.data.data[0].id);
    assert.ok(branchId > 0);
    assert.ok(dbFilePath, "Expected sqlite test database path");

    const seededLoan = await createClientAndApprovedLoan({
      baseUrl,
      token: adminToken,
      fullName: `Calendar Date Dues Loan ${suffix}`,
      phone: `+254739${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      branchId,
      principal: 5000,
      termWeeks: 5,
      approvalToken: checkerToken,
    });

    const db = new Database(String(dbFilePath));
    try {
      const reportDate = "2026-03-06T00:00:00.000Z";

      db.prepare(`
        UPDATE loan_installments
        SET due_date = ?, amount_paid = 0, status = 'pending'
        WHERE loan_id = ? AND installment_number = 1
      `).run("2026-03-06T18:45:00.000Z", seededLoan.loanId);

      const futureDates = [
        [2, "2026-03-13T09:00:00.000Z"],
        [3, "2026-03-20T09:00:00.000Z"],
        [4, "2026-03-27T09:00:00.000Z"],
        [5, "2026-04-03T09:00:00.000Z"],
      ] as const;

      for (const [installmentNumber, dueDate] of futureDates) {
        db.prepare(`
          UPDATE loan_installments
          SET due_date = ?, amount_paid = 0, status = 'pending'
          WHERE loan_id = ? AND installment_number = ?
        `).run(dueDate, seededLoan.loanId, installmentNumber);
      }

      const duesReport = await api(
        baseUrl,
        `/api/reports/dues?branchId=${branchId}&dateFrom=${encodeURIComponent(reportDate)}&dateTo=${encodeURIComponent(reportDate)}`,
        {
          token: adminToken,
        },
      );
      assert.equal(duesReport.status, 200);

      const dueItems = Array.isArray(duesReport.data?.dueItems) ? duesReport.data.dueItems : [];
      const seededLoanItems = dueItems.filter((row) => Number(row.loanid) === seededLoan.loanId);
      assert.equal(seededLoanItems.length, 1);
      assert.equal(Number(seededLoanItems[0].installmentno), 1);
    } finally {
      db.close();
    }
  } finally {
    await stop();
  }
});

test("dues report exposes fixed scheduled dues separately from remaining unpaid dues", async () => {
  const { baseUrl, stop, dbFilePath } = await startServer();
  const suffix = uniqueSuffix();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    const branches = await api(baseUrl, "/api/branches?limit=1&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    const branchId = Number(branches.data.data[0].id);
    assert.ok(branchId > 0);
    assert.ok(dbFilePath, "Expected sqlite test database path");

    const seededLoan = await createClientAndApprovedLoan({
      baseUrl,
      token: adminToken,
      fullName: `Fixed Scheduled Dues Loan ${suffix}`,
      phone: `+254738${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      branchId,
      principal: 5000,
      termWeeks: 5,
      approvalToken: checkerToken,
    });

    const db = new Database(String(dbFilePath));
    try {
      const reportDate = "2026-03-06T00:00:00.000Z";
      const installment = db.prepare(`
        SELECT amount_due
        FROM loan_installments
        WHERE loan_id = ? AND installment_number = 1
      `).get(seededLoan.loanId) as { amount_due: number };
      const totalScheduledAmount = Number(Number(installment.amount_due || 0).toFixed(2));
      const partialPayment = Number((totalScheduledAmount / 2).toFixed(2));
      const remainingDue = Number((totalScheduledAmount - partialPayment).toFixed(2));

      db.prepare(`
        UPDATE loan_installments
        SET due_date = ?, amount_paid = ?, status = 'pending'
        WHERE loan_id = ? AND installment_number = 1
      `).run("2026-03-06T18:45:00.000Z", partialPayment, seededLoan.loanId);

      const futureDates = [
        [2, "2026-03-13T09:00:00.000Z"],
        [3, "2026-03-20T09:00:00.000Z"],
        [4, "2026-03-27T09:00:00.000Z"],
        [5, "2026-04-03T09:00:00.000Z"],
      ] as const;

      for (const [installmentNumber, dueDate] of futureDates) {
        db.prepare(`
          UPDATE loan_installments
          SET due_date = ?, amount_paid = 0, status = 'pending'
          WHERE loan_id = ? AND installment_number = ?
        `).run(dueDate, seededLoan.loanId, installmentNumber);
      }

      const duesReport = await api(
        baseUrl,
        `/api/reports/dues?branchId=${branchId}&dateFrom=${encodeURIComponent(reportDate)}&dateTo=${encodeURIComponent(reportDate)}`,
        {
          token: adminToken,
        },
      );
      assert.equal(duesReport.status, 200);

      const duesInPeriod = duesReport.data?.duesInPeriod ?? {};
      assert.equal(Number(Number(duesInPeriod.total_scheduled_amount || 0).toFixed(2)), totalScheduledAmount);
      assert.equal(Number(Number(duesInPeriod.expected_amount || 0).toFixed(2)), remainingDue);
    } finally {
      db.close();
    }
  } finally {
    await stop();
  }
});

test("dues report honors Nairobi business-day boundaries for dashboard windows", async () => {
  const { baseUrl, stop, dbFilePath } = await startServer();
  const suffix = uniqueSuffix();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    const branches = await api(baseUrl, "/api/branches?limit=1&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    const branchId = Number(branches.data.data[0].id);
    assert.ok(branchId > 0);
    assert.ok(dbFilePath, "Expected sqlite test database path");

    const todayLoan = await createClientAndApprovedLoan({
      baseUrl,
      token: adminToken,
      fullName: `Business Date Today Loan ${suffix}`,
      phone: `+254736${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      branchId,
      principal: 5000,
      termWeeks: 5,
      approvalToken: checkerToken,
    });
    const yesterdayLoan = await createClientAndApprovedLoan({
      baseUrl,
      token: adminToken,
      fullName: `Business Date Yesterday Loan ${suffix}`,
      phone: `+254735${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      branchId,
      principal: 5000,
      termWeeks: 5,
      approvalToken: checkerToken,
    });

    const db = new Database(String(dbFilePath));
    try {
      db.prepare(`
        UPDATE loan_installments
        SET due_date = ?, amount_paid = 0, status = 'pending'
        WHERE loan_id = ? AND installment_number = 1
      `).run("2026-03-06T18:45:00.000Z", todayLoan.loanId);
      db.prepare(`
        UPDATE loan_installments
        SET due_date = ?, amount_paid = 0, status = 'pending'
        WHERE loan_id = ? AND installment_number = 1
      `).run("2026-03-05T18:45:00.000Z", yesterdayLoan.loanId);

      moveRemainingInstallmentsBeyondSnapshot(db, todayLoan.loanId);
      moveRemainingInstallmentsBeyondSnapshot(db, yesterdayLoan.loanId);

      const duesReport = await api(
        baseUrl,
        `/api/reports/dues?branchId=${branchId}&dateFrom=${encodeURIComponent("2026-03-05T21:00:00.000Z")}&dateTo=${encodeURIComponent("2026-03-06T20:59:59.999Z")}`,
        {
          token: adminToken,
        },
      );
      assert.equal(duesReport.status, 200);

      const dueItems = Array.isArray(duesReport.data?.dueItems) ? duesReport.data.dueItems : [];
      assert.ok(
        dueItems.some((row) => Number(row.loanid) === todayLoan.loanId),
        "Expected current-business-day loan in dues report",
      );
      assert.ok(
        !dueItems.some((row) => Number(row.loanid) === yesterdayLoan.loanId),
        "Expected prior-business-day loan to be excluded from current dashboard day window",
      );
    } finally {
      db.close();
    }
  } finally {
    await stop();
  }
});

test("arrears report uses snapshot-date arrears instead of filtering overdue loans by due-date window", async () => {
  const { baseUrl, stop, dbFilePath } = await startServer();
  const suffix = uniqueSuffix();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const branches = await api(baseUrl, "/api/branches?limit=1&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    const branchId = Number(branches.data.data[0].id);
    assert.ok(branchId > 0);
    assert.ok(dbFilePath, "Expected sqlite test database path");

    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    const arrearsLoan = await createClientAndApprovedLoan({
      baseUrl,
      token: adminToken,
      fullName: `Arrears Snapshot Loan ${suffix}`,
      phone: `+254737${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      branchId,
      principal: 5000,
      termWeeks: 5,
      approvalToken: checkerToken,
    });


    const db = new Database(String(dbFilePath));
    try {
      db.prepare(`
        UPDATE loan_installments
        SET due_date = ?, amount_paid = 0, status = 'overdue'
        WHERE loan_id = ? AND installment_number = 1
      `).run("2026-02-20T00:00:00.000Z", arrearsLoan.loanId);

      db.prepare(`
        UPDATE loan_installments
        SET due_date = ?, amount_paid = 0, status = 'pending'
        WHERE loan_id = ? AND installment_number = 2
      `).run("2026-03-20T00:00:00.000Z", arrearsLoan.loanId);

      const arrearsReport = await api(
        baseUrl,
        `/api/reports/arrears?branchId=${branchId}&dateFrom=${encodeURIComponent("2026-03-01T00:00:00.000Z")}&dateTo=${encodeURIComponent("2026-03-07T23:59:59.999Z")}`,
        {
          token: adminToken,
        },
      );
      assert.equal(arrearsReport.status, 200);

      const reportRows = Array.isArray(arrearsReport.data?.reportRows) ? arrearsReport.data.reportRows : [];
      const arrearsRow = reportRows.find((row) => Number(row.LoanId) === arrearsLoan.loanId);
      assert.ok(arrearsRow, "Expected arrears report row for seeded overdue loan");
      assert.equal(Number(arrearsRow.DaysInArrears), 15);
      assert.equal(Number(arrearsRow.DaysToNpl), 76);
      assert.equal(String(arrearsRow.Maturity), "Not Matured");
    } finally {
      db.close();
    }
  } finally {
    await stop();
  }
});

test("arrears report exposes pre-NPL arrears separately from NPL and restructured balances", async () => {
  const { baseUrl, stop, dbFilePath } = await startServer();
  const suffix = uniqueSuffix();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    const branches = await api(baseUrl, "/api/branches?limit=1&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    const branchId = Number(branches.data.data[0].id);
    assert.ok(branchId > 0);
    assert.ok(dbFilePath, "Expected sqlite test database path");

    const currentArrearsLoan = await createClientAndApprovedLoan({
      baseUrl,
      token: adminToken,
      fullName: `Current Arrears Loan ${suffix}`,
      phone: `+254734${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      branchId,
      principal: 5000,
      termWeeks: 5,
      approvalToken: checkerToken,
    });
    const nplLoan = await createClientAndApprovedLoan({
      baseUrl,
      token: adminToken,
      fullName: `NPL Arrears Loan ${suffix}`,
      phone: `+254733${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      branchId,
      principal: 5000,
      termWeeks: 5,
      approvalToken: checkerToken,
    });
    const restructuredLoan = await createClientAndApprovedLoan({
      baseUrl,
      token: adminToken,
      fullName: `Restructured Arrears Loan ${suffix}`,
      phone: `+254732${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      branchId,
      principal: 5000,
      termWeeks: 5,
      approvalToken: checkerToken,
    });

    const db = new Database(String(dbFilePath));
    try {
      const currentInstallment = db.prepare(`
        SELECT amount_due
        FROM loan_installments
        WHERE loan_id = ? AND installment_number = 1
      `).get(currentArrearsLoan.loanId) as { amount_due: number };
      const nplInstallment = db.prepare(`
        SELECT amount_due
        FROM loan_installments
        WHERE loan_id = ? AND installment_number = 1
      `).get(nplLoan.loanId) as { amount_due: number };
      const restructuredInstallment = db.prepare(`
        SELECT amount_due
        FROM loan_installments
        WHERE loan_id = ? AND installment_number = 1
      `).get(restructuredLoan.loanId) as { amount_due: number };

      db.prepare(`
        UPDATE loan_installments
        SET due_date = ?, amount_paid = 0, status = 'overdue'
        WHERE loan_id = ? AND installment_number = 1
      `).run("2026-03-10T18:45:00.000Z", currentArrearsLoan.loanId);
      db.prepare(`
        UPDATE loan_installments
        SET due_date = ?, amount_paid = 0, status = 'overdue'
        WHERE loan_id = ? AND installment_number = 1
      `).run("2025-12-15T18:45:00.000Z", nplLoan.loanId);
      db.prepare(`
        UPDATE loan_installments
        SET due_date = ?, amount_paid = 0, status = 'overdue'
        WHERE loan_id = ? AND installment_number = 1
      `).run("2026-03-08T18:45:00.000Z", restructuredLoan.loanId);
      db.prepare(`
        UPDATE loans
        SET status = 'restructured'
        WHERE id = ?
      `).run(restructuredLoan.loanId);

      moveRemainingInstallmentsBeyondSnapshot(db, currentArrearsLoan.loanId);
      moveRemainingInstallmentsBeyondSnapshot(db, nplLoan.loanId);
      moveRemainingInstallmentsBeyondSnapshot(db, restructuredLoan.loanId);

      const arrearsReport = await api(
        baseUrl,
        `/api/reports/arrears?branchId=${branchId}&dateTo=${encodeURIComponent("2026-03-20T20:59:59.999Z")}`,
        {
          token: adminToken,
        },
      );
      assert.equal(arrearsReport.status, 200);

      const summary = arrearsReport.data?.summary ?? {};
      const expectedPreNplArrears = Number(Number(currentInstallment.amount_due || 0).toFixed(2));

      assert.equal(
        Number(Number(summary.pre_npl_arrears_amount || 0).toFixed(2)),
        expectedPreNplArrears,
      );
      assert.equal(
        Number(Number(summary.total_arrears_amount || 0).toFixed(2)),
        Number((
          Number(currentInstallment.amount_due || 0)
          + Number(nplInstallment.amount_due || 0)
          + Number(restructuredInstallment.amount_due || 0)
        ).toFixed(2)),
      );
    } finally {
      db.close();
    }
  } finally {
    await stop();
  }
});

test("arrears report maps PAR 30, PAR 60, PAR 90, and NPL to distinct overdue ranges", async () => {
  const { baseUrl, stop, dbFilePath } = await startServer();
  const suffix = uniqueSuffix();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    const branches = await api(baseUrl, "/api/branches?limit=1&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    const branchId = Number(branches.data.data[0].id);
    assert.ok(branchId > 0);
    assert.ok(dbFilePath, "Expected sqlite test database path");

    const par30Loan = await createClientAndApprovedLoan({
      baseUrl,
      token: adminToken,
      fullName: `PAR 30 Loan ${suffix}`,
      phone: `+254731${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      branchId,
      principal: 5000,
      termWeeks: 5,
      approvalToken: checkerToken,
    });
    const par60Loan = await createClientAndApprovedLoan({
      baseUrl,
      token: adminToken,
      fullName: `PAR 60 Loan ${suffix}`,
      phone: `+254730${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      branchId,
      principal: 5000,
      termWeeks: 5,
      approvalToken: checkerToken,
    });
    const par90Loan = await createClientAndApprovedLoan({
      baseUrl,
      token: adminToken,
      fullName: `PAR 90 Loan ${suffix}`,
      phone: `+254729${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      branchId,
      principal: 5000,
      termWeeks: 5,
      approvalToken: checkerToken,
    });
    const nplLoan = await createClientAndApprovedLoan({
      baseUrl,
      token: adminToken,
      fullName: `NPL Loan ${suffix}`,
      phone: `+254728${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      branchId,
      principal: 5000,
      termWeeks: 5,
      approvalToken: checkerToken,
    });

    const db = new Database(String(dbFilePath));
    try {
      const par30Balance = db.prepare(`
        SELECT balance
        FROM loans
        WHERE id = ?
      `).get(par30Loan.loanId) as { balance: number };
      const par60Balance = db.prepare(`
        SELECT balance
        FROM loans
        WHERE id = ?
      `).get(par60Loan.loanId) as { balance: number };
      const par90Balance = db.prepare(`
        SELECT balance
        FROM loans
        WHERE id = ?
      `).get(par90Loan.loanId) as { balance: number };
      const nplBalance = db.prepare(`
        SELECT balance
        FROM loans
        WHERE id = ?
      `).get(nplLoan.loanId) as { balance: number };

      db.prepare(`
        UPDATE loan_installments
        SET due_date = ?, amount_paid = 0, status = 'overdue'
        WHERE loan_id = ? AND installment_number = 1
      `).run("2026-02-18T18:45:00.000Z", par30Loan.loanId);
      db.prepare(`
        UPDATE loan_installments
        SET due_date = ?, amount_paid = 0, status = 'overdue'
        WHERE loan_id = ? AND installment_number = 1
      `).run("2026-01-19T18:45:00.000Z", par60Loan.loanId);
      db.prepare(`
        UPDATE loan_installments
        SET due_date = ?, amount_paid = 0, status = 'overdue'
        WHERE loan_id = ? AND installment_number = 1
      `).run("2025-12-20T18:45:00.000Z", par90Loan.loanId);
      db.prepare(`
        UPDATE loan_installments
        SET due_date = ?, amount_paid = 0, status = 'overdue'
        WHERE loan_id = ? AND installment_number = 1
      `).run("2025-12-19T18:45:00.000Z", nplLoan.loanId);

      moveRemainingInstallmentsBeyondSnapshot(db, par30Loan.loanId);
      moveRemainingInstallmentsBeyondSnapshot(db, par60Loan.loanId);
      moveRemainingInstallmentsBeyondSnapshot(db, par90Loan.loanId);
      moveRemainingInstallmentsBeyondSnapshot(db, nplLoan.loanId);

      const arrearsReport = await api(
        baseUrl,
        `/api/reports/arrears?branchId=${branchId}&dateTo=${encodeURIComponent("2026-03-20T20:59:59.999Z")}`,
        {
          token: adminToken,
        },
      );
      assert.equal(arrearsReport.status, 200);

      const summary = arrearsReport.data?.summary ?? {};
      const totalOutstandingBalance = Number(summary.total_outstanding_balance || 0);
      assert.equal(Number(summary.par30_count || 0), 1);
      assert.equal(Number(summary.par60_count || 0), 1);
      assert.equal(Number(summary.par90_count || 0), 1);
      assert.equal(Number(summary.npl_count || 0), 1);
      assert.equal(Number(Number(summary.par30_balance || 0).toFixed(2)), Number(Number(par30Balance.balance || 0).toFixed(2)));
      assert.equal(Number(Number(summary.par60_balance || 0).toFixed(2)), Number(Number(par60Balance.balance || 0).toFixed(2)));
      assert.equal(Number(Number(summary.par90_balance || 0).toFixed(2)), Number(Number(par90Balance.balance || 0).toFixed(2)));
      assert.equal(Number(Number(summary.npl_balance || 0).toFixed(2)), Number(Number(nplBalance.balance || 0).toFixed(2)));
      assert.equal(
        Number(Number(summary.par30_ratio || 0).toFixed(4)),
        totalOutstandingBalance > 0 ? Number((Number(par30Balance.balance || 0) / totalOutstandingBalance).toFixed(4)) : 0,
      );
      assert.equal(
        Number(Number(summary.par60_ratio || 0).toFixed(4)),
        totalOutstandingBalance > 0 ? Number((Number(par60Balance.balance || 0) / totalOutstandingBalance).toFixed(4)) : 0,
      );
      assert.equal(
        Number(Number(summary.par90_ratio || 0).toFixed(4)),
        totalOutstandingBalance > 0 ? Number((Number(par90Balance.balance || 0) / totalOutstandingBalance).toFixed(4)) : 0,
      );
      assert.equal(
        Number(Number(summary.npl_ratio || 0).toFixed(4)),
        totalOutstandingBalance > 0 ? Number((Number(nplBalance.balance || 0) / totalOutstandingBalance).toFixed(4)) : 0,
      );
      assert.equal(
        Number(Number(summary.at_risk_ratio || 0).toFixed(4)),
        totalOutstandingBalance > 0 ? Number((Number(summary.at_risk_balance || 0) / totalOutstandingBalance).toFixed(4)) : 0,
      );
    } finally {
      db.close();
    }
  } finally {
    await stop();
  }
});

test("capital adequacy report uses exclusive PAR 30, PAR 60, PAR 90, and NPL buckets", async () => {
  const { baseUrl, stop, dbFilePath } = await startServer();
  const suffix = uniqueSuffix();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    const branches = await api(baseUrl, "/api/branches?limit=1&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    const branchId = Number(branches.data.data[0].id);
    assert.ok(branchId > 0);
    assert.ok(dbFilePath, "Expected sqlite test database path");

    const par30Loan = await createClientAndApprovedLoan({
      baseUrl,
      token: adminToken,
      fullName: `Capital PAR 30 Loan ${suffix}`,
      phone: `+254727${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      branchId,
      principal: 5000,
      termWeeks: 5,
      approvalToken: checkerToken,
    });
    const par60Loan = await createClientAndApprovedLoan({
      baseUrl,
      token: adminToken,
      fullName: `Capital PAR 60 Loan ${suffix}`,
      phone: `+254726${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      branchId,
      principal: 5000,
      termWeeks: 5,
      approvalToken: checkerToken,
    });
    const par90Loan = await createClientAndApprovedLoan({
      baseUrl,
      token: adminToken,
      fullName: `Capital PAR 90 Loan ${suffix}`,
      phone: `+254725${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      branchId,
      principal: 5000,
      termWeeks: 5,
      approvalToken: checkerToken,
    });
    const nplLoan = await createClientAndApprovedLoan({
      baseUrl,
      token: adminToken,
      fullName: `Capital NPL Loan ${suffix}`,
      phone: `+254724${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      branchId,
      principal: 5000,
      termWeeks: 5,
      approvalToken: checkerToken,
    });

    const db = new Database(String(dbFilePath));
    try {
      const par30Balance = db.prepare(`
        SELECT balance
        FROM loans
        WHERE id = ?
      `).get(par30Loan.loanId) as { balance: number };
      const par60Balance = db.prepare(`
        SELECT balance
        FROM loans
        WHERE id = ?
      `).get(par60Loan.loanId) as { balance: number };
      const par90Balance = db.prepare(`
        SELECT balance
        FROM loans
        WHERE id = ?
      `).get(par90Loan.loanId) as { balance: number };
      const nplBalance = db.prepare(`
        SELECT balance
        FROM loans
        WHERE id = ?
      `).get(nplLoan.loanId) as { balance: number };

      db.prepare(`
        UPDATE loan_installments
        SET due_date = ?, amount_paid = 0, status = 'overdue'
        WHERE loan_id = ? AND installment_number = 1
      `).run("2026-02-18T18:45:00.000Z", par30Loan.loanId);
      db.prepare(`
        UPDATE loan_installments
        SET due_date = ?, amount_paid = 0, status = 'overdue'
        WHERE loan_id = ? AND installment_number = 1
      `).run("2026-01-19T18:45:00.000Z", par60Loan.loanId);
      db.prepare(`
        UPDATE loan_installments
        SET due_date = ?, amount_paid = 0, status = 'overdue'
        WHERE loan_id = ? AND installment_number = 1
      `).run("2025-12-20T18:45:00.000Z", par90Loan.loanId);
      db.prepare(`
        UPDATE loan_installments
        SET due_date = ?, amount_paid = 0, status = 'overdue'
        WHERE loan_id = ? AND installment_number = 1
      `).run("2025-12-19T18:45:00.000Z", nplLoan.loanId);

      moveRemainingInstallmentsBeyondSnapshot(db, par30Loan.loanId);
      moveRemainingInstallmentsBeyondSnapshot(db, par60Loan.loanId);
      moveRemainingInstallmentsBeyondSnapshot(db, par90Loan.loanId);
      moveRemainingInstallmentsBeyondSnapshot(db, nplLoan.loanId);

      const capitalAdequacyReport = await api(
        baseUrl,
        `/api/reports/capital-adequacy?dateTo=${encodeURIComponent("2026-03-20T20:59:59.999Z")}`,
        {
          token: adminToken,
        },
      );
      assert.equal(capitalAdequacyReport.status, 200);

      const payload = capitalAdequacyReport.data ?? {};
      const expectedPar30Balance = Number(Number(par30Balance.balance || 0).toFixed(2));
      const expectedPar60Balance = Number(Number(par60Balance.balance || 0).toFixed(2));
      const expectedPar90Balance = Number(Number(par90Balance.balance || 0).toFixed(2));
      const expectedNplBalance = Number(Number(nplBalance.balance || 0).toFixed(2));
      const grossOutstanding = Number(payload.gross_outstanding || 0);

      assert.equal(Number(Number(payload.par30_balance || 0).toFixed(2)), expectedPar30Balance);
      assert.equal(Number(Number(payload.par60_balance || 0).toFixed(2)), expectedPar60Balance);
      assert.equal(Number(Number(payload.par90_balance || 0).toFixed(2)), expectedPar90Balance);
      assert.equal(Number(Number(payload.npl_balance || 0).toFixed(2)), expectedNplBalance);
      assert.equal(
        Number(Number(payload.par30_ratio || 0).toFixed(4)),
        grossOutstanding > 0 ? Number((expectedPar30Balance / grossOutstanding).toFixed(4)) : 0,
      );
      assert.equal(
        Number(Number(payload.par60_ratio || 0).toFixed(4)),
        grossOutstanding > 0 ? Number((expectedPar60Balance / grossOutstanding).toFixed(4)) : 0,
      );
      assert.equal(
        Number(Number(payload.par90_ratio || 0).toFixed(4)),
        grossOutstanding > 0 ? Number((expectedPar90Balance / grossOutstanding).toFixed(4)) : 0,
      );
      assert.equal(
        Number(Number(payload.npl_ratio || 0).toFixed(4)),
        grossOutstanding > 0 ? Number((expectedNplBalance / grossOutstanding).toFixed(4)) : 0,
      );
    } finally {
      db.close();
    }
  } finally {
    await stop();
  }
});

test("disbursement report marks repeat loans using prior client disbursement history", async () => {
  const { baseUrl, stop, dbFilePath } = await startServer();
  const suffix = uniqueSuffix();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const branches = await api(baseUrl, "/api/branches?limit=1&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    const branchId = Number(branches.data.data[0].id);
    assert.ok(branchId > 0);
    assert.ok(dbFilePath, "Expected sqlite test database path");

    const client = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: `Disbursement Repeat Client ${suffix}`,
        phone: `+254738${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
        branchId,
      },
    });
    assert.equal(client.status, 201);
    const clientId = Number(client.data.id);

    const firstLoan = await createApprovedLoanForExistingClient({
      baseUrl,
      token: adminToken,
      clientId,
      principal: 4000,
      termWeeks: 5,
    });

    const db = new Database(String(dbFilePath));
    try {
      db.prepare("UPDATE loans SET disbursed_at = ?, external_reference = ? WHERE id = ?")
        .run("2026-03-02T08:00:00.000Z", "UC-FIRST-LOAN", firstLoan.loanId);
      db.prepare("UPDATE loans SET registration_fee = 0 WHERE id = ?")
        .run(firstLoan.loanId);
      db.prepare("UPDATE loans SET status = 'closed', repaid_total = expected_total, balance = 0 WHERE id = ?")
        .run(firstLoan.loanId);

      const secondLoan = await createApprovedLoanForExistingClient({
        baseUrl,
        token: adminToken,
        clientId,
        principal: 5000,
        termWeeks: 5,
      });
      db.prepare("UPDATE loans SET disbursed_at = ?, external_reference = ? WHERE id = ?")
        .run("2026-03-05T09:00:00.000Z", "UC-REPEAT-LOAN", secondLoan.loanId);
      db.prepare("UPDATE loans SET registration_fee = 250 WHERE id = ?")
        .run(secondLoan.loanId);

      const disbursementReport = await api(
        baseUrl,
        `/api/reports/disbursements?branchId=${branchId}&dateFrom=${encodeURIComponent("2026-03-01T00:00:00.000Z")}&dateTo=${encodeURIComponent("2026-03-07T23:59:59.999Z")}`,
        {
          token: adminToken,
        },
      );
      assert.equal(disbursementReport.status, 200);

      const reportRows = Array.isArray(disbursementReport.data?.reportRows) ? disbursementReport.data.reportRows : [];
      const firstRow = reportRows.find((row) => Number(row.LoanId) === firstLoan.loanId);
      const secondRow = reportRows.find((row) => Number(row.LoanId) === secondLoan.loanId);
      assert.ok(firstRow, "Expected first disbursed loan in report rows");
      assert.ok(secondRow, "Expected second disbursed loan in report rows");
      assert.equal(String(firstRow.Loantype), "New");
      assert.equal(String(secondRow.Loantype), "Repeat");
    } finally {
      db.close();
    }
  } finally {
    await stop();
  }
});

test("officer performance counts new and repeat loans from client history instead of fee proxies", async () => {
  const { baseUrl, stop, dbFilePath } = await startServer();
  const suffix = uniqueSuffix();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const me = await api(baseUrl, "/api/auth/me", { token: adminToken });
    assert.equal(me.status, 200);
    const adminUserId = Number(me.data.id);
    assert.ok(adminUserId > 0);

    const branches = await api(baseUrl, "/api/branches?limit=1&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    const branchId = Number(branches.data.data[0].id);
    assert.ok(branchId > 0);
    assert.ok(dbFilePath, "Expected sqlite test database path");

    const client = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: `Officer Repeat Client ${suffix}`,
        phone: `+254739${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
        branchId,
      },
    });
    assert.equal(client.status, 201);
    const clientId = Number(client.data.id);

    const firstLoan = await createApprovedLoanForExistingClient({
      baseUrl,
      token: adminToken,
      clientId,
      principal: 4000,
      termWeeks: 5,
    });

    const db = new Database(String(dbFilePath));
    try {
      db.prepare("UPDATE loans SET disbursed_at = ?, registration_fee = 0 WHERE id = ?")
        .run("2026-03-02T08:00:00.000Z", firstLoan.loanId);
      db.prepare("UPDATE loans SET status = 'closed', repaid_total = expected_total, balance = 0 WHERE id = ?")
        .run(firstLoan.loanId);

      const secondLoan = await createApprovedLoanForExistingClient({
        baseUrl,
        token: adminToken,
        clientId,
        principal: 5000,
        termWeeks: 5,
      });
      db.prepare("UPDATE loans SET disbursed_at = ?, registration_fee = 250 WHERE id = ?")
        .run("2026-03-05T09:00:00.000Z", secondLoan.loanId);

      const officerPerformance = await api(
        baseUrl,
        `/api/reports/officer-performance?branchId=${branchId}&dateFrom=${encodeURIComponent("2026-03-01T00:00:00.000Z")}&dateTo=${encodeURIComponent("2026-03-07T23:59:59.999Z")}`,
        {
          token: adminToken,
        },
      );
      assert.equal(officerPerformance.status, 200);

      const officers = Array.isArray(officerPerformance.data?.officers) ? officerPerformance.data.officers : [];
      const adminRow = officers.find((row) => Number(row.user_id) === adminUserId);
      assert.ok(adminRow, "Expected officer performance row for admin disbursements");
      assert.equal(Number(adminRow.loans_disbursed || 0), 2);
      assert.equal(Number(adminRow.new_client_loans || 0), 1);
      assert.equal(Number(adminRow.repeat_client_loans || 0), 1);
    } finally {
      db.close();
    }
  } finally {
    await stop();
  }
});

test("aging report uses report snapshot date instead of now for overdue buckets", async () => {
  const { baseUrl, stop, dbFilePath } = await startServer();
  const suffix = uniqueSuffix();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const branches = await api(baseUrl, "/api/branches?limit=1&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    const branchId = Number(branches.data.data[0].id);
    assert.ok(branchId > 0);
    assert.ok(dbFilePath, "Expected sqlite test database path");

    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    const agingLoan = await createClientAndApprovedLoan({
      baseUrl,
      token: adminToken,
      fullName: `Aging Snapshot Loan ${suffix}`,
      phone: `+254740${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      branchId,
      principal: 5000,
      termWeeks: 5,
      approvalToken: checkerToken,
    });
    const db = new Database(String(dbFilePath));
    try {
      db.prepare(`
        UPDATE loan_installments
        SET due_date = ?, amount_paid = 0, status = 'overdue'
        WHERE loan_id = ? AND installment_number = 1
      `).run("2026-02-20T00:00:00.000Z", agingLoan.loanId);

      db.prepare(`
        UPDATE loan_installments
        SET due_date = ?, amount_paid = 0, status = 'pending'
        WHERE loan_id = ? AND installment_number = 2
      `).run("2026-04-20T00:00:00.000Z", agingLoan.loanId);

      const agingReport = await api(
        baseUrl,
        `/api/reports/aging?branchId=${branchId}&dateFrom=${encodeURIComponent("2026-02-01T00:00:00.000Z")}&dateTo=${encodeURIComponent("2026-02-25T23:59:59.999Z")}`,
        {
          token: adminToken,
        },
      );
      assert.equal(agingReport.status, 200);

      assert.equal(Number(agingReport.data?.summary?.loans_in_arrears || 0), 1);
      const loanAgingDetails = Array.isArray(agingReport.data?.loanAgingDetails)
        ? agingReport.data.loanAgingDetails
        : [];
      const agingRow = loanAgingDetails.find((row) => Number(row.loan_id) === agingLoan.loanId);
      assert.ok(agingRow, "Expected aging detail row for seeded overdue loan");
      assert.equal(Number(agingRow.daysinarrears || 0), 5);
    } finally {
      db.close();
    }
  } finally {
    await stop();
  }
});



