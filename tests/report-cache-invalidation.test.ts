import test from "node:test";
import assert from "node:assert/strict";
import { startServer, api, loginAsAdmin, approveLoan, createHighRiskReviewerToken } from "./integration-helpers.js";

function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

/**
 * @param {{ baseUrl: string, adminToken: string, checkerToken: string, branchId: number }} params
 * @returns {Promise<void>}
 */
async function seedRepaymentData({ baseUrl, adminToken, checkerToken, branchId }) {
  const suffix = uniqueSuffix();
  const createClient = await api(baseUrl, "/api/clients", {
    method: "POST",
    token: adminToken,
    body: {
      fullName: `Cache Test Client ${suffix}`,
      phone: `+254700${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
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
      termWeeks: 8,
      branchId,
    },
  });
  assert.equal(createLoan.status, 201);
  const loanId = Number(createLoan.data.id);
  assert.ok(loanId > 0);

  const approveCreatedLoan = await approveLoan(baseUrl, loanId, checkerToken, {
    notes: "Approve seed loan for cache invalidation test",
  });
  assert.equal(approveCreatedLoan.status, 200);

  const createRepayment = await api(baseUrl, `/api/loans/${loanId}/repayments`, {
    method: "POST",
    token: adminToken,
    body: {
      amount: 200,
      note: "Cache invalidation seed repayment",
    },
  });
  assert.equal(createRepayment.status, 201);
}

test("branch update invalidates cached collections report branch metadata", async () => {
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
    assert.ok(Array.isArray(branches.data.data));
    assert.ok(branches.data.data.length > 0);

    const targetBranch = branches.data.data[0];
    const branchId = Number(targetBranch.id);
    const initialBranchName = String(targetBranch.name);
    assert.ok(branchId > 0);

    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    await seedRepaymentData({ baseUrl, adminToken, checkerToken, branchId });


    const firstReport = await api(baseUrl, "/api/reports/collections", {
      token: adminToken,
    });
    assert.equal(firstReport.status, 200);
    const firstBranchRow = firstReport.data.branchBreakdown.find((row) => Number(row.branch_id) === branchId);
    assert.ok(firstBranchRow, "Expected branch row in first collections report");
    assert.equal(firstBranchRow.branch_name, initialBranchName);

    const updatedBranchName = `${initialBranchName} Cache ${uniqueSuffix().slice(-6)}`;
    const updateBranch = await api(baseUrl, `/api/branches/${branchId}`, {
      method: "PATCH",
      token: adminToken,
      body: {
        name: updatedBranchName,
      },
    });
    assert.equal(updateBranch.status, 200);
    assert.equal(updateBranch.data.branch.name, updatedBranchName);

    const secondReport = await api(baseUrl, "/api/reports/collections", {
      token: adminToken,
    });
    assert.equal(secondReport.status, 200);
    const secondBranchRow = secondReport.data.branchBreakdown.find((row) => Number(row.branch_id) === branchId);
    assert.ok(secondBranchRow, "Expected branch row in second collections report");
    assert.equal(secondBranchRow.branch_name, updatedBranchName);
  } finally {
    await stop();
  }
});

test("user profile full-name update invalidates cached officer performance report", async () => {
  const { baseUrl, stop } = await startServer({
    envOverrides: {
      REPORT_CACHE_ENABLED: "true",
      REPORT_CACHE_TTL_MS: "600000",
    },
  });

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const me = await api(baseUrl, "/api/auth/me", {
      token: adminToken,
    });
    assert.equal(me.status, 200);
    const adminUserId = Number(me.data.id);
    assert.ok(adminUserId > 0);

    const branches = await api(baseUrl, "/api/branches?limit=200&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    assert.ok(Array.isArray(branches.data.data));
    assert.ok(branches.data.data.length > 0);
    const branchId = Number(branches.data.data[0].id);
    assert.ok(branchId > 0);

    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    await seedRepaymentData({ baseUrl, adminToken, checkerToken, branchId });


    const firstReport = await api(baseUrl, "/api/reports/officer-performance", {
      token: adminToken,
    });
    assert.equal(firstReport.status, 200);
    const firstOfficerRow = firstReport.data.officers.find((row) => Number(row.user_id) === adminUserId);
    assert.ok(firstOfficerRow, "Expected officer row for admin user in first report");

    const updatedFullName = `Admin Cache ${uniqueSuffix().slice(-6)}`;
    const updateProfile = await api(baseUrl, `/api/users/${adminUserId}/profile`, {
      method: "PATCH",
      token: adminToken,
      body: {
        fullName: updatedFullName,
      },
    });
    assert.equal(updateProfile.status, 200);
    assert.equal(updateProfile.data.user.full_name, updatedFullName);

    const secondReport = await api(baseUrl, "/api/reports/officer-performance", {
      token: adminToken,
    });
    assert.equal(secondReport.status, 200);
    const secondOfficerRow = secondReport.data.officers.find((row) => Number(row.user_id) === adminUserId);
    assert.ok(secondOfficerRow, "Expected officer row for admin user in second report");
    assert.equal(secondOfficerRow.officer_name, updatedFullName);
  } finally {
    await stop();
  }
});
