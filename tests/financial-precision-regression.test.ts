import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { api, approveLoan, loginAsAdmin, startServer, createHighRiskReviewerToken } from "./integration-helpers.js";

import { createPenaltyEngine } from "../src/services/penaltyEngine.js";
import { createInterestAccrualEngine } from "../src/services/interestAccrualEngine.js";

test("loan schedule allocation preserves exact cents total after disbursement", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Precision Schedule Client",
        phone: "+254700003001",
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
    const expectedTotalCents = Math.round(Number(createLoan.data.expected_total || 0) * 100);

    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);
    const approval = await approveLoan(baseUrl, loanId, checkerToken, {
      notes: "Precision allocation test",
    });

    assert.equal(approval.status, 200);

    const schedule = await api(baseUrl, `/api/loans/${loanId}/schedule`, {
      token: adminToken,
    });
    assert.equal(schedule.status, 200);

    const installmentCents = (schedule.data.installments || []).map((item: Record<string, unknown>) => (
      Math.round(Number(item.amount_due || 0) * 100)
    ));
    const summedCents = installmentCents.reduce((sum: number, value: number) => sum + value, 0);

    assert.equal(summedCents, expectedTotalCents);
    assert.equal(installmentCents.length, 4);
  } finally {
    await stop();
  }
});

test("sequential decimal repayments (0.10 + 0.20) reduce balance by exact cents", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Precision Repayment Client",
        phone: "+254700003002",
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data.id),
        principal: 500,
        termWeeks: 8,
      },
    });
    assert.equal(createLoan.status, 201);

    const loanId = Number(createLoan.data.id);
    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);
    const approval = await approveLoan(baseUrl, loanId, checkerToken, {
      notes: "Precision repayment test",
    });

    assert.equal(approval.status, 200);

    const beforeLoan = await api(baseUrl, `/api/loans/${loanId}`, { token: adminToken });
    assert.equal(beforeLoan.status, 200);
    const startingBalanceCents = Math.round(Number(beforeLoan.data.balance || 0) * 100);

    const repaymentOne = await api(baseUrl, `/api/loans/${loanId}/repayments`, {
      method: "POST",
      token: adminToken,
      body: {
        amount: 0.1,
        note: "precision repayment one",
      },
    });
    assert.equal(repaymentOne.status, 201);

    const repaymentTwo = await api(baseUrl, `/api/loans/${loanId}/repayments`, {
      method: "POST",
      token: adminToken,
      body: {
        amount: 0.2,
        note: "precision repayment two",
      },
    });
    assert.equal(repaymentTwo.status, 201);

    const afterLoan = await api(baseUrl, `/api/loans/${loanId}`, { token: adminToken });
    assert.equal(afterLoan.status, 200);
    const endingBalanceCents = Math.round(Number(afterLoan.data.balance || 0) * 100);

    assert.equal(startingBalanceCents - endingBalanceCents, 30);
  } finally {
    await stop();
  }
});

test("concurrent repayments cannot both over-collect the same outstanding balance", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Concurrent Repayment Guard Client",
        phone: "+254700003003",
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data.id),
        principal: 800,
        termWeeks: 8,
      },
    });
    assert.equal(createLoan.status, 201);

    const loanId = Number(createLoan.data.id);
    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);
    const approval = await approveLoan(baseUrl, loanId, checkerToken, {
      notes: "Concurrent repayment guard",
    });

    assert.equal(approval.status, 200);

    const beforeLoan = await api(baseUrl, `/api/loans/${loanId}`, { token: adminToken });
    assert.equal(beforeLoan.status, 200);
    const startingBalance = Number(beforeLoan.data.balance || 0);
    assert.ok(startingBalance > 0);

    const [repaymentOne, repaymentTwo] = await Promise.all([
      api(baseUrl, `/api/loans/${loanId}/repayments`, {
        method: "POST",
        token: adminToken,
        body: {
          amount: startingBalance,
          note: "concurrent repayment one",
        },
      }),
      api(baseUrl, `/api/loans/${loanId}/repayments`, {
        method: "POST",
        token: adminToken,
        body: {
          amount: startingBalance,
          note: "concurrent repayment two",
        },
      }),
    ]);

    const statuses = [repaymentOne.status, repaymentTwo.status].sort((left, right) => left - right);
    assert.equal(statuses.includes(201), true, `Expected one successful repayment; got ${statuses.join(",")}`);
    assert.equal(
      statuses.some((status) => status === 400 || status === 409),
      true,
      `Expected one rejected repayment due to stale/outdated balance; got ${statuses.join(",")}`,
    );

    const afterLoan = await api(baseUrl, `/api/loans/${loanId}`, { token: adminToken });
    assert.equal(afterLoan.status, 200);
    assert.equal(Number(afterLoan.data.balance || 0), 0);
    assert.equal(Number(afterLoan.data.repaid_total || 0), startingBalance);

    const repaymentHistory = await api(baseUrl, `/api/loans/${loanId}/repayments`, { token: adminToken });
    assert.equal(repaymentHistory.status, 200);
    assert.equal(Array.isArray(repaymentHistory.data), true);
    assert.equal(repaymentHistory.data.length, 1);
    assert.equal(Number(repaymentHistory.data[0]?.amount || 0), startingBalance);
  } finally {
    await stop();
  }
});

