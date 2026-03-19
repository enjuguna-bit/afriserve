import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { api, loginAsAdmin, startServer } from "./integration-helpers.js";

const isPostgresTestMode = String(
  process.env.TEST_DB_CLIENT
    || process.env.DB_CLIENT
    || "sqlite",
).toLowerCase() === "postgres";

test("loan lifecycle remains continuous from client onboarding through arrears tracking", { skip: isPostgresTestMode }, async () => {
  const { baseUrl, stop, dbFilePath } = await startServer();

  try {
    assert.ok(dbFilePath, "Expected sqlite database path");
    const adminToken = await loginAsAdmin(baseUrl);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Lifecycle Continuity Client",
        phone: "+254700003001",
      },
    });
    assert.equal(createClient.status, 201);
    const clientId = Number(createClient.data.id);
    assert.ok(clientId > 0);

    const initialOnboarding = await api(baseUrl, `/api/clients/${clientId}/onboarding-status`, {
      token: adminToken,
    });
    assert.equal(initialOnboarding.status, 200);
    assert.equal(String(initialOnboarding.data.onboardingStatus), "registered");
    assert.equal(Boolean(initialOnboarding.data.checklist.complete), false);

    const blockedLoanCreate = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      skipLoanOnboardingAutomation: true,
      body: {
        clientId,
        principal: 3200,
        termWeeks: 8,
      },
    });
    assert.equal(blockedLoanCreate.status, 400);
    assert.match(String(blockedLoanCreate.data?.message || ""), /onboarding is incomplete/i);

    const addGuarantor = await api(baseUrl, `/api/clients/${clientId}/guarantors`, {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Lifecycle Guarantor",
        phone: "+254711003001",
        nationalId: "LCG-3001",
        monthlyIncome: 52000,
        guaranteeAmount: 30000,
      },
    });
    assert.equal(addGuarantor.status, 201);

    const addCollateral = await api(baseUrl, `/api/clients/${clientId}/collaterals`, {
      method: "POST",
      token: adminToken,
      body: {
        assetType: "vehicle",
        description: "Lifecycle workflow van",
        estimatedValue: 780000,
        registrationNumber: "KCY3001",
        logbookNumber: "LC-3001",
      },
    });
    assert.equal(addCollateral.status, 201);

    const recordFees = await api(baseUrl, `/api/clients/${clientId}/fees`, {
      method: "POST",
      token: adminToken,
      body: {
        amount: 500,
        note: "Lifecycle onboarding fees",
      },
    });
    assert.equal(recordFees.status, 200);

    const readyOnboarding = await api(baseUrl, `/api/clients/${clientId}/onboarding-status`, {
      token: adminToken,
    });
    assert.equal(readyOnboarding.status, 200);
    assert.equal(String(readyOnboarding.data.onboardingStatus), "registered");
    assert.equal(Boolean(readyOnboarding.data.checklist.complete), false);
    assert.equal(Boolean(readyOnboarding.data.readyForLoanApplication), false);
    assert.equal(String(readyOnboarding.data.nextStep), "start_kyc");

    const verifyKyc = await api(baseUrl, `/api/clients/${clientId}/kyc`, {
      method: "PATCH",
      token: adminToken,
      body: {
        status: "verified",
        note: "Lifecycle continuity verification",
      },
    });
    assert.equal(verifyKyc.status, 200);

    const completedOnboarding = await api(baseUrl, `/api/clients/${clientId}/onboarding-status`, {
      token: adminToken,
    });
    assert.equal(completedOnboarding.status, 200);
    assert.equal(String(completedOnboarding.data.onboardingStatus), "complete");
    assert.equal(String(completedOnboarding.data.kycStatus), "verified");

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      skipLoanOnboardingAutomation: true,
      body: {
        clientId,
        principal: 3200,
        termWeeks: 8,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);
    assert.ok(loanId > 0);

    const createdLoanDetail = await api(baseUrl, `/api/loans/${loanId}`, {
      token: adminToken,
    });
    assert.equal(createdLoanDetail.status, 200);
    assert.equal(String(createdLoanDetail.data.workflow.lifecycle_stage), "loan_application");
    assert.equal(Number(createdLoanDetail.data.workflow.guarantor_count || 0), 1);
    assert.equal(Number(createdLoanDetail.data.workflow.collateral_count || 0), 1);

    const linkedGuarantors = await api(baseUrl, `/api/loans/${loanId}/guarantors`, {
      token: adminToken,
    });
    assert.equal(linkedGuarantors.status, 200);
    assert.ok(Array.isArray(linkedGuarantors.data));
    assert.equal(Number(linkedGuarantors.data[0]?.guarantee_amount || 0), 30000);

    const pendingApprovalQueue = await api(baseUrl, "/api/loans/pending-approval?limit=10", {
      token: adminToken,
    });
    assert.equal(pendingApprovalQueue.status, 200);
    const queuedLoan = pendingApprovalQueue.data.data.find((row) => Number(row.loan_id) === loanId);
    assert.ok(queuedLoan, "Expected loan to appear in pending approval queue");
    assert.equal(Number(queuedLoan.approval_ready || 0), 1);
    assert.deepEqual(queuedLoan.approval_blockers || [], []);

    const suspendKyc = await api(baseUrl, `/api/clients/${clientId}/kyc`, {
      method: "PATCH",
      token: adminToken,
      body: {
        status: "suspended",
        note: "Pause approval while compliance reviews the file",
      },
    });
    assert.equal(suspendKyc.status, 200);

    const blockedApprovalQueue = await api(baseUrl, "/api/loans/pending-approval?limit=10", {
      token: adminToken,
    });
    assert.equal(blockedApprovalQueue.status, 200);
    const blockedQueuedLoan = blockedApprovalQueue.data.data.find((row) => Number(row.loan_id) === loanId);
    assert.ok(blockedQueuedLoan, "Expected loan to remain in pending approval queue while blocked");
    assert.equal(Number(blockedQueuedLoan.approval_ready || 0), 0);
    assert.ok(
      Array.isArray(blockedQueuedLoan.approval_blockers)
      && blockedQueuedLoan.approval_blockers.some((blocker) => /verify client kyc/i.test(String(blocker))),
      "Expected pending approval queue to expose the shared KYC blocker",
    );

    const blockedApproval = await api(baseUrl, `/api/loans/${loanId}/approve`, {
      method: "POST",
      token: adminToken,
      body: {
        notes: "This approval should stay blocked until KYC is re-verified",
      },
    });
    assert.equal(blockedApproval.status, 409);
    assert.match(String(blockedApproval.data?.message || ""), /not ready for approval/i);

    const restoreKyc = await api(baseUrl, `/api/clients/${clientId}/kyc`, {
      method: "PATCH",
      token: adminToken,
      body: {
        status: "verified",
        note: "Compliance hold cleared",
      },
    });
    assert.equal(restoreKyc.status, 200);

    const approval = await api(baseUrl, `/api/loans/${loanId}/approve`, {
      method: "POST",
      token: adminToken,
      body: {
        notes: "Approve lifecycle continuity loan",
      },
    });
    assert.equal(approval.status, 200);
    assert.equal(String(approval.data.status), "approved");

    const approvedStatement = await api(baseUrl, `/api/loans/${loanId}/statement`, {
      token: adminToken,
    });
    assert.equal(approvedStatement.status, 200);
    assert.equal(String(approvedStatement.data.workflow.lifecycle_stage), "approved_waiting_disbursement");
    assert.equal(Boolean(approvedStatement.data.workflow.can_disburse), true);

    const disbursement = await api(baseUrl, `/api/loans/${loanId}/disburse`, {
      method: "POST",
      token: adminToken,
      body: {
        notes: "Disburse lifecycle continuity loan",
      },
    });
    assert.equal(disbursement.status, 200);
    assert.equal(String(disbursement.data.loan.status), "active");

    const activeStatement = await api(baseUrl, `/api/loans/${loanId}/statement`, {
      token: adminToken,
    });
    assert.equal(activeStatement.status, 200);
    assert.equal(String(activeStatement.data.workflow.lifecycle_stage), "waiting_for_dues");
    assert.equal(Boolean(activeStatement.data.workflow.can_record_repayment), true);

    const db = new Database(String(dbFilePath));
    try {
      db.prepare(`
        UPDATE loan_installments
        SET due_date = datetime('now', '-5 days'),
            status = 'pending',
            amount_paid = 0,
            paid_at = NULL
        WHERE loan_id = ?
          AND installment_number = 1
      `).run(loanId);
    } finally {
      db.close();
    }

    const arrearsListBeforeSchedule = await api(baseUrl, "/api/loans?limit=20&sortBy=id&sortOrder=desc", {
      token: adminToken,
    });
    assert.equal(arrearsListBeforeSchedule.status, 200);
    const listedLoanBeforeSchedule = arrearsListBeforeSchedule.data.data.find((row) => Number(row.id) === loanId);
    assert.ok(listedLoanBeforeSchedule, "Expected loan to appear in portfolio list before schedule lookup");
    assert.equal(String(listedLoanBeforeSchedule.workflow_stage), "arrears");

    const arrearsSchedule = await api(baseUrl, `/api/loans/${loanId}/schedule`, {
      token: adminToken,
    });
    assert.equal(arrearsSchedule.status, 200);
    assert.ok(Number(arrearsSchedule.data.workflow.installment_summary.overdue_installments || 0) >= 1);
    assert.equal(String(arrearsSchedule.data.workflow.lifecycle_stage), "arrears");

    const arrearsList = await api(baseUrl, "/api/loans?limit=20&sortBy=id&sortOrder=desc", {
      token: adminToken,
    });
    assert.equal(arrearsList.status, 200);
    const listedLoan = arrearsList.data.data.find((row) => Number(row.id) === loanId);
    assert.ok(listedLoan, "Expected loan to appear in portfolio list");
    assert.equal(String(listedLoan.workflow_stage), "arrears");
  } finally {
    await stop();
  }
});
