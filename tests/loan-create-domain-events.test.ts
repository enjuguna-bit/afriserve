import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { api, loginAsAdmin, startServer } from "./integration-helpers.js";

test("creating a loan writes the loan.application.submitted outbox event on the live route", async () => {
  const { baseUrl, stop, dbFilePath } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Loan Event Client",
        phone: "+254700003101",
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data?.id),
        principal: 1800,
        termWeeks: 6,
        purpose: "Working capital",
      },
    });
    assert.equal(createLoan.status, 201);

    assert.ok(dbFilePath, "Expected sqlite database path for test verification");
    const database = new Database(dbFilePath, { readonly: true });
    try {
      const loanId = Number(createLoan.data?.id || 0);
      const eventRow = database.prepare(`
        SELECT event_type, aggregate_type, aggregate_id, tenant_id, payload_json
        FROM domain_events
        WHERE aggregate_type = 'loan'
          AND aggregate_id = ?
          AND event_type = 'loan.application.submitted'
        ORDER BY id DESC
        LIMIT 1
      `).get(loanId) as Record<string, unknown> | undefined;

      assert.ok(eventRow, "Expected a loan.application.submitted outbox event");
      assert.equal(String(eventRow?.event_type || ""), "loan.application.submitted");
      assert.equal(String(eventRow?.aggregate_type || ""), "loan");
      assert.equal(Number(eventRow?.aggregate_id || 0), loanId);
      assert.equal(String(eventRow?.tenant_id || ""), "default");

      const payload = JSON.parse(String(eventRow?.payload_json || "{}"));
      assert.equal(Number(payload.loanId || 0), loanId);
      assert.equal(Number(payload.clientId || 0), Number(createClient.data?.id || 0));
      assert.equal(Number(payload.principal || 0), 1800);
      assert.equal(Number(payload.termWeeks || 0), 6);
      assert.equal(Number(payload.createdByUserId || 0), 1);
    } finally {
      database.close();
    }
  } finally {
    await stop();
  }
});

test("creating a loan on the live route keeps onboarding links, contract versioning, and underwriting in sync", async () => {
  const { baseUrl, stop, dbFilePath } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Loan Side Effects Client",
        phone: "+254700003102",
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data?.id),
        principal: 2400,
        termWeeks: 8,
        purpose: "Inventory restock",
      },
    });
    assert.equal(createLoan.status, 201);

    assert.ok(dbFilePath, "Expected sqlite database path for test verification");
    const database = new Database(dbFilePath, { readonly: true });
    try {
      const loanId = Number(createLoan.data?.id || 0);
      const clientId = Number(createClient.data?.id || 0);

      const loanGuarantorRow = database.prepare(`
        SELECT COUNT(*) AS total
        FROM loan_guarantors
        WHERE loan_id = ?
      `).get(loanId) as Record<string, unknown> | undefined;
      assert.ok(Number(loanGuarantorRow?.total || 0) >= 1, "Expected onboarding guarantors to auto-link to the loan");

      const loanCollateralRow = database.prepare(`
        SELECT COUNT(*) AS total
        FROM loan_collaterals
        WHERE loan_id = ?
      `).get(loanId) as Record<string, unknown> | undefined;
      assert.ok(Number(loanCollateralRow?.total || 0) >= 1, "Expected onboarding collaterals to auto-link to the loan");

      const creationVersionRow = database.prepare(`
        SELECT event_type, created_by_user_id, snapshot_json
        FROM loan_contract_versions
        WHERE loan_id = ?
          AND event_type = 'creation'
        ORDER BY version_number DESC
        LIMIT 1
      `).get(loanId) as Record<string, unknown> | undefined;
      assert.ok(creationVersionRow, "Expected an initial creation contract version");
      assert.equal(String(creationVersionRow?.event_type || ""), "creation");
      assert.equal(Number(creationVersionRow?.created_by_user_id || 0), 1);

      const snapshot = JSON.parse(String(creationVersionRow?.snapshot_json || "{}"));
      assert.equal(Number(snapshot?.loan?.id || 0), loanId);
      assert.equal(Number(snapshot?.loan?.client_id || 0), clientId);

      const assessmentRow = database.prepare(`
        SELECT loan_id, guarantor_count, collateral_count
        FROM loan_underwriting_assessments
        WHERE loan_id = ?
        LIMIT 1
      `).get(loanId) as Record<string, unknown> | undefined;
      assert.ok(assessmentRow, "Expected a refreshed underwriting assessment");
      assert.equal(Number(assessmentRow?.loan_id || 0), loanId);
      assert.ok(Number(assessmentRow?.guarantor_count || 0) >= 1);
      assert.ok(Number(assessmentRow?.collateral_count || 0) >= 1);
    } finally {
      database.close();
    }
  } finally {
    await stop();
  }
});