test("financial services import decimal.js and avoid toFixed() arithmetic", async () => {
  const root = path.resolve(process.cwd());
  const targets = [
    // loanLifecycleService.ts is a thin facade — Decimal usage lives in
    // the extracted module.  Check one of the operation files that does
    // concrete money arithmetic (disburseLoan.ts is the primary one).
    "src/services/loanLifecycle/operations/disburseLoan.ts",
    "src/services/penaltyEngine.ts",
    "src/services/repaymentService.ts",
    "src/services/generalLedgerService.ts",
    "src/services/interestAccrualEngine.ts",
  ];

  for (const relativeFile of targets) {
    const filePath = path.join(root, relativeFile);
    const content = await fs.readFile(filePath, "utf8");
    assert.match(content, /import\s+(?:Decimal\s+from|\{\s*Decimal\s*\}\s+from)\s+"decimal\.js"/);
    assert.equal(/\.toFixed\(/.test(content), false, `${relativeFile} should not use toFixed for money math`);
  }
});

test("penalty engine applies flat penalty with exact cents and no drift", async () => {
  const capturedRuns: Array<{ sql: string; params?: unknown[] }> = [];

  const engine = createPenaltyEngine({
    get: async (_sql: string, params?: unknown[]) => {
      const accountCode = String(params?.[0] || "");
      if (accountCode === "LOAN_RECEIVABLE") {
        return { id: 11 };
      }
      if (accountCode === "PENALTY_INCOME") {
        return { id: 12 };
      }
      return null;
    },
    all: async (sql: string, params?: unknown[]) => {
      void sql;
      const afterInstallmentId = Number(params?.[0] || 0);
      if (afterInstallmentId > 0) {
        return [];
      }
      return [{ installment_id: 91, loan_id: 44 }];
    },
    executeTransaction: async (callback) => {
      const tx = {
        get: async () => ({
          id: 91,
          loan_id: 44,
          installment_number: 1,
          due_date: new Date(Date.now() - (2 * 24 * 60 * 60 * 1000)).toISOString(),
          status: "overdue",
          amount_due: 10,
          amount_paid: 0,
          penalty_amount_accrued: 0,
          penalty_last_applied_at: null,
          penalty_rate_daily: 0,
          penalty_flat_amount: 0.3,
          penalty_grace_days: 0,
          penalty_cap_amount: null,
          client_id: 5,
          branch_id: 3,
        }),
        all: async () => [],
        run: async (sql: string, params?: unknown[]) => {
          capturedRuns.push({ sql, params });
          if (sql.includes("UPDATE loan_installments")) {
            return { changes: 1 };
          }
          if (sql.includes("INSERT INTO transactions")) {
            return { lastID: 1001 };
          }
          if (sql.includes("INSERT INTO gl_journals")) {
            return { lastID: 2001 };
          }
          return { changes: 1, lastID: 1 };
        },
      };

      return callback(tx as any);
    },
    logger: null,
    metrics: null,
  });

  const summary = await engine.applyPenalties();
  assert.equal(summary.scannedInstallments, 1);
  assert.equal(summary.chargedInstallments, 1);
  assert.equal(summary.chargedAmount, 0.3);

  const installmentUpdate = capturedRuns.find((item) => item.sql.includes("UPDATE loan_installments"));
  assert.ok(installmentUpdate);
  assert.equal(Number(installmentUpdate?.params?.[0] || 0), 0.3);
  assert.equal(Number(installmentUpdate?.params?.[1] || 0), 0.3);
});

test("interest accrual engine posts deferred-interest daily recognition journals", async () => {
  const capturedRuns: Array<{ sql: string; params?: unknown[] }> = [];

  const engine = createInterestAccrualEngine({
    get: async (_sql: string, params?: unknown[]) => {
      const accountCode = String(params?.[0] || "");
      if (accountCode === "UNEARNED_INTEREST") {
        return { id: 31 };
      }
      if (accountCode === "INTEREST_INCOME") {
        return { id: 32 };
      }
      return null;
    },
    all: async (_sql: string, params?: unknown[]) => {
      const afterLoanId = Number(params?.[0] || 0);
      if (afterLoanId > 0) {
        return [];
      }
      return [{
        loan_id: 77,
        client_id: 9,
        branch_id: 4,
        balance: 500,
        disbursed_at: new Date(Date.now() - (10 * 24 * 60 * 60 * 1000)).toISOString(),
        accrual_start_at: new Date(Date.now() - (10 * 24 * 60 * 60 * 1000)).toISOString(),
        maturity_at: new Date(Date.now() + (20 * 24 * 60 * 60 * 1000)).toISOString(),
        total_contractual_interest: 30,
        accrued_interest: 0,
        last_accrual_at: null,
      }];
    },
    executeTransaction: async (callback) => {
      const tx = {
        get: async () => null,
        run: async (sql: string, params?: unknown[]) => {
          capturedRuns.push({ sql, params });
          if (sql.includes("INSERT INTO transactions")) {
            return { lastID: 9001, changes: 1 };
          }
          if (sql.includes("INSERT INTO gl_journals")) {
            return { lastID: 9101, changes: 1 };
          }
          return { changes: 1, lastID: 1 };
        },
      };
      return callback(tx as any);
    },
    logger: null,
    metrics: null,
  });

  const summary = await engine.applyDailyAccruals();
  assert.equal(summary.scannedLoans, 1);
  assert.equal(summary.accruedLoans, 1);
  assert.ok(summary.accruedAmount > 0);

  const profileUpdate = capturedRuns.find((item) => item.sql.includes("UPDATE loan_interest_profiles"));
  assert.ok(profileUpdate, "Expected loan_interest_profiles update");
  const journalInsert = capturedRuns.find((item) => item.sql.includes("INSERT INTO gl_journals"));
  assert.ok(journalInsert, "Expected GL journal insert for interest accrual");
});
