import test from "node:test";
import assert from "node:assert/strict";
import { createReportQueryService } from "../src/services/reportQueryService.js";

test("report query service routes heavy portfolio and disbursement reads through the replica adapter", async () => {
  const primaryReadCalls: Array<{ sql: string; params: unknown[] }> = [];
  const replicaReadCalls: Array<{ sql: string; params: unknown[] }> = [];

  const service = createReportQueryService({
    get: async () => null,
    all: async (sql: string, params: unknown[] = []) => {
      primaryReadCalls.push({ sql, params });
      throw new Error("primary read adapter should not be used for report queries");
    },
    readAll: async (sql: string, params: unknown[] = []) => {
      replicaReadCalls.push({ sql, params });

      if (sql.includes("FROM loan_installments")) {
        return [
          {
            loan_id: 101,
            amount_due: 250,
            amount_paid: 50,
          },
        ];
      }

      if (sql.includes("COALESCE(l.registration_fee")) {
        return [
          {
            id: 201,
            branch_id: 1,
            client_id: 5001,
            disbursed_at: "2026-03-01T09:00:00.000Z",
            principal: 1500,
            expected_total: 1800,
            registration_fee: 100,
            processing_fee: 50,
            term_weeks: 12,
          },
        ];
      }

      if (sql.includes("FROM loans") && sql.includes("client_id") && sql.includes("disbursed_at IS NOT NULL")) {
        return [
          {
            id: 200,
            client_id: 5001,
            disbursed_at: "2026-02-01T09:00:00.000Z",
          },
          {
            id: 201,
            client_id: 5001,
            disbursed_at: "2026-03-01T09:00:00.000Z",
          },
        ];
      }

      if (sql.includes("FROM branches")) {
        return [
          {
            id: 1,
            name: "Nairobi Central",
            code: "NBO",
            region_id: 10,
          },
        ];
      }

      if (sql.includes("FROM regions")) {
        return [
          {
            id: 10,
            name: "Nairobi Region",
          },
        ];
      }

      if (sql.includes("COALESCE(l.balance")) {
        return [
          {
            id: 101,
            branch_id: 1,
            status: "active",
            principal: 1200,
            expected_total: 1400,
            repaid_total: 200,
            balance: 1000,
          },
        ];
      }

      return [];
    },
    hierarchyService: {
      buildScopeCondition: () => ({ sql: "", params: [] }),
      isBranchInScope: () => true,
    },
    resolveCachedReport: async ({ compute }) => compute(),
  });

  const portfolio = await service.getPortfolioReport({
    user: { sub: 7 },
    scope: { level: "hq", branchIds: [] },
    includeBreakdown: true,
    mineOnly: false,
    branchFilter: 1,
    dateFrom: "2026-03-01T00:00:00.000Z",
    dateTo: "2026-03-09T23:59:59.999Z",
    overdueAsOf: "2026-03-09T23:59:59.999Z",
  });

  assert.equal(portfolio.total_loans, 1);
  assert.equal(portfolio.overdue_installments, 1);
  assert.equal(portfolio.overdue_amount, 200);
  assert.equal(portfolio.branchBreakdown.length, 1);
  assert.equal(portfolio.branchBreakdown[0].branch_name, "Nairobi Central");

  const disbursements = await service.getDisbursementsReport({
    user: { sub: 7 },
    scope: { level: "hq", branchIds: [] },
    dateFrom: "2026-03-01T00:00:00.000Z",
    dateTo: "2026-03-09T23:59:59.999Z",
    branchFilter: 1,
  });

  assert.equal(disbursements.summary.total_loans, 1);
  assert.equal(disbursements.summary.repeat_client_loans, 1);
  assert.equal(disbursements.branchBreakdown.length, 1);
  assert.equal(disbursements.branchBreakdown[0].region_name, "Nairobi Region");

  assert.equal(primaryReadCalls.length, 0);
  assert.ok(replicaReadCalls.length >= 6);
});
