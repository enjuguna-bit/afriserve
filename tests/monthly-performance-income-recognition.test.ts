import test from "node:test";
import assert from "node:assert/strict";
import {
  startServer,
  api,
  loginAsAdmin,
  createHighRiskReviewerToken,
  approveLoan,
} from "./integration-helpers.js";

function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function assertApprox(actual: number, expected: number, epsilon = 0.01) {
  assert.ok(
    Math.abs(Number(actual) - Number(expected)) <= epsilon,
    `Expected ${actual} to be within ${epsilon} of ${expected}`,
  );
}

test("monthly performance recognizes interest after repayment collection, not at disbursement", async () => {
  const { baseUrl, stop } = await startServer();
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

    const month = new Date().toISOString();
    const monthlyPerformancePath = `/api/reports/performance/monthly?branchId=${branchId}&month=${encodeURIComponent(month)}`;

    const baselinePerformance = await api(baseUrl, monthlyPerformancePath, {
      token: adminToken,
    });
    assert.equal(baselinePerformance.status, 200);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: `Monthly Performance Client ${suffix}`,
        phone: `+254736${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
        branchId,
      },
    });
    assert.equal(createClient.status, 201);
    const clientId = Number(createClient.data.id);
    assert.ok(clientId > 0);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId,
        principal: 1200,
        termWeeks: 10,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);
    assert.ok(loanId > 0);

    const approveCreatedLoan = await approveLoan(baseUrl, loanId, checkerToken, {
      notes: "Approve loan for monthly performance recognition test",
    });
    assert.equal(approveCreatedLoan.status, 200);

    const afterDisbursementPerformance = await api(baseUrl, monthlyPerformancePath, {
      token: adminToken,
    });
    assert.equal(afterDisbursementPerformance.status, 200);

    const baselineInterest = Number(baselinePerformance.data.interest_income || 0);
    const baselinePenalty = Number(baselinePerformance.data.penalty_income || 0);
    const baselineTenWeekInterest = Number(
      baselinePerformance.data.interest_by_product?.["10w"]?.amount || 0,
    );

    const disbursementInterest = Number(afterDisbursementPerformance.data.interest_income || 0);
    const disbursementPenalty = Number(afterDisbursementPerformance.data.penalty_income || 0);
    const disbursementTenWeekInterest = Number(
      afterDisbursementPerformance.data.interest_by_product?.["10w"]?.amount || 0,
    );

    assertApprox(disbursementInterest - baselineInterest, 0);
    assertApprox(disbursementPenalty - baselinePenalty, 0);
    assertApprox(disbursementTenWeekInterest - baselineTenWeekInterest, 0);

    const repayment = await api(baseUrl, `/api/loans/${loanId}/repayments`, {
      method: "POST",
      token: adminToken,
      body: {
        amount: 250,
        note: "Repayment for monthly performance recognition test",
      },
    });
    assert.equal(repayment.status, 201);

    const collectedInterest = Number(repayment.data.repayment?.interest_amount || 0);
    const collectedPenalty = Number(repayment.data.repayment?.penalty_amount || 0);
    assert.ok(collectedInterest > 0, "Expected the repayment to allocate some interest");

    const afterRepaymentPerformance = await api(baseUrl, monthlyPerformancePath, {
      token: adminToken,
    });
    assert.equal(afterRepaymentPerformance.status, 200);

    const repaymentInterest = Number(afterRepaymentPerformance.data.interest_income || 0);
    const repaymentPenalty = Number(afterRepaymentPerformance.data.penalty_income || 0);
    const repaymentTenWeekInterest = Number(
      afterRepaymentPerformance.data.interest_by_product?.["10w"]?.amount || 0,
    );
    const repaymentTenWeekLoanCount = Number(
      afterRepaymentPerformance.data.interest_by_product?.["10w"]?.loanCount || 0,
    );
    const disbursementTenWeekLoanCount = Number(
      afterDisbursementPerformance.data.interest_by_product?.["10w"]?.loanCount || 0,
    );

    assertApprox(repaymentInterest - disbursementInterest, collectedInterest);
    assertApprox(repaymentPenalty - disbursementPenalty, collectedPenalty);
    assertApprox(repaymentTenWeekInterest - disbursementTenWeekInterest, collectedInterest);
    assert.equal(repaymentTenWeekLoanCount, disbursementTenWeekLoanCount + 1);
  } finally {
    await stop();
  }
});
