import test from "node:test";
import assert from "node:assert/strict";
import { api, approveLoan, loginAsAdmin, startServer } from "./integration-helpers.js";

function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function fetchBinary(baseUrl: string, route: string, token: string) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return {
    status: response.status,
    contentType: response.headers.get("content-type") || "",
    contentDisposition: response.headers.get("content-disposition") || "",
    body: Buffer.from(await response.arrayBuffer()).toString("utf8"),
  };
}

test("clients list supports dormant borrower filtering", async () => {
  const { baseUrl, stop } = await startServer();
  const suffix = uniqueSuffix();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const createDormantClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: `Dormant Client ${suffix}`,
        phone: "+254700112233",
      },
    });
    assert.equal(createDormantClient.status, 201);
    const dormantClientId = Number(createDormantClient.data.id);

    const createDormantLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: dormantClientId,
        principal: 3000,
        termWeeks: 5,
      },
    });
    assert.equal(createDormantLoan.status, 201);
    const dormantLoanId = Number(createDormantLoan.data.id);

    const approveDormantLoan = await approveLoan(baseUrl, dormantLoanId, adminToken, {
      notes: "Approve dormant borrower seed loan",
    });
    assert.equal(approveDormantLoan.status, 200);

    const repayDormantLoan = await api(baseUrl, `/api/loans/${dormantLoanId}/repayments`, {
      method: "POST",
      token: adminToken,
      body: {
        amount: Number(approveDormantLoan.data.balance),
      },
    });
    assert.equal(repayDormantLoan.status, 201);

    const dormantLoanDetail = await api(baseUrl, `/api/loans/${dormantLoanId}`, {
      token: adminToken,
    });
    assert.equal(dormantLoanDetail.status, 200);
    assert.equal(String(dormantLoanDetail.data.status).toLowerCase(), "closed");

    const createActiveClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: `Active Client ${suffix}`,
        phone: "+254700223344",
      },
    });
    assert.equal(createActiveClient.status, 201);
    const activeClientId = Number(createActiveClient.data.id);

    const createActiveLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: activeClientId,
        principal: 4000,
        termWeeks: 7,
      },
    });
    assert.equal(createActiveLoan.status, 201);
    const activeLoanId = Number(createActiveLoan.data.id);

    const approveActiveLoan = await approveLoan(baseUrl, activeLoanId, adminToken, {
      notes: "Approve active borrower seed loan",
    });
    assert.equal(approveActiveLoan.status, 200);
    assert.equal(String(approveActiveLoan.data.status).toLowerCase(), "active");

    const dormantList = await api(baseUrl, "/api/clients?dormantOnly=true&minLoans=1&limit=20", {
      token: adminToken,
    });
    assert.equal(dormantList.status, 200);

    const dormantIds = dormantList.data.data.map((row: Record<string, unknown>) => Number(row.id));
    assert.ok(dormantIds.includes(dormantClientId));
    assert.ok(!dormantIds.includes(activeClientId));

    const dormantRow = dormantList.data.data.find((row: Record<string, unknown>) => Number(row.id) === dormantClientId);
    assert.equal(Number(dormantRow?.closed_loan_count || 0), 1);
    assert.equal(Number(dormantRow?.open_loan_count || 0), 0);

    const dormantExport = await fetchBinary(baseUrl, "/api/clients?dormantOnly=true&minLoans=1&limit=20&format=csv", adminToken);
    assert.equal(dormantExport.status, 200);
    assert.ok(dormantExport.contentType.includes("text/csv"));
    assert.ok(dormantExport.contentDisposition.includes("attachment; filename=\"dormant-borrowers-"));
    assert.ok(dormantExport.body.startsWith("\"BorrowerRef\",\"FullName\",\"Phone\",\"NationalId\",\"Branch\",\"Agent\",\"LoanCount\",\"CompletedLoans\",\"OpenLoans\",\"KycStatus\",\"OnboardingStatus\",\"FeePaymentStatus\",\"Active\",\"CreatedAt\",\"UpdatedAt\""));
    assert.ok(dormantExport.body.includes(`"Dormant Client ${suffix}"`));
    assert.ok(!dormantExport.body.includes(`"Active Client ${suffix}"`));
  } finally {
    await stop();
  }
});