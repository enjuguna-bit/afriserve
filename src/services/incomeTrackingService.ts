import { createSqlWhereBuilder } from "../utils/sqlBuilder.js";
import { getCurrentTenantId } from "../utils/tenantStore.js";

interface IncomeTrackingServiceDeps {
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  hierarchyService: {
    buildScopeCondition: (scope: unknown, branchColumnRef: string) => { sql: string; params: unknown[] };
  };
}

/**
 * Maps a loan term_weeks value to a product-tier label and its GL sub-account code.
 * Values outside the standard tiers fall into "other" and use the parent INTEREST_INCOME code.
 */
function resolveProductTier(termWeeks: number | null | undefined): {
  label: string;
  accountCode: string;
} {
  const w = Number(termWeeks || 0);
  if (w === 5)  return { label: "5-week",  accountCode: "INTEREST_INCOME_5W" };
  if (w === 7)  return { label: "7-week",  accountCode: "INTEREST_INCOME_7W" };
  if (w === 10) return { label: "10-week", accountCode: "INTEREST_INCOME_10W" };
  return { label: "other", accountCode: "INTEREST_INCOME" };
}

export function createIncomeTrackingService(deps: IncomeTrackingServiceDeps) {
  const { get, all, hierarchyService } = deps;

  /**
   * Returns monthly income broken down by stream (interest/fee/penalty)
   * AND by product duration (5W / 7W / 10W / other) for interest income.
   *
   * The interest subdivision works by joining gl_journals.loan_id → loans.term_weeks.
   * Journals without a loan_id (e.g. manual adjustments) fall into "other".
   */
  async function getMonthlyPerformance(scope: unknown, monthDate: string, branchFilter?: number | null) {
    const d = new Date(monthDate);
    const year  = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const dateFrom = `${year}-${String(month).padStart(2, "0")}-01T00:00:00.000Z`;
    const nextMonth = new Date(Date.UTC(year, month, 1));
    const dateTo    = nextMonth.toISOString();

    const baseWhere = createSqlWhereBuilder();
    baseWhere.addEquals("j.tenant_id", getCurrentTenantId());
    baseWhere.addCondition(hierarchyService.buildScopeCondition(scope, "e.branch_id"));
    if (branchFilter) baseWhere.addEquals("e.branch_id", branchFilter);
    baseWhere.addClause("datetime(e.created_at) >= datetime(?)", [dateFrom]);
    baseWhere.addClause("datetime(e.created_at) < datetime(?)", [dateTo]);

    // ── Total income streams (unchanged aggregation) ──────────────────────────
    const totals = await get(
      `SELECT
         ROUND(COALESCE(SUM(CASE
           WHEN a.code = 'INTEREST_INCOME' AND e.side = 'credit' THEN e.amount
           WHEN a.code = 'INTEREST_INCOME' AND e.side = 'debit'  THEN -e.amount
           ELSE 0 END), 0), 2) AS interest_income,
         ROUND(COALESCE(SUM(CASE
           WHEN a.code = 'FEE_INCOME' AND e.side = 'credit' THEN e.amount
           WHEN a.code = 'FEE_INCOME' AND e.side = 'debit'  THEN -e.amount
           ELSE 0 END), 0), 2) AS fee_income,
         ROUND(COALESCE(SUM(CASE
           WHEN a.code = 'PENALTY_INCOME' AND e.side = 'credit' THEN e.amount
           WHEN a.code = 'PENALTY_INCOME' AND e.side = 'debit'  THEN -e.amount
           ELSE 0 END), 0), 2) AS penalty_income
       FROM gl_entries e
       INNER JOIN gl_accounts a ON a.id = e.account_id
       INNER JOIN gl_journals j ON j.id = e.journal_id
       ${baseWhere.buildWhere()}`,
      baseWhere.getParams(),
    );

    // ── Interest income subdivided by loan term_weeks ─────────────────────────
    // Join through gl_journals → loans to get term_weeks per entry.
    // Entries without a matching loan (loan_id IS NULL) get term_weeks = NULL → "other".
    const interestWhere = createSqlWhereBuilder();
    interestWhere.addEquals("j.tenant_id", getCurrentTenantId());
    interestWhere.addCondition(hierarchyService.buildScopeCondition(scope, "e.branch_id"));
    if (branchFilter) interestWhere.addEquals("e.branch_id", branchFilter);
    interestWhere.addClause("datetime(e.created_at) >= datetime(?)", [dateFrom]);
    interestWhere.addClause("datetime(e.created_at) < datetime(?)", [dateTo]);
    interestWhere.addClause("a.code = 'INTEREST_INCOME'");

    const interestByTerm = await all(
      `SELECT
         COALESCE(l.term_weeks, 0)                                         AS term_weeks,
         ROUND(COALESCE(SUM(CASE
           WHEN e.side = 'credit' THEN e.amount
           WHEN e.side = 'debit'  THEN -e.amount
           ELSE 0 END), 0), 2)                                              AS interest_amount,
         COUNT(DISTINCT j.loan_id)                                          AS loan_count
       FROM gl_entries e
       INNER JOIN gl_accounts a ON a.id  = e.account_id
       INNER JOIN gl_journals j ON j.id  = e.journal_id
       LEFT  JOIN loans       l ON l.id  = j.loan_id
       ${interestWhere.buildWhere()}
       GROUP BY COALESCE(l.term_weeks, 0)
       ORDER BY COALESCE(l.term_weeks, 0)`,
      interestWhere.getParams(),
    );

    // Build the product breakdown map
    const productBreakdown: Record<string, { label: string; accountCode: string; amount: number; loanCount: number }> = {
      "5w":    { label: "5-week",  accountCode: "INTEREST_INCOME_5W",  amount: 0, loanCount: 0 },
      "7w":    { label: "7-week",  accountCode: "INTEREST_INCOME_7W",  amount: 0, loanCount: 0 },
      "10w":   { label: "10-week", accountCode: "INTEREST_INCOME_10W", amount: 0, loanCount: 0 },
      "other": { label: "other",   accountCode: "INTEREST_INCOME",     amount: 0, loanCount: 0 },
    };

    for (const row of interestByTerm) {
      const w = Number(row.term_weeks);
      const amount    = Number(row.interest_amount || 0);
      const loanCount = Number(row.loan_count || 0);

      if (w === 5)        { productBreakdown["5w"]!.amount    += amount; productBreakdown["5w"]!.loanCount    += loanCount; }
      else if (w === 7)   { productBreakdown["7w"]!.amount    += amount; productBreakdown["7w"]!.loanCount    += loanCount; }
      else if (w === 10)  { productBreakdown["10w"]!.amount   += amount; productBreakdown["10w"]!.loanCount   += loanCount; }
      else                { productBreakdown["other"]!.amount += amount; productBreakdown["other"]!.loanCount += loanCount; }
    }

    // Round all product amounts
    for (const tier of Object.values(productBreakdown)) {
      tier.amount = Number(tier.amount.toFixed(2));
    }

    const interest = Number(totals?.interest_income || 0);
    const fee      = Number(totals?.fee_income      || 0);
    const penalty  = Number(totals?.penalty_income  || 0);

    return {
      month: `${year}-${String(month).padStart(2, "0")}`,
      // Totals (backward compatible)
      interest_income: interest,
      fee_income:      fee,
      penalty_income:  penalty,
      total_income:    Number((interest + fee + penalty).toFixed(2)),
      // New: product-level interest subdivision
      interest_by_product: productBreakdown,
    };
  }

  /**
   * Cash flow status — now includes capital deposit/withdrawal movements
   * so the net position reflects actual capital flows, not just loan activity.
   */
  async function getCashFlowStatus(scope: unknown, branchFilter?: number | null) {
    const baseWhere = createSqlWhereBuilder();
    baseWhere.addEquals("j.tenant_id", getCurrentTenantId());
    baseWhere.addCondition(hierarchyService.buildScopeCondition(scope, "e.branch_id"));
    if (branchFilter) baseWhere.addEquals("e.branch_id", branchFilter);

    const cashFlow = await get(
      `SELECT
         ROUND(COALESCE(SUM(CASE WHEN e.side = 'debit'  THEN e.amount ELSE 0 END), 0), 2) AS total_inflow,
         ROUND(COALESCE(SUM(CASE WHEN e.side = 'credit' THEN e.amount ELSE 0 END), 0), 2) AS total_outflow
       FROM gl_entries e
       INNER JOIN gl_accounts a ON a.id = e.account_id
       INNER JOIN gl_journals j ON j.id = e.journal_id
       WHERE a.code = 'CASH'
         ${baseWhere.buildAnd()}`,
      baseWhere.getParams(),
    );

    // ── Capital deposit inflows ───────────────────────────────────────────────
    const depositWhere = createSqlWhereBuilder();
    if (branchFilter) depositWhere.addEquals("branch_id", branchFilter);
    depositWhere.addEquals("status", "approved");
    depositWhere.addEquals("transaction_type", "deposit");

    const depositRow = await get(
      `SELECT ROUND(COALESCE(SUM(amount), 0), 2) AS total_deposits
       FROM capital_transactions
       ${depositWhere.buildWhere()}`,
      depositWhere.getParams(),
    );

    // ── Capital withdrawal outflows ───────────────────────────────────────────
    const withdrawalWhere = createSqlWhereBuilder();
    if (branchFilter) withdrawalWhere.addEquals("branch_id", branchFilter);
    withdrawalWhere.addEquals("status", "approved");
    withdrawalWhere.addEquals("transaction_type", "withdrawal");

    const withdrawalRow = await get(
      `SELECT ROUND(COALESCE(SUM(amount), 0), 2) AS total_withdrawals
       FROM capital_transactions
       ${withdrawalWhere.buildWhere()}`,
      withdrawalWhere.getParams(),
    );

    // ── Pending withdrawals (not yet approved) ────────────────────────────────
    const pendingWhere = createSqlWhereBuilder();
    if (branchFilter) pendingWhere.addEquals("branch_id", branchFilter);
    pendingWhere.addEquals("status", "pending");
    pendingWhere.addEquals("transaction_type", "withdrawal");

    const pendingRow = await get(
      `SELECT ROUND(COALESCE(SUM(amount), 0), 2) AS pending_withdrawals
       FROM capital_transactions
       ${pendingWhere.buildWhere()}`,
      pendingWhere.getParams(),
    );

    const inflow  = Number(cashFlow?.total_inflow    || 0);
    const outflow = Number(cashFlow?.total_outflow   || 0);
    const capitalDeposits    = Number(depositRow?.total_deposits       || 0);
    const capitalWithdrawals = Number(withdrawalRow?.total_withdrawals || 0);
    const pendingWithdrawals = Number(pendingRow?.pending_withdrawals  || 0);

    return {
      total_inflow:          inflow,
      total_outflow:         outflow,
      net_cash_flow:         Number((inflow - outflow).toFixed(2)),
      // Capital movements (separate from operational flows)
      capital_deposits:      capitalDeposits,
      capital_withdrawals:   capitalWithdrawals,
      pending_withdrawals:   pendingWithdrawals,
    };
  }

  return {
    getMonthlyPerformance,
    getCashFlowStatus,
  };
}
