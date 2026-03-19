import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
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
    body: Buffer.from(await response.arrayBuffer()).toString("utf8"),
  };
}

async function createApprovedLoan({
  baseUrl,
  token,
  branchId,
  fullName,
  phone,
  principal,
  termWeeks,
}: {
  baseUrl: string;
  token: string;
  branchId: number;
  fullName: string;
  phone: string;
  principal: number;
  termWeeks: number;
}) {
  const createClient = await api(baseUrl, "/api/clients", {
    method: "POST",
    token,
    body: {
      fullName,
      phone,
      branchId,
    },
  });
  assert.equal(createClient.status, 201);

  const createLoan = await api(baseUrl, "/api/loans", {
    method: "POST",
    token,
    body: {
      clientId: Number(createClient.data.id),
      principal,
      termWeeks,
    },
  });
  assert.equal(createLoan.status, 201);

  const approval = await approveLoan(baseUrl, Number(createLoan.data.id), token, {
    notes: "Approve loan for legacy export template coverage",
  });
  assert.equal(approval.status, 200);

  return {
    clientId: Number(createClient.data.id),
    loanId: Number(createLoan.data.id),
  };
}

test("legacy dues, arrears, and disbursment exports match the expected template headers and field mappings", async () => {
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

    const seededLoan = await createApprovedLoan({
      baseUrl,
      token: adminToken,
      branchId,
      fullName: `Legacy Export Client ${suffix}`,
      phone: `+254735${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      principal: 5000,
      termWeeks: 5,
    });

    const db = new Database(String(dbFilePath));
    try {
      const loan = db
        .prepare(`
          SELECT id, client_id, principal, expected_total, disbursed_at
          FROM loans
          WHERE id = ?
        `)
        .get(seededLoan.loanId) as {
        id: number;
        client_id: number;
        principal: number;
        expected_total: number;
        disbursed_at: string;
      };

      assert.ok(loan);

      db.prepare("UPDATE loans SET external_reference = ?, repaid_total = ?, balance = ? WHERE id = ?")
        .run("UC3BA88XD0", 125, Number(loan.expected_total) - 125, seededLoan.loanId);

      db.prepare(`
        UPDATE loan_installments
        SET amount_paid = ?, status = ?
        WHERE loan_id = ? AND installment_number = 1
      `).run(125, "pending", seededLoan.loanId);

      const fiveDaysAgoIso = new Date(Date.now() - (5 * 24 * 60 * 60 * 1000)).toISOString();
      db.prepare(`
        UPDATE loan_installments
        SET due_date = ?, amount_paid = ?, status = ?
        WHERE loan_id = ? AND installment_number = 2
      `).run(fiveDaysAgoIso, 50, "overdue", seededLoan.loanId);

      db.prepare("UPDATE loans SET repaid_total = ?, balance = ? WHERE id = ?")
        .run(175, Number(loan.expected_total) - 175, seededLoan.loanId);

      const duesExport = await fetchBinary(
        baseUrl,
        `/api/reports/dues?format=csv&branchId=${branchId}`,
        adminToken,
      );
      assert.equal(duesExport.status, 200);
      assert.ok(duesExport.contentType.includes("text/csv"));
      assert.ok(
        duesExport.body.startsWith(
          `"LoanId","FullNames","PhoneNumber","InstallmentNo","AMOUNT DISBURSED","Amount Due","Arrears","AmountPaid","LoanAmount","LoanBalance","Product Name","UnitTitle","FieldOfficer","Due Date"`,
        ),
      );
      assert.ok(duesExport.body.includes(`"${Number(loan.expected_total).toFixed(2)}"`));
      assert.ok(duesExport.body.includes(`"${Number(loan.principal).toFixed(2)}"`));
      assert.ok(duesExport.body.includes(`"125.00"`));

      const arrearsExport = await fetchBinary(
        baseUrl,
        `/api/reports/arrears?format=csv&branchId=${branchId}`,
        adminToken,
      );
      assert.equal(arrearsExport.status, 200);
      assert.ok(arrearsExport.contentType.includes("text/csv"));
      assert.ok(
        arrearsExport.body.startsWith(
          `"LoanId","BorowerId","FullNames","PhoneNumber","LoanAmount","AmountDisbursed","Interest","Arrears Amount","DaysInArrears","LoanBalance","ProductName","Maturity","Branch","Expected Clear Date","Borrowdate","BusinessLocation","DaysToNpl","GurantorNames","GurantorPhone","ProductName1","SalesRep"`,
        ),
      );
      assert.ok(arrearsExport.body.includes(`"${Number(loan.expected_total).toFixed(2)}"`));
      assert.ok(arrearsExport.body.includes(`"${Number(loan.principal).toFixed(2)}"`));
      assert.ok(arrearsExport.body.includes(`"${Number(loan.expected_total - loan.principal).toFixed(2)}"`));

      const disbursementExport = await fetchBinary(
        baseUrl,
        `/api/reports/disbursements?format=csv&branchId=${branchId}`,
        adminToken,
      );
      assert.equal(disbursementExport.status, 200);
      assert.ok(disbursementExport.contentType.includes("text/csv"));
      assert.ok(
        disbursementExport.body.startsWith(
          `"FullNames","AccountNo","LoanId","AmountDisbursed","MpesaRef","Interest","OLB","Amount Disbursed","Borrow Date","Loantype","Branch","Product","FieldOfficer","Clear Date"`,
        ),
      );
      assert.ok(disbursementExport.body.includes(`"UC3BA88XD0"`));
      assert.ok(disbursementExport.body.includes(`"${`Ksh ${Number(loan.principal).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}"`));
      assert.ok(disbursementExport.body.includes(`"${`Ksh ${Number(loan.expected_total - loan.principal).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}"`));
    } finally {
      db.close();
    }
  } finally {
    await stop();
  }
});
