import { createSqlWhereBuilder } from "../../utils/sqlBuilder.js";
import type { RouteRegistrar } from "../../types/routeDeps.js";

function registerFinancialReports(app: RouteRegistrar, context: Record<string, any>) {
  const {
    get,
    all,
    authenticate,
    authorize,
    parseId,
    hierarchyService,
    resolveFormat,
    parseDateParam,
    applyScopeAndBranchFilter,
    resolveCachedReport,
    sendTabularExport,
  } = context;

  app.get(
    "/api/reports/income-statement",
    authenticate,
    authorize("admin", "ceo", "finance", "investor", "partner", "operations_manager", "area_manager"),
    async (req, res, next) => {
      try {
        const scope = await hierarchyService.resolveHierarchyScope(req.user);
        const format = resolveFormat(req.query.format, res);
        if (!format) return;

        const dateFrom = parseDateParam(req.query.dateFrom, "dateFrom", res);
        if (dateFrom === undefined) return;
        const dateTo = parseDateParam(req.query.dateTo, "dateTo", res);
        if (dateTo === undefined) return;
        if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
          res.status(400).json({ message: "dateFrom must be before or equal to dateTo." });
          return;
        }

        const branchFilter = parseId(req.query.branchId);
        const cacheKeyPayload = {
          dateFrom: dateFrom || null,
          dateTo: dateTo || null,
          branchId: branchFilter || null,
        };

        const whereBuilder = createSqlWhereBuilder();
        whereBuilder.addDateRange("j.posted_at", dateFrom, dateTo);
        if (!applyScopeAndBranchFilter({
          whereBuilder,
          scope,
          branchColumnRef: "j.branch_id",
          branchFilter,
          tenantColumnRef: "j.tenant_id",
          res,
        })) {
          return;
        }
        const whereSql = whereBuilder.buildWhere();
        const queryParams = whereBuilder.getParams();

        const summary = await resolveCachedReport({
          namespace: "reports:income-statement:summary",
          user: req.user,
          scope,
          keyPayload: cacheKeyPayload,
          compute: async () => {
            const accountBalances = await get(
              `
                SELECT
                  ROUND(COALESCE(SUM(CASE
                    WHEN a.code = 'INTEREST_INCOME' AND e.side = 'credit' THEN e.amount
                    WHEN a.code = 'INTEREST_INCOME' AND e.side = 'debit' THEN -e.amount
                    ELSE 0 END), 0), 2) AS interest_income,
                  ROUND(COALESCE(SUM(CASE
                    WHEN a.code = 'FEE_INCOME' AND e.side = 'credit' THEN e.amount
                    WHEN a.code = 'FEE_INCOME' AND e.side = 'debit' THEN -e.amount
                    ELSE 0 END), 0), 2) AS fee_income,
                  ROUND(COALESCE(SUM(CASE
                    WHEN a.code = 'PENALTY_INCOME' AND e.side = 'credit' THEN e.amount
                    WHEN a.code = 'PENALTY_INCOME' AND e.side = 'debit' THEN -e.amount
                    ELSE 0 END), 0), 2) AS penalty_income,
                  ROUND(COALESCE(SUM(CASE
                    WHEN a.code = 'WRITE_OFF_EXPENSE' AND e.side = 'debit' THEN e.amount
                    WHEN a.code = 'WRITE_OFF_EXPENSE' AND e.side = 'credit' THEN -e.amount
                    ELSE 0 END), 0), 2) AS write_off_expense,
                  ROUND(COALESCE(SUM(CASE
                    WHEN a.code = 'CASH' AND e.side = 'debit' THEN e.amount
                    WHEN a.code = 'CASH' AND e.side = 'credit' THEN -e.amount
                    ELSE 0 END), 0), 2) AS net_cash_movement
                FROM gl_entries e
                INNER JOIN gl_accounts a ON a.id = e.account_id
                INNER JOIN gl_journals j ON j.id = e.journal_id
                ${whereSql}
              `,
              queryParams,
            );

            const disbursements = await get(
              `
                SELECT ROUND(COALESCE(SUM(e.amount), 0), 2) AS total_disbursed
                FROM gl_entries e
                INNER JOIN gl_accounts a ON a.id = e.account_id
                INNER JOIN gl_journals j ON j.id = e.journal_id
                ${whereSql}${whereSql ? " AND" : " WHERE"} j.reference_type = 'loan_disbursement'
                  AND a.code = 'CASH'
                  AND e.side = 'credit'
              `,
              queryParams,
            );

            const repayments = await get(
              `
                SELECT ROUND(COALESCE(SUM(e.amount), 0), 2) AS total_repaid
                FROM gl_entries e
                INNER JOIN gl_accounts a ON a.id = e.account_id
                INNER JOIN gl_journals j ON j.id = e.journal_id
                ${whereSql}${whereSql ? " AND" : " WHERE"} j.reference_type = 'loan_repayment'
                  AND a.code = 'CASH'
                  AND e.side = 'debit'
              `,
              queryParams,
            );

            const totalDisbursed = Number(disbursements?.total_disbursed || 0);
            const totalRepaid = Number(repayments?.total_repaid || 0);
            const interestIncome = Number(accountBalances?.interest_income || 0);
            const feeIncome = Number(accountBalances?.fee_income || 0);
            const penaltyIncome = Number(accountBalances?.penalty_income || 0);
            const writeOffExpense = Number(accountBalances?.write_off_expense || 0);

            return {
              total_disbursed: totalDisbursed,
              total_repaid: totalRepaid,
              total_interest_income: interestIncome,
              total_fee_income: feeIncome,
              total_penalty_income: penaltyIncome,
              total_write_off_expense: writeOffExpense,
              net_operating_income: Number((interestIncome + feeIncome + penaltyIncome - writeOffExpense).toFixed(2)),
              net_cash_movement: Number(accountBalances?.net_cash_movement || 0),
              total_interest_accrued: interestIncome,
              total_fees_collected: feeIncome,
              total_penalties_collected: penaltyIncome,
              net_cash_position: Number((totalRepaid + feeIncome + penaltyIncome - totalDisbursed).toFixed(2)),
            };
          },
        });

        if (format !== "json") {
          const cols = [
            "total_disbursed",
            "total_repaid",
            "total_interest_income",
            "total_fee_income",
            "total_write_off_expense",
            "net_operating_income",
            "net_cash_movement",
          ];
          sendTabularExport(res, {
            format,
            filenameBase: "income-statement-report",
            title: "Income Statement Report",
            headers: cols,
            rows: [summary],
          });
          return;
        }

        res.status(200).json({
          period: { dateFrom: dateFrom || null, dateTo: dateTo || null },
          ...summary,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/reports/write-offs",
    authenticate,
    authorize("admin", "ceo", "finance", "investor", "partner", "operations_manager", "area_manager"),
    async (req, res, next) => {
      try {
        const scope = await hierarchyService.resolveHierarchyScope(req.user);
        const format = resolveFormat(req.query.format, res);
        if (!format) return;

        const dateFrom = parseDateParam(req.query.dateFrom, "dateFrom", res);
        if (dateFrom === undefined) return;
        const dateTo = parseDateParam(req.query.dateTo, "dateTo", res);
        if (dateTo === undefined) return;
        if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
          res.status(400).json({ message: "dateFrom must be before or equal to dateTo." });
          return;
        }

        const branchFilter = parseId(req.query.branchId);
        const whereBuilder = createSqlWhereBuilder();
        whereBuilder.addClause("j.reference_type = 'loan_write_off'");
        whereBuilder.addDateRange("j.posted_at", dateFrom, dateTo);
        if (!applyScopeAndBranchFilter({
          whereBuilder,
          scope,
          branchColumnRef: "j.branch_id",
          branchFilter,
          tenantColumnRef: "j.tenant_id",
          res,
        })) {
          return;
        }

        const whereSql = whereBuilder.buildWhere();
        const queryParams = whereBuilder.getParams();
        const cacheKeyPayload = {
          dateFrom: dateFrom || null,
          dateTo: dateTo || null,
          branchId: branchFilter || null,
        };

        const summary = await resolveCachedReport({
          namespace: "reports:write-offs:summary",
          user: req.user,
          scope,
          keyPayload: cacheKeyPayload,
          compute: async () => get(
            `
              SELECT
                COUNT(DISTINCT j.id) AS write_off_count,
                ROUND(COALESCE(SUM(CASE WHEN a.code = 'WRITE_OFF_EXPENSE' AND e.side = 'debit' THEN e.amount ELSE 0 END), 0), 2) AS total_write_off_expense
              FROM gl_journals j
              INNER JOIN gl_entries e ON e.journal_id = j.id
              INNER JOIN gl_accounts a ON a.id = e.account_id
              ${whereSql}
            `,
            queryParams,
          ),
        });

        const writeOffs = await resolveCachedReport({
          namespace: "reports:write-offs:list",
          user: req.user,
          scope,
          keyPayload: cacheKeyPayload,
          compute: async () => all(
            `
              SELECT
                j.id AS journal_id,
                j.posted_at AS written_off_at,
                j.loan_id,
                j.client_id,
                c.full_name AS client_name,
                j.branch_id,
                b.name AS branch_name,
                r.name AS region_name,
                ROUND(COALESCE(SUM(CASE WHEN a.code = 'WRITE_OFF_EXPENSE' AND e.side = 'debit' THEN e.amount ELSE 0 END), 0), 2) AS write_off_amount,
                j.note AS write_off_note
              FROM gl_journals j
              INNER JOIN gl_entries e ON e.journal_id = j.id
              INNER JOIN gl_accounts a ON a.id = e.account_id
              LEFT JOIN clients c ON c.id = j.client_id
              LEFT JOIN branches b ON b.id = j.branch_id
              LEFT JOIN regions r ON r.id = b.region_id
              ${whereSql}
              GROUP BY j.id
              ORDER BY datetime(j.posted_at) DESC, j.id DESC
            `,
            queryParams,
          ),
        });

        if (format !== "json") {
          const cols = [
            "written_off_at",
            "journal_id",
            "loan_id",
            "client_id",
            "client_name",
            "branch_id",
            "branch_name",
            "region_name",
            "write_off_amount",
            "write_off_note",
          ];
          sendTabularExport(res, {
            format,
            filenameBase: "write-offs-report",
            title: "Write-offs Report",
            headers: cols,
            rows: writeOffs,
          });
          return;
        }

        res.status(200).json({
          period: { dateFrom: dateFrom || null, dateTo: dateTo || null },
          summary: {
            write_off_count: Number(summary?.write_off_count || 0),
            total_write_off_expense: Number(summary?.total_write_off_expense || 0),
            total_outstanding_at_write_off: Number(summary?.total_write_off_expense || 0),
          },
          writeOffs: writeOffs.map(
            (row: Record<string, any>) => ({
              ...row,
              journal_id: Number(row.journal_id),
              loan_id: Number(row.loan_id),
              client_id: Number(row.client_id),
              branch_id: Number(row.branch_id),
              write_off_amount: Number(row.write_off_amount || 0),
              outstanding_balance_at_write_off: Number(row.write_off_amount || 0),
            }),
          ),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/reports/balance-sheet",
    authenticate,
    authorize("admin", "ceo", "finance", "investor", "partner", "operations_manager", "area_manager"),
    async (req, res, next) => {
      try {
        const scope = await hierarchyService.resolveHierarchyScope(req.user);
        const format = resolveFormat(req.query.format, res);
        if (!format) return;

        const dateTo = parseDateParam(req.query.dateTo, "dateTo", res);
        if (dateTo === undefined) return;
        
        const branchFilter = parseId(req.query.branchId);
        const whereBuilder = createSqlWhereBuilder();
        if (dateTo) {
            whereBuilder.addClause("j.posted_at <= ?");
            whereBuilder.getParams().push(dateTo);
        }
        
        if (!applyScopeAndBranchFilter({
          whereBuilder,
          scope,
          branchColumnRef: "j.branch_id",
          branchFilter,
          tenantColumnRef: "j.tenant_id",
          res,
        })) {
          return;
        }

        const whereSql = whereBuilder.buildWhere();
        const queryParams = whereBuilder.getParams();
        const cacheKeyPayload = {
          dateTo: dateTo || null,
          branchId: branchFilter || null,
        };

        const balanceSheet = await resolveCachedReport({
          namespace: "reports:balance-sheet:summary",
          user: req.user,
          scope,
          keyPayload: cacheKeyPayload,
          compute: async () => {
            const balances = await get(
              `
                SELECT
                  ROUND(COALESCE(SUM(CASE 
                    WHEN a.code = 'CASH' AND e.side = 'debit' THEN e.amount
                    WHEN a.code = 'CASH' AND e.side = 'credit' THEN -e.amount
                    ELSE 0 END), 0), 2) AS total_cash,
                  ROUND(COALESCE(SUM(CASE 
                    WHEN a.code = 'LOAN_RECEIVABLE' AND e.side = 'debit' THEN e.amount
                    WHEN a.code = 'LOAN_RECEIVABLE' AND e.side = 'credit' THEN -e.amount
                    ELSE 0 END), 0), 2) AS loan_receivable,
                  ROUND(COALESCE(SUM(CASE 
                    WHEN a.code = 'SUSPENSE_FUNDS' AND e.side = 'credit' THEN e.amount
                    WHEN a.code = 'SUSPENSE_FUNDS' AND e.side = 'debit' THEN -e.amount
                    ELSE 0 END), 0), 2) AS suspense_funds_liability,
                  ROUND(COALESCE(SUM(CASE 
                    WHEN a.account_type IN ('income') AND e.side = 'credit' THEN e.amount
                    WHEN a.account_type IN ('income') AND e.side = 'debit' THEN -e.amount
                    WHEN a.account_type IN ('expense') AND e.side = 'debit' THEN -e.amount
                    WHEN a.account_type IN ('expense') AND e.side = 'credit' THEN e.amount
                    ELSE 0 END), 0), 2) AS retained_earnings
                FROM gl_entries e
                INNER JOIN gl_accounts a ON a.id = e.account_id
                INNER JOIN gl_journals j ON j.id = e.journal_id
                ${whereSql}
              `,
              queryParams,
            );

            const totalAssets = Number(balances?.total_cash || 0) + Number(balances?.loan_receivable || 0);
            const totalLiabilities = Number(balances?.suspense_funds_liability || 0);
            const equity = Number(balances?.retained_earnings || 0);

            return {
              assets: {
                  cash: Number(balances?.total_cash || 0),
                  loan_receivable: Number(balances?.loan_receivable || 0),
                  total_assets: totalAssets,
              },
              liabilities: {
                  suspense_funds: totalLiabilities,
                  total_liabilities: totalLiabilities,
              },
              equity: {
                  retained_earnings: equity,
                  total_equity: equity,
              },
              balanced: Math.abs(totalAssets - (totalLiabilities + equity)) <= 0.05
            };
          },
        });

        if (format !== "json") {
           const cols = [
            "total_assets",
             "cash",
             "loan_receivable",
             "total_liabilities",
             "suspense_funds",
             "total_equity",
             "retained_earnings"
           ];
           const rowFlat = {
              total_assets: balanceSheet.assets.total_assets,
               cash: balanceSheet.assets.cash,
               loan_receivable: balanceSheet.assets.loan_receivable,
               total_liabilities: balanceSheet.liabilities.total_liabilities,
               suspense_funds: balanceSheet.liabilities.suspense_funds,
               total_equity: balanceSheet.equity.total_equity,
               retained_earnings: balanceSheet.equity.retained_earnings,
           }
          sendTabularExport(res, {
            format,
            filenameBase: "balance-sheet-report",
            title: "Balance Sheet Report",
            headers: cols,
            rows: [rowFlat],
          });
          return;
        }

        res.status(200).json({
          period: { asOfDate: dateTo || new Date().toISOString() },
          ...balanceSheet,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/reports/cash-flow",
    authenticate,
    authorize("admin", "ceo", "finance", "investor", "partner", "operations_manager", "area_manager"),
    async (req, res, next) => {
      try {
        const scope = await hierarchyService.resolveHierarchyScope(req.user);
        const format = resolveFormat(req.query.format, res);
        if (!format) return;

        const dateFrom = parseDateParam(req.query.dateFrom, "dateFrom", res);
        if (dateFrom === undefined) return;
        const dateTo = parseDateParam(req.query.dateTo, "dateTo", res);
        if (dateTo === undefined) return;
        
        if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
          res.status(400).json({ message: "dateFrom must be before or equal to dateTo." });
          return;
        }

        const branchFilter = parseId(req.query.branchId);
        const whereBuilder = createSqlWhereBuilder();
        whereBuilder.addDateRange("j.posted_at", dateFrom, dateTo);
        
        if (!applyScopeAndBranchFilter({
          whereBuilder,
          scope,
          branchColumnRef: "j.branch_id",
          branchFilter,
          tenantColumnRef: "j.tenant_id",
          res,
        })) {
          return;
        }

        const whereSql = whereBuilder.buildWhere();
        const queryParams = whereBuilder.getParams();
        const cacheKeyPayload = {
          dateFrom: dateFrom || null,
          dateTo: dateTo || null,
          branchId: branchFilter || null,
        };

        const cashFlow = await resolveCachedReport({
          namespace: "reports:cash-flow:summary",
          user: req.user,
          scope,
          keyPayload: cacheKeyPayload,
          compute: async () => {
             const flows = await get(
              `
                SELECT
                  ROUND(COALESCE(SUM(CASE 
                    WHEN j.reference_type = 'loan_disbursement' AND a.code = 'CASH' AND e.side = 'credit' THEN e.amount
                    ELSE 0 END), 0), 2) AS outflows_disbursements,
                  ROUND(COALESCE(SUM(CASE 
                    WHEN j.reference_type = 'loan_repayment' AND a.code = 'CASH' AND e.side = 'debit' THEN e.amount
                    ELSE 0 END), 0), 2) AS inflows_repayments,
                  ROUND(COALESCE(SUM(CASE 
                    WHEN j.reference_type = 'suspense_unallocated_receipt' AND a.code = 'CASH' AND e.side = 'debit' THEN e.amount
                    ELSE 0 END), 0), 2) AS inflows_suspense,
                  ROUND(COALESCE(SUM(CASE 
                    WHEN j.reference_type = 'reversal' AND a.code = 'CASH' AND e.side = 'debit' THEN e.amount
                    WHEN j.reference_type = 'reversal' AND a.code = 'CASH' AND e.side = 'credit' THEN -e.amount
                    ELSE 0 END), 0), 2) AS net_reversals
                FROM gl_entries e
                INNER JOIN gl_accounts a ON a.id = e.account_id
                INNER JOIN gl_journals j ON j.id = e.journal_id
                ${whereSql} AND a.code = 'CASH'
              `,
              queryParams,
            );

            const totalInflows = Number(flows?.inflows_repayments || 0) + Number(flows?.inflows_suspense || 0);
            const totalOutflows = Number(flows?.outflows_disbursements || 0);
            const netCashFlow = totalInflows - totalOutflows + Number(flows?.net_reversals || 0);

            return {
              inflows: {
                repayments: Number(flows?.inflows_repayments || 0),
                suspense: Number(flows?.inflows_suspense || 0),
                total: totalInflows
              },
              outflows: {
                disbursements: totalOutflows,
                 total: totalOutflows
              },
              net_reversals: Number(flows?.net_reversals || 0),
              net_cash_flow: Number(netCashFlow.toFixed(2))
            };
          },
        });

        if (format !== "json") {
           const cols = [
             "inflows_repayments",
             "inflows_suspense",
             "total_inflows",
             "outflows_disbursements",
             "total_outflows",
             "net_reversals",
             "net_cash_flow",
           ];
           const rowFlat = {
                inflows_repayments: cashFlow.inflows.repayments,
                inflows_suspense: cashFlow.inflows.suspense,
                total_inflows: cashFlow.inflows.total,
                outflows_disbursements: cashFlow.outflows.disbursements,
                total_outflows: cashFlow.outflows.total,
                net_reversals: cashFlow.net_reversals,
                net_cash_flow: cashFlow.net_cash_flow,
           }
          sendTabularExport(res, {
            format,
            filenameBase: "cash-flow-report",
            title: "Cash Flow Report",
            headers: cols,
            rows: [rowFlat],
          });
          return;
        }

        res.status(200).json({
           period: { dateFrom: dateFrom || null, dateTo: dateTo || null },
          ...cashFlow,
        });
      } catch (error) {
        next(error);
      }
    },
  );
}

export {

  registerFinancialReports,
};
