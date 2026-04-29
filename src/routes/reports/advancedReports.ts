/**
 * advancedReports.ts — HTTP route handlers for the six new reportQueryService
 * methods added as part of Gap 8.
 *
 * All endpoints are separate from the existing route files so they can be
 * reviewed / feature-flagged / rolled back without touching legacy routes.
 *
 * Endpoint map:
 *   GET /api/reports/arrears-aging          → getCollectionsArrearsAgingReport
 *   GET /api/reports/officer-performance-v2 → getOfficerPerformanceReport
 *   GET /api/reports/branch-pnl             → getBranchPnLReport
 *   GET /api/reports/write-offs-portfolio   → getWriteOffReport (loan-table based)
 *   GET /api/reports/capital-adequacy       → getCapitalAdequacyReport
 *   GET /api/reports/client-retention       → getClientRetentionReport
 *
 * All endpoints:
 *   - require authentication + role-based authorisation
 *   - apply the caller's hierarchy scope automatically
 *   - support ?format=json|csv|pdf|xlsx
 *   - are cached through resolveCachedReport (if reportCache is configured)
 */
import type { RouteRegistrar } from "../../types/routeDeps.js";

function registerAdvancedReports(app: RouteRegistrar, context: Record<string, any>) {
  const {
    authenticate,
    authorize,
    parseId,
    hierarchyService,
    resolveFormat,
    parseDateParam,
    sendTabularExport,
    reportQueryService,
  } = context;

  const financeRoles = [
    "admin", "ceo", "finance", "investor", "partner",
    "operations_manager", "area_manager",
  ];
  const broadRoles = [
    "admin", "ceo", "finance", "investor", "partner",
    "operations_manager", "area_manager", "loan_officer", "cashier",
  ];

  function resolveOfficerFilter(rawOfficerIds: unknown, rawOfficerId: unknown, res: any): number[] | null | undefined {
    const tokens = [rawOfficerIds, rawOfficerId]
      .flatMap((v) => Array.isArray(v) ? v : [v])
      .flatMap((v) => String(v || "").split(","))
      .map((v) => v.trim())
      .filter((v) => v.length > 0 && v.toLowerCase() !== "all");

    if (tokens.length === 0) return null;

    const ids = [...new Set(tokens.map((v) => parseId(v)))].filter(
      (v): v is number => Number.isInteger(v) && Number(v) > 0,
    );
    if (ids.length !== tokens.length) {
      res.status(400).json({ message: "Invalid officerId or officerIds filter" });
      return undefined;
    }
    return ids.sort((a, b) => a - b);
  }

  // ── 1. Arrears aging (bucket report) ─────────────────────────────────────
  // Complements the legacy /api/reports/aging route (which uses raw CTEs).
  // This version delegates to getCollectionsArrearsAgingReport in the
  // reportQueryService and follows the standardised bucket structure.

  app.get(
    "/api/reports/arrears-aging",
    authenticate,
    authorize(...broadRoles),
    async (req: any, res: any, next: any) => {
      try {
        const scope      = await hierarchyService.resolveHierarchyScope(req.user);
        const format     = resolveFormat(req.query.format, res);
        if (!format) return;

        const overdueAsOf = parseDateParam(req.query.overdueAsOf || req.query.dateTo, "overdueAsOf", res);
        if (overdueAsOf === undefined) return;

        const branchFilter = parseId(req.query.branchId);

        const payload = await reportQueryService.getCollectionsArrearsAgingReport({
          user:        req.user,
          scope,
          branchFilter,
          overdueAsOf,
        });

        if (format !== "json") {
          const rows = Object.entries(payload.buckets as Record<string, any>).map(([bucket, data]: [string, any]) => ({
            bucket,
            loan_count:          data.loan_count,
            client_count:        data.client_count,
            arrears_amount:      data.arrears_amount,
            outstanding_balance: data.outstanding_balance,
          }));
          sendTabularExport(res, {
            format,
            filenameBase: "arrears-aging-report",
            title:        "Arrears Aging Report",
            headers:      ["bucket", "loan_count", "client_count", "arrears_amount", "outstanding_balance"],
            rows,
          });
          return;
        }

        res.status(200).json(payload);
      } catch (err) { next(err); }
    },
  );

  // ── 2. Officer performance v2 (PAR-aware) ────────────────────────────────
  // Richer than the existing /api/reports/officer-performance which only
  // shows disbursements, collections, and collection-rate.
  // v2 adds: active portfolio, overdue loans, PAR ratio, write-offs.

  app.get(
    "/api/reports/officer-performance-v2",
    authenticate,
    authorize(...financeRoles),
    async (req: any, res: any, next: any) => {
      try {
        const scope      = await hierarchyService.resolveHierarchyScope(req.user);
        const format     = resolveFormat(req.query.format, res);
        if (!format) return;

        const dateFrom = parseDateParam(req.query.dateFrom, "dateFrom", res);
        if (dateFrom === undefined) return;
        const dateTo   = parseDateParam(req.query.dateTo,   "dateTo",   res);
        if (dateTo   === undefined) return;
        if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
          return res.status(400).json({ message: "dateFrom must be before or equal to dateTo." });
        }

        const overdueAsOf   = parseDateParam(req.query.overdueAsOf, "overdueAsOf", res);
        if (overdueAsOf === undefined) return;

        const branchFilter    = parseId(req.query.branchId);
        const officerIdsFilter = resolveOfficerFilter(req.query.officerIds, req.query.officerId, res);
        if (officerIdsFilter === undefined) return;

        const payload = await reportQueryService.getOfficerPerformanceReport({
          user: req.user,
          scope,
          branchFilter,
          officerIdFilter: officerIdsFilter,
          dateFrom,
          dateTo,
          overdueAsOf,
        });

        if (format !== "json") {
          const cols = [
            "officer_id", "officer_name", "officer_email", "branch_id",
            "disbursed_loans", "disbursed_principal",
            "active_loans", "outstanding_balance", "collected_in_period",
            "overdue_loans", "overdue_arrears", "par_ratio",
            "written_off_loans", "written_off_balance",
          ];
          sendTabularExport(res, {
            format,
            filenameBase: "officer-performance-v2-report",
            title:        "Officer Performance Report (v2)",
            headers:      cols,
            rows:         payload.officers,
          });
          return;
        }

        res.status(200).json(payload);
      } catch (err) { next(err); }
    },
  );

  // ── 3. Branch P&L / income statement ─────────────────────────────────────
  // Loan-book–based P&L (interest income + fees + penalties − write-offs −
  // provision). Complements /api/reports/income-statement which is GL-based.

  app.get(
    "/api/reports/branch-pnl",
    authenticate,
    authorize(...financeRoles),
    async (req: any, res: any, next: any) => {
      try {
        const scope  = await hierarchyService.resolveHierarchyScope(req.user);
        const format = resolveFormat(req.query.format, res);
        if (!format) return;

        const dateFrom = parseDateParam(req.query.dateFrom, "dateFrom", res);
        if (dateFrom === undefined) return;
        const dateTo   = parseDateParam(req.query.dateTo,   "dateTo",   res);
        if (dateTo   === undefined) return;
        if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
          return res.status(400).json({ message: "dateFrom must be before or equal to dateTo." });
        }

        const branchFilter = parseId(req.query.branchId);

        const payload = await reportQueryService.getBranchPnLReport({
          user: req.user,
          scope,
          branchFilter,
          dateFrom,
          dateTo,
        });

        if (format !== "json") {
          const cols = [
            "branch_id", "branch_name", "branch_code", "region_name",
            "loan_count", "interest_income", "fee_income", "penalty_income",
            "gross_income", "write_off_amount", "provision_credit_loss",
            "total_expenses", "net_income", "collected_in_period",
          ];
          sendTabularExport(res, {
            format,
            filenameBase: "branch-pnl-report",
            title:        "Branch P&L Report",
            headers:      cols,
            rows:         payload.branches,
          });
          return;
        }

        res.status(200).json(payload);
      } catch (err) { next(err); }
    },
  );

  // ── 4. Write-off report (portfolio / loan-table based) ───────────────────
  // Lists written-off loans directly from the loans table.
  // The existing /api/reports/write-offs is GL-journal–based (requires GL
  // entries); this version works even when the GL module is not fully posted.

  app.get(
    "/api/reports/write-offs-portfolio",
    authenticate,
    authorize(...financeRoles),
    async (req: any, res: any, next: any) => {
      try {
        const scope  = await hierarchyService.resolveHierarchyScope(req.user);
        const format = resolveFormat(req.query.format, res);
        if (!format) return;

        const dateFrom = parseDateParam(req.query.dateFrom, "dateFrom", res);
        if (dateFrom === undefined) return;
        const dateTo   = parseDateParam(req.query.dateTo,   "dateTo",   res);
        if (dateTo   === undefined) return;
        if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
          return res.status(400).json({ message: "dateFrom must be before or equal to dateTo." });
        }

        const branchFilter     = parseId(req.query.branchId);
        const officerIdsFilter = resolveOfficerFilter(req.query.officerIds, req.query.officerId, res);
        if (officerIdsFilter === undefined) return;

        const payload = await reportQueryService.getWriteOffReport({
          user: req.user,
          scope,
          branchFilter,
          officerIdFilter: officerIdsFilter,
          dateFrom,
          dateTo,
        });

        if (format !== "json") {
          const cols = [
            "loan_id", "client_id", "client_name",
            "branch_id", "branch_name", "officer_id", "officer_name",
            "principal", "repaid_total", "net_loss", "written_off_at",
          ];
          sendTabularExport(res, {
            format,
            filenameBase: "write-offs-portfolio-report",
            title:        "Write-off Report (Portfolio)",
            headers:      cols,
            rows:         payload.loans,
          });
          return;
        }

        res.status(200).json(payload);
      } catch (err) { next(err); }
    },
  );

  // ── 5. Capital adequacy snapshot ─────────────────────────────────────────
  // Provides the portfolio-side inputs for capital adequacy calculations:
  // PAR 30 / 60 / 90 plus NPL ratios, write-off rate, provision pool, gross outstanding.

  app.get(
    "/api/reports/capital-adequacy",
    authenticate,
    authorize(...financeRoles),
    async (req: any, res: any, next: any) => {
      try {
        const scope      = await hierarchyService.resolveHierarchyScope(req.user);
        const format     = resolveFormat(req.query.format, res);
        if (!format) return;

        const overdueAsOf = parseDateParam(req.query.overdueAsOf || req.query.dateTo, "overdueAsOf", res);
        if (overdueAsOf === undefined) return;

        const payload = await reportQueryService.getCapitalAdequacyReport({
          user: req.user,
          scope,
          overdueAsOf,
        });

        if (format !== "json") {
          const cols = [
            "as_of",
            "total_loans", "total_principal_disbursed", "gross_outstanding",
            "provision_pool", "written_off_principal", "written_off_net_loss",
            "par30_balance", "par60_balance", "par90_balance", "npl_balance",
            "par30_ratio", "par60_ratio", "par90_ratio", "npl_ratio", "write_off_rate",
          ];
          sendTabularExport(res, {
            format,
            filenameBase: "capital-adequacy-report",
            title:        "Capital Adequacy Report",
            headers:      cols,
            rows:         [payload],
          });
          return;
        }

        res.status(200).json(payload);
      } catch (err) { next(err); }
    },
  );

  // ── 6. Client retention / graduation report ───────────────────────────────
  // Shows how many clients are on each loan cycle (1st, 2nd, 3rd, 4+),
  // average loan size per cycle, and the retention/dropout rate.

  app.get(
    "/api/reports/client-retention",
    authenticate,
    authorize(...financeRoles),
    async (req: any, res: any, next: any) => {
      try {
        const scope  = await hierarchyService.resolveHierarchyScope(req.user);
        const format = resolveFormat(req.query.format, res);
        if (!format) return;

        const dateFrom = parseDateParam(req.query.dateFrom, "dateFrom", res);
        if (dateFrom === undefined) return;
        const dateTo   = parseDateParam(req.query.dateTo,   "dateTo",   res);
        if (dateTo   === undefined) return;
        if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
          return res.status(400).json({ message: "dateFrom must be before or equal to dateTo." });
        }

        const branchFilter = parseId(req.query.branchId);

        const payload = await reportQueryService.getClientRetentionReport({
          user: req.user,
          scope,
          branchFilter,
          dateFrom,
          dateTo,
        });

        if (format !== "json") {
          const cols = [
            "cycle", "client_count", "avg_loan_size",
            "returned_count", "dropout_count", "retention_rate",
          ];
          sendTabularExport(res, {
            format,
            filenameBase: "client-retention-report",
            title:        "Client Retention Report",
            headers:      cols,
            rows:         payload.cycles,
          });
          return;
        }

        res.status(200).json(payload);
      } catch (err) { next(err); }
    },
  );
}

export { registerAdvancedReports };
