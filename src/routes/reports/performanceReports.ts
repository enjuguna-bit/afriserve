import type { RouteRegistrar } from "../../types/routeDeps.js";
import { createSqlWhereBuilder } from "../../utils/sqlBuilder.js";

interface AppContext {
  authenticate: any;
  authorize: (...roles: string[]) => any;
  reportRoles: string[];
  applyScopeAndBranchFilter: (options: {
    whereBuilder: ReturnType<typeof createSqlWhereBuilder>;
    scope: any;
    branchColumnRef: string;
    branchFilter: number | null;
    tenantColumnRef?: string | null;
    res: any;
  }) => boolean;
  parseId: (id: unknown) => number | null;
  parseDateParam: (value: unknown, fieldName: string, res: any) => string | null | undefined;
  resolveFormat: (rawFormat: unknown, res: any) => "json" | "csv" | "pdf" | "xlsx" | null;
  sendTabularExport: (res: any, options: any) => boolean;
  hierarchyService: any;
  incomeTrackingService: any;
}

export function registerPerformanceReports(app: RouteRegistrar, context: AppContext) {
  const {
    authenticate,
    authorize,
    reportRoles,
    applyScopeAndBranchFilter,
    parseId,
    parseDateParam,
    resolveFormat,
    sendTabularExport,
    hierarchyService,
    incomeTrackingService,
  } = context;

  /**
   * GET /api/reports/performance/monthly
   * @query {string} month - ISO-8601 date within the month of interest
   * @query {number} branchId - Optional branch filter
   */
  app.get("/api/reports/performance/monthly", authenticate, authorize(...reportRoles), async (req, res, next) => {
    try {
      const scope = await hierarchyService.resolveHierarchyScope(req.user);
      const rawMonth = req.query.month || new Date().toISOString();
      const month = parseDateParam(rawMonth, "month", res);
      if (month === undefined) return;

      const branchId = req.query.branchId ? parseId(req.query.branchId) : null;
      if (branchId !== null) {
        const wb = createSqlWhereBuilder();
        if (!applyScopeAndBranchFilter({ whereBuilder: wb, scope, branchColumnRef: "branch_id", branchFilter: branchId, res })) {
          return;
        }
      }

      const performance = await incomeTrackingService.getMonthlyPerformance(scope, month || new Date().toISOString(), branchId);
      
      const format = resolveFormat(req.query.format, res);
      if (!format) return;

      if (format === "json") {
        res.status(200).json(performance);
      } else {
        sendTabularExport(res, {
          format,
          filenameBase: `monthly_performance_${performance.month}`,
          title: `Monthly Performance Report - ${performance.month}`,
          headers: ["Month", "Interest Income", "Fee Income", "Penalty Income", "Total Income"],
          rows: [{
            month: performance.month,
            interest_income: performance.interest_income,
            fee_income: performance.fee_income,
            penalty_income: performance.penalty_income,
            total_income: performance.total_income,
          }],
        });
      }
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/reports/performance/cashflow
   * @query {number} branchId - Optional branch filter
   */
  app.get("/api/reports/performance/cashflow", authenticate, authorize(...reportRoles), async (req, res, next) => {
    try {
      const scope = await hierarchyService.resolveHierarchyScope(req.user);
      const branchId = req.query.branchId ? parseId(req.query.branchId) : null;
      if (branchId !== null && !applyScopeAndBranchFilter({ whereBuilder: { addCondition: () => {}, addEquals: () => {} } as any, scope, branchColumnRef: "", branchFilter: branchId, res })) {
        return;
      }

      const cashFlow = await incomeTrackingService.getCashFlowStatus(scope, branchId);
      
      const format = resolveFormat(req.query.format, res);
      if (!format) return;

      if (format === "json") {
        res.status(200).json(cashFlow);
      } else {
        sendTabularExport(res, {
          format,
          filenameBase: "cash_flow_status",
          title: "Continuous Cash Flow Status",
          headers: ["Total Inflow", "Total Outflow", "Net Cash Flow"],
          rows: [{
            total_inflow: cashFlow.total_inflow,
            total_outflow: cashFlow.total_outflow,
            net_cash_flow: cashFlow.net_cash_flow,
          }],
        });
      }
    } catch (error) {
      next(error);
    }
  });
}
