import test from "node:test";
import assert from "node:assert/strict";
import { api, loginAsAdmin, startServer } from "./integration-helpers.js";

function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

test("advanced accounting workflows support FX rates, CoA versions, suspense reconciliation, and EOD batch runs", async () => {
  const { baseUrl, stop } = await startServer();
  const suffix = uniqueSuffix();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const fxUpsert = await api(baseUrl, "/api/reports/gl/fx/rates", {
      method: "POST",
      token: adminToken,
      body: {
        baseCurrency: "USD",
        quoteCurrency: "KES",
        rate: 129.45,
      },
    });
    assert.equal(fxUpsert.status, 201);
    assert.equal(String(fxUpsert.data.base_currency), "USD");
    assert.equal(String(fxUpsert.data.quote_currency), "KES");

    const versionsBefore = await api(baseUrl, "/api/reports/gl/coa/versions", { token: adminToken });
    assert.equal(versionsBefore.status, 200);
    assert.ok(Array.isArray(versionsBefore.data));
    assert.ok(versionsBefore.data.some((row: Record<string, any>) => String(row.status) === "active"));

    const createVersion = await api(baseUrl, "/api/reports/gl/coa/versions", {
      method: "POST",
      token: adminToken,
      body: {
        versionCode: `COA-AUDIT-${suffix}`,
        name: `Audit CoA ${suffix}`,
      },
    });
    assert.equal(createVersion.status, 201);
    const createdVersionId = Number(createVersion.data?.id || 0);
    assert.ok(createdVersionId > 0);

    const activateVersion = await api(baseUrl, `/api/reports/gl/coa/versions/${createdVersionId}/activate`, {
      method: "POST",
      token: adminToken,
      body: {},
    });
    assert.equal(activateVersion.status, 200);
    assert.equal(Number(activateVersion.data?.id || 0), createdVersionId);
    assert.equal(String(activateVersion.data?.status || ""), "active");

    const createSuspenseCase = await api(baseUrl, "/api/reports/gl/suspense/cases", {
      method: "POST",
      token: adminToken,
      body: {
        externalReference: `bank-ref-${suffix}`,
        sourceChannel: "EFT",
        transactionCurrency: "USD",
        transactionAmount: 100,
        bookCurrency: "KES",
        fxRate: 129.45,
      },
    });
    assert.equal(createSuspenseCase.status, 201);
    const suspenseCaseId = Number(createSuspenseCase.data?.suspense_case?.id || 0);
    assert.ok(suspenseCaseId > 0);
    assert.ok(Number(createSuspenseCase.data?.opening_journal_id || 0) > 0);

    const allocateSuspense = await api(baseUrl, `/api/reports/gl/suspense/cases/${suspenseCaseId}/allocate`, {
      method: "POST",
      token: adminToken,
      body: {
        targetAccountCode: "LOAN_RECEIVABLE",
        allocateTransactionAmount: 100,
        fxRate: 130.25,
        note: "Allocate unmatched funds after finance investigation",
      },
    });
    assert.equal(allocateSuspense.status, 200);
    assert.ok(Number(allocateSuspense.data?.allocation_journal_id || 0) > 0);
    assert.equal(String(allocateSuspense.data?.suspense_case?.status || ""), "resolved");

    const suspenseOpen = await api(baseUrl, "/api/reports/gl/suspense/cases?status=open", {
      token: adminToken,
    });
    assert.equal(suspenseOpen.status, 200);
    assert.ok(Array.isArray(suspenseOpen.data));
    assert.equal(
      Boolean(suspenseOpen.data.find((row: Record<string, any>) => Number(row.id || 0) === suspenseCaseId)),
      false,
    );

    const effectiveDate = new Date().toISOString().slice(0, 10);
    const runEod = await api(baseUrl, "/api/reports/gl/batch/eod", {
      method: "POST",
      token: adminToken,
      body: {
        effectiveDate,
      },
    });
    assert.equal(runEod.status, 200);
    assert.equal(String(runEod.data.batch_type), "eod");
    assert.equal(String(runEod.data.effective_date), effectiveDate);
    assert.equal(String(runEod.data.status), "completed");

    const batchRuns = await api(baseUrl, "/api/reports/gl/batches?batchType=eod&limit=5", {
      token: adminToken,
    });
    assert.equal(batchRuns.status, 200);
    assert.ok(Array.isArray(batchRuns.data));
    const eodRun = batchRuns.data.find((row: Record<string, any>) => String(row.effective_date) === effectiveDate);
    assert.ok(eodRun, "Expected an EOD batch run row for the effective date");
    assert.equal(String(eodRun.status), "completed");

    const periodLocks = await api(baseUrl, "/api/reports/gl/period-locks?lockType=eod&limit=5", {
      token: adminToken,
    });
    assert.equal(periodLocks.status, 200);
    assert.ok(Array.isArray(periodLocks.data));
    const eodLock = periodLocks.data.find((row: Record<string, any>) => String(row.lock_date) === effectiveDate);
    assert.ok(eodLock, "Expected an EOD period lock row for the effective date");
    assert.equal(String(eodLock.lock_type), "eod");
    assert.equal(String(eodLock.status), "locked");

    const versionAccounts = await api(baseUrl, `/api/reports/gl/coa/versions/${createdVersionId}/accounts`, {
      token: adminToken,
    });
    assert.equal(versionAccounts.status, 200);
    assert.ok(Array.isArray(versionAccounts.data));
    assert.ok(versionAccounts.data.length > 0);
  } finally {
    await stop();
  }
});
