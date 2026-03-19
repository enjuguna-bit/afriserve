import { createSqlWhereBuilder } from "../../utils/sqlBuilder.js";
import {
  getLegacyReportTemplate,
  mapLegacyArrearsRows,
  mapLegacyDisbursementRows,
  mapLegacyDuesRows,
} from "../../services/legacyReportTemplateService.js";
import type { RouteRegistrar } from "../../types/routeDeps.js";

function registerPortfolioReports(app: RouteRegistrar, context: Record<string, any>) {
  const {
    get,
    all,
    authenticate,
    authorize,
    parseId,
    hierarchyService,
    reportRoles,
    resolveFormat,
    parseDateParam,
    applyScopeAndBranchFilter,
    resolveCachedReport,
    sendTabularExport,
    reportQueryService,
  } = context;

  function resolveOfficerFilter(rawOfficerIds: unknown, rawOfficerId: unknown, res: any): number[] | null | undefined {
    const tokens = [rawOfficerIds, rawOfficerId]
      .flatMap((value) => Array.isArray(value) ? value : [value])
      .flatMap((value) => String(value || "").split(","))
      .map((value) => value.trim())
      .filter((value) => value.length > 0 && value.toLowerCase() !== "all");

    if (tokens.length === 0) {
      return null;
    }

    const officerIds = [...new Set(tokens.map((value) => parseId(value)))].filter(
      (value): value is number => Number.isInteger(value) && Number(value) > 0,
    );
    if (officerIds.length !== tokens.length) {
      res.status(400).json({ message: "Invalid officerId or officerIds filter" });
      return undefined;
    }

    return officerIds.sort((left, right) => left - right);
  }

  function buildIdListClause(sqlExpression: string, ids: number[] | null | undefined) {
    if (!ids || ids.length === 0) {
      return null;
    }

    return {
      sql: `${sqlExpression} IN (${ids.map(() => "?").join(", ")})`,
      params: ids,
    };
  }

  function applyOfficerFilter(whereBuilder: ReturnType<typeof createSqlWhereBuilder>, sqlExpression: string, ids: number[] | null | undefined) {
    const clause = buildIdListClause(sqlExpression, ids);
    if (!clause) {
      return;
    }
    whereBuilder.addClause(clause.sql, clause.params);
  }

  function startOfTodayIso(): string {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date.toISOString();
  }

  function endOfDayAfterDaysIso(daysToAdd: number): string {
    const date = new Date();
    date.setHours(23, 59, 59, 999);
    date.setDate(date.getDate() + daysToAdd);
    return date.toISOString();
  }

  function resolveArrearsSnapshotIso(dateTo?: string | null): string {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const requestedDate = dateTo ? new Date(String(dateTo)) : endOfToday;
    return new Date(Math.min(requestedDate.getTime(), endOfToday.getTime())).toISOString();
  }

  /**
   * @swagger
   * /api/reports/portfolio:
   *   get:
   *     summary: Get portfolio summary report
   *     tags: [Reports]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: scope
   *         schema:
   *           type: string
   *           enum: [all, mine]
   *         description: Report scope filter
   *       - in: query
   *         name: includeBreakdown
   *         schema:
   *           type: boolean
   *         description: Include branch and status breakdown in JSON responses
   *       - in: query
   *         name: branchId
   *         schema:
   *           type: integer
   *         description: Optional branch filter within the caller's allowed scope
   *       - in: query
   *         name: officerId
   *         schema:
   *           type: integer
   *         description: Optional officer filter within the caller's allowed scope
   *       - in: query
   *         name: dateFrom
   *         schema:
   *           type: string
   *           format: date-time
   *         description: Optional report period start
   *       - in: query
   *         name: dateTo
   *         schema:
   *           type: string
   *           format: date-time
   *         description: Optional report period end
   *       - in: query
   *         name: format
   *         schema:
   *           type: string
   *           enum: [json, csv, pdf, xlsx]
   *         description: Response format
   *     responses:
   *       200:
   *         description: Portfolio report payload
   *       400:
   *         description: Invalid query parameters
   *       403:
   *         description: Forbidden
   */
  app.get(
    "/api/reports/portfolio",
    authenticate,
    authorize(...reportRoles),
    async (req, res, next) => {
      try {
        const scope = await hierarchyService.resolveHierarchyScope(req.user);
        const includeBreakdown = ["1", "true", "yes"].includes(String(req.query.includeBreakdown || "").trim().toLowerCase());
        const requestedFormat = resolveFormat(req.query.format, res);
        if (!requestedFormat) {
          return;
        }
        const requestedScope = String(req.query.scope || "").trim().toLowerCase();
        if (requestedScope && requestedScope !== "all" && requestedScope !== "mine") {
          res.status(400).json({ message: "Invalid scope. Use one of: all, mine" });
          return;
        }
        const dateFrom = parseDateParam(req.query.dateFrom, "dateFrom", res);
        if (dateFrom === undefined) {
          return;
        }
        const dateTo = parseDateParam(req.query.dateTo, "dateTo", res);
        if (dateTo === undefined) {
          return;
        }
        if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
          res.status(400).json({ message: "dateFrom must be before or equal to dateTo." });
          return;
        }
        const branchFilter = parseId(req.query.branchId);
        const officerIdsFilter = resolveOfficerFilter(req.query.officerIds, req.query.officerId, res);
        if (officerIdsFilter === undefined) {
          return;
        }
        const mineOnly = requestedScope === "mine";
        const effectiveIncludeBreakdown = includeBreakdown && requestedFormat === "json";

        const payload = await reportQueryService.getPortfolioReport({
          user: req.user,
          scope,
          includeBreakdown: effectiveIncludeBreakdown,
          mineOnly,
          officerIdFilter: officerIdsFilter,
          branchFilter,
          dateFrom,
          dateTo,
        });

        if (requestedFormat !== "json") {
          const cols = [
            "total_loans",
            "active_loans",
            "restructured_loans",
            "written_off_loans",
            "overdue_installments",
            "principal_disbursed",
            "expected_total",
            "repaid_total",
            "outstanding_balance",
            "written_off_balance",
          ];
          sendTabularExport(res, {
            format: requestedFormat,
            filenameBase: "portfolio-report",
            title: "Portfolio Report",
            headers: cols,
            rows: [payload || {}],
          });
          return;
        }

        res.status(200).json(payload);
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/reports/board-summary",
    authenticate,
    authorize(...reportRoles),
    async (req, res, next) => {
      try {
        const requestedFormat = resolveFormat(req.query.format, res);
        if (!requestedFormat) {
          return;
        }
        const scope = await hierarchyService.resolveHierarchyScope(req.user);
        const requestedScope = String(req.query.scope || "").trim().toLowerCase();
        if (requestedScope && requestedScope !== "all" && requestedScope !== "mine") {
          res.status(400).json({ message: "Invalid scope. Use one of: all, mine" });
          return;
        }

        const mineOnly = requestedScope === "mine";
        const explicitDateFromRaw = String(req.query.dateFrom || "").trim();
        const explicitDateToRaw = String(req.query.dateTo || "").trim();
        if ((explicitDateFromRaw && !explicitDateToRaw) || (!explicitDateFromRaw && explicitDateToRaw)) {
          res.status(400).json({ message: "dateFrom and dateTo must be provided together for board summary." });
          return;
        }

        const explicitDateFrom = explicitDateFromRaw ? parseDateParam(req.query.dateFrom, "dateFrom", res) : null;
        if (explicitDateFrom === undefined) {
          return;
        }
        const explicitDateTo = explicitDateToRaw ? parseDateParam(req.query.dateTo, "dateTo", res) : null;
        if (explicitDateTo === undefined) {
          return;
        }
        if (explicitDateFrom && explicitDateTo && new Date(explicitDateFrom) > new Date(explicitDateTo)) {
          res.status(400).json({ message: "dateFrom must be before or equal to dateTo." });
          return;
        }

        const hasExplicitDateRange = Boolean(explicitDateFrom && explicitDateTo);
        const periodDaysInput = Number.parseInt(String(req.query.periodDays || "30"), 10);
        const fallbackPeriodDays = Number.isInteger(periodDaysInput)
          ? Math.min(365, Math.max(7, periodDaysInput))
          : 30;
        const branchLimitInput = Number.parseInt(String(req.query.branchLimit || "5"), 10);
        const branchLimit = Number.isInteger(branchLimitInput)
          ? Math.min(20, Math.max(3, branchLimitInput))
          : 5;

        const dateFromIso = hasExplicitDateRange ? String(explicitDateFrom) : null;
        const dateToIso = hasExplicitDateRange ? String(explicitDateTo) : null;
        const effectiveDateTo = hasExplicitDateRange ? new Date(String(dateToIso)) : new Date();
        const effectiveDateFrom = hasExplicitDateRange
          ? new Date(String(dateFromIso))
          : new Date(effectiveDateTo.getTime() - ((fallbackPeriodDays - 1) * 24 * 60 * 60 * 1000));
        const periodDays = hasExplicitDateRange
          ? Math.max(1, Math.floor((effectiveDateTo.getTime() - effectiveDateFrom.getTime()) / (24 * 60 * 60 * 1000)) + 1)
          : fallbackPeriodDays;
        const normalizedDateFromIso = effectiveDateFrom.toISOString();
        const normalizedDateToIso = effectiveDateTo.toISOString();
        const arrearsSnapshotAt = resolveArrearsSnapshotIso(normalizedDateToIso);
        const cacheMinuteBucket = Math.floor(Date.now() / 60000);
        const branchFilter = parseId(req.query.branchId);
        const officerIdsFilter = resolveOfficerFilter(req.query.officerIds, req.query.officerId, res);
        if (officerIdsFilter === undefined) {
          return;
        }

        const portfolio = await reportQueryService.getPortfolioReport({
          user: req.user,
          scope,
          includeBreakdown: false,
          mineOnly,
          officerIdFilter: officerIdsFilter,
          branchFilter,
          overdueAsOf: normalizedDateToIso,
        });

        const collectionWhereBuilder = createSqlWhereBuilder();
        collectionWhereBuilder.addDateRange("r.paid_at", normalizedDateFromIso, normalizedDateToIso);
        applyOfficerFilter(collectionWhereBuilder, "l.officer_id", officerIdsFilter);
        if (!applyScopeAndBranchFilter({
          whereBuilder: collectionWhereBuilder,
          scope,
          branchColumnRef: "l.branch_id",
          branchFilter,
          res,
        })) {
          return;
        }

        const collectionWhereSql = collectionWhereBuilder.buildWhere();
        const collectionParams = collectionWhereBuilder.getParams();

        const dueWhereBuilder = createSqlWhereBuilder();
        dueWhereBuilder.addDateRange("i.due_date", normalizedDateFromIso, normalizedDateToIso);
        applyOfficerFilter(dueWhereBuilder, "l.officer_id", officerIdsFilter);
        if (!applyScopeAndBranchFilter({
          whereBuilder: dueWhereBuilder,
          scope,
          branchColumnRef: "l.branch_id",
          branchFilter,
          res,
        })) {
          return;
        }

        const dueWhereSql = dueWhereBuilder.buildWhere();
        const dueParams = dueWhereBuilder.getParams();

        const arrearsWhereBuilder = createSqlWhereBuilder();
        arrearsWhereBuilder.addClause("l.status IN ('active', 'restructured')");
        applyOfficerFilter(arrearsWhereBuilder, "l.officer_id", officerIdsFilter);
        if (!applyScopeAndBranchFilter({
          whereBuilder: arrearsWhereBuilder,
          scope,
          branchColumnRef: "l.branch_id",
          branchFilter,
          res,
        })) {
          return;
        }

        const arrearsWhereSql = arrearsWhereBuilder.buildWhere();
        const arrearsParams = arrearsWhereBuilder.getParams();
        const payload = await resolveCachedReport({
          namespace: "reports:board-summary",
          user: req.user,
          scope,
          keyPayload: {
            scopeFilter: mineOnly ? "mine" : "all",
            periodDays,
            branchLimit,
            branchId: branchFilter || null,
            officerIds: officerIdsFilter || null,
            dateFrom: normalizedDateFromIso,
            dateTo: normalizedDateToIso,
            arrearsSnapshotAt,
            minuteBucket: cacheMinuteBucket,
          },
          compute: async () => {
            const collectionsSummary = await get(
              `
                SELECT
                  COUNT(r.id) AS repayment_count,
                  COUNT(DISTINCT r.loan_id) AS loans_with_repayments,
                  COALESCE(SUM(r.amount), 0) AS total_collected
                FROM repayments r
                INNER JOIN loans l ON l.id = r.loan_id
                ${collectionWhereSql}
              `,
              collectionParams,
            );

            const dueSummary = await get(
              `
                SELECT
                  COALESCE(SUM(i.amount_due), 0) AS total_due,
                  COALESCE(SUM(i.amount_paid), 0) AS total_paid_against_due
                FROM loan_installments i
                INNER JOIN loans l ON l.id = i.loan_id
                ${dueWhereSql}
              `,
              dueParams,
            );

            const arrearsSummary = await get(
              `
                WITH loan_arrears AS (
                  SELECT
                    l.id AS loan_id,
                    l.branch_id,
                    l.balance AS outstanding_balance,
                    COALESCE(SUM(i.amount_due - i.amount_paid), 0) AS arrears_amount,
                    CAST(julianday(?) - julianday(MIN(i.due_date)) AS INTEGER) AS days_overdue
                  FROM loans l
                  INNER JOIN loan_installments i ON i.loan_id = l.id
                  ${arrearsWhereSql}
                    AND i.status != 'paid'
                    AND datetime(i.due_date) < datetime(?)
                  GROUP BY l.id, l.branch_id, l.balance
                )
                SELECT
                  COUNT(*) AS loans_in_arrears,
                  COALESCE(SUM(arrears_amount), 0) AS total_arrears_amount,
                  COALESCE(SUM(outstanding_balance), 0) AS at_risk_balance,
                  COALESCE(SUM(CASE WHEN days_overdue >= 30 THEN outstanding_balance ELSE 0 END), 0) AS par30_balance,
                  COALESCE(SUM(CASE WHEN days_overdue >= 90 THEN outstanding_balance ELSE 0 END), 0) AS par90_balance
                FROM loan_arrears
              `,
              [arrearsSnapshotAt, ...arrearsParams, arrearsSnapshotAt],
            );

            const topRiskBranches = await all(
              `
                WITH loan_arrears AS (
                  SELECT
                    l.id AS loan_id,
                    l.branch_id,
                    l.balance AS outstanding_balance,
                    COALESCE(SUM(i.amount_due - i.amount_paid), 0) AS arrears_amount,
                    CAST(julianday(?) - julianday(MIN(i.due_date)) AS INTEGER) AS days_overdue
                  FROM loans l
                  INNER JOIN loan_installments i ON i.loan_id = l.id
                  ${arrearsWhereSql}
                    AND i.status != 'paid'
                    AND datetime(i.due_date) < datetime(?)
                  GROUP BY l.id, l.branch_id, l.balance
                )
                SELECT
                  b.id AS branch_id,
                  b.name AS branch_name,
                  r.name AS region_name,
                  COUNT(*) AS loans_in_arrears,
                  COALESCE(SUM(la.arrears_amount), 0) AS total_arrears_amount,
                  COALESCE(SUM(la.outstanding_balance), 0) AS at_risk_balance,
                  COALESCE(SUM(CASE WHEN la.days_overdue >= 30 THEN la.outstanding_balance ELSE 0 END), 0) AS par30_balance
                FROM loan_arrears la
                INNER JOIN branches b ON b.id = la.branch_id
                INNER JOIN regions r ON r.id = b.region_id
                GROUP BY b.id
                ORDER BY par30_balance DESC, at_risk_balance DESC, b.name ASC
                LIMIT ${branchLimit}
              `,
              [arrearsSnapshotAt, ...arrearsParams, arrearsSnapshotAt],
            );

            const dailyCollections = await all(
              `
                SELECT
                  date(datetime(r.paid_at)) AS date,
                  COUNT(r.id) AS repayment_count,
                  COALESCE(SUM(r.amount), 0) AS total_collected
                FROM repayments r
                INNER JOIN loans l ON l.id = r.loan_id
                ${collectionWhereSql}
                GROUP BY date(datetime(r.paid_at))
                ORDER BY date(datetime(r.paid_at)) ASC
              `,
              collectionParams,
            );

            const totalOutstanding = Number(portfolio?.outstanding_balance || 0);
            const totalCollectedInPeriod = Number(collectionsSummary?.total_collected || 0);
            const totalDueInPeriod = Number(dueSummary?.total_due || 0);
            const par30Balance = Number(arrearsSummary?.par30_balance || 0);
            const par90Balance = Number(arrearsSummary?.par90_balance || 0);

            const collectionRate = totalDueInPeriod > 0
              ? Number((totalCollectedInPeriod / totalDueInPeriod).toFixed(4))
              : 0;
            const par30Ratio = totalOutstanding > 0
              ? Number((par30Balance / totalOutstanding).toFixed(4))
              : 0;
            const par90Ratio = totalOutstanding > 0
              ? Number((par90Balance / totalOutstanding).toFixed(4))
              : 0;

            return {
              generatedAt: new Date().toISOString(),
              scopeFilter: mineOnly ? "mine" : "all",
              period: {
                dateFrom: normalizedDateFromIso,
                dateTo: normalizedDateToIso,
                days: periodDays,
              },
              portfolio: {
                total_loans: Number(portfolio?.total_loans || 0),
                active_loans: Number(portfolio?.active_loans || 0),
                principal_disbursed: Number(portfolio?.principal_disbursed || 0),
                repaid_total: Number(portfolio?.repaid_total || 0),
                outstanding_balance: totalOutstanding,
                overdue_loans: Number(portfolio?.overdue_loans || 0),
                overdue_amount: Number(portfolio?.overdue_amount || 0),
                par_ratio: Number(portfolio?.parRatio || 0),
              },
              risk: {
                loans_in_arrears: Number(arrearsSummary?.loans_in_arrears || 0),
                total_arrears_amount: Number(arrearsSummary?.total_arrears_amount || 0),
                at_risk_balance: Number(arrearsSummary?.at_risk_balance || 0),
                par30_balance: par30Balance,
                par90_balance: par90Balance,
                par30_ratio: par30Ratio,
                par90_ratio: par90Ratio,
              },
              collections: {
                repayment_count: Number(collectionsSummary?.repayment_count || 0),
                loans_with_repayments: Number(collectionsSummary?.loans_with_repayments || 0),
                total_collected: totalCollectedInPeriod,
                total_due: totalDueInPeriod,
                total_paid_against_due: Number(dueSummary?.total_paid_against_due || 0),
                collection_rate: collectionRate,
              },
              sustainability: {
                collection_coverage_ratio: collectionRate,
                liquidity_from_collections_ratio: totalOutstanding > 0
                  ? Number((totalCollectedInPeriod / totalOutstanding).toFixed(4))
                  : 0,
                risk_adjusted_collection_ratio: (1 + par30Ratio) > 0
                  ? Number((collectionRate / (1 + par30Ratio)).toFixed(4))
                  : 0,
              },
              trends: {
                daily_collections: dailyCollections.map((row: Record<string, any>) => ({
                  date: row.date,
                  repayment_count: Number(row.repayment_count || 0),
                  total_collected: Number(row.total_collected || 0),
                })),
                top_risk_branches: topRiskBranches.map((row: Record<string, any>) => ({
                  branch_id: Number(row.branch_id),
                  branch_name: row.branch_name,
                  region_name: row.region_name,
                  loans_in_arrears: Number(row.loans_in_arrears || 0),
                  total_arrears_amount: Number(row.total_arrears_amount || 0),
                  at_risk_balance: Number(row.at_risk_balance || 0),
                  par30_balance: Number(row.par30_balance || 0),
                })),
              },
            };
          },
        });

        if (requestedFormat !== "json") {
          const exportRow = {
            generated_at: payload.generatedAt,
            scope_filter: payload.scopeFilter,
            period_days: payload.period.days,
            total_loans: payload.portfolio.total_loans,
            active_loans: payload.portfolio.active_loans,
            outstanding_balance: payload.portfolio.outstanding_balance,
            par30_ratio: payload.risk.par30_ratio,
            par90_ratio: payload.risk.par90_ratio,
            collection_rate: payload.collections.collection_rate,
            risk_adjusted_collection_ratio: payload.sustainability.risk_adjusted_collection_ratio,
            top_risk_branch: payload.trends.top_risk_branches[0]?.branch_name || null,
            top_risk_branch_par30_balance: payload.trends.top_risk_branches[0]?.par30_balance || 0,
          };
          sendTabularExport(res, {
            format: requestedFormat,
            filenameBase: "board-summary-report",
            title: "Board Summary Report",
            headers: Object.keys(exportRow),
            rows: [exportRow],
          });
          return;
        }

        res.status(200).json(payload);
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/reports/disbursements",
    authenticate,
    authorize(...reportRoles),
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
          return res.status(400).json({ message: "dateFrom must be before or equal to dateTo." });
        }
        const arrearsSnapshotAt = resolveArrearsSnapshotIso(dateTo);

        const branchFilter = parseId(req.query.branchId);
        const officerIdsFilter = resolveOfficerFilter(req.query.officerIds, req.query.officerId, res);
        if (officerIdsFilter === undefined) {
          return;
        }
        const cacheKeyPayload = {
          dateFrom: dateFrom || null,
          dateTo: dateTo || null,
          arrearsSnapshotAt,
          branchId: branchFilter || null,
          officerIds: officerIdsFilter || null,
        };
        const payload = await reportQueryService.getDisbursementsReport({
          user: req.user,
          scope,
          dateFrom,
          dateTo,
          branchFilter,
          officerIdFilter: officerIdsFilter,
        });

        const disbursementWhereBuilder = createSqlWhereBuilder();
        disbursementWhereBuilder.addClause("l.disbursed_at IS NOT NULL");
        disbursementWhereBuilder.addDateRange("l.disbursed_at", dateFrom, dateTo);
        applyOfficerFilter(disbursementWhereBuilder, "l.officer_id", officerIdsFilter);
        if (!applyScopeAndBranchFilter({
          whereBuilder: disbursementWhereBuilder,
          scope,
          branchColumnRef: "l.branch_id",
          branchFilter,
          res,
        })) {
          return;
        }
        const disbursementWhereSql = disbursementWhereBuilder.buildWhere();
        const disbursementQueryParams = disbursementWhereBuilder.getParams();

        const details = await resolveCachedReport({
          namespace: "reports:disbursements:details",
          user: req.user,
          scope,
          keyPayload: cacheKeyPayload,
          compute: async () => all(
            `
              SELECT
                l.id AS loanid,
                c.full_name AS fullnames,
                c.phone AS phonenumber,
                c.phone AS accountno,
                l.principal AS amountdisbursed,
                l.external_reference AS mpesaref,
                ROUND(l.expected_total - l.principal, 2) AS interest,
                l.balance AS olb,
                ROUND(l.expected_total - l.repaid_total, 2) AS amountdue,
                l.repaid_total AS amountpaid,
                l.expected_total AS loanamount,
                l.balance AS loanbalance,
                l.disbursed_at AS borrowdate,
                CASE
                  WHEN EXISTS (
                    SELECT 1
                    FROM loans l_prev
                    WHERE l_prev.client_id = l.client_id
                      AND l_prev.disbursed_at IS NOT NULL
                      AND (
                        datetime(l_prev.disbursed_at) < datetime(l.disbursed_at)
                        OR (
                          datetime(l_prev.disbursed_at) = datetime(l.disbursed_at)
                          AND l_prev.id < l.id
                        )
                      )
                  ) THEN 'Repeat'
                  ELSE 'New'
                END AS loantype,
                b.name AS branch,
                COALESCE(lp.name, 'Unknown Product') AS productname,
                COALESCE(u.full_name, 'Unassigned') AS fieldofficer,
                (
                  SELECT MAX(i2.due_date)
                  FROM loan_installments i2
                  WHERE i2.loan_id = l.id
                ) AS cleardate,
                (
                  SELECT COUNT(*)
                  FROM loan_installments i3
                  WHERE i3.loan_id = l.id
                ) AS installmentcount
              FROM loans l
              INNER JOIN clients c ON c.id = l.client_id
              LEFT JOIN branches b ON b.id = l.branch_id
              LEFT JOIN loan_products lp ON lp.id = l.product_id
              LEFT JOIN users u ON u.id = COALESCE(l.officer_id, l.created_by_user_id)
              ${disbursementWhereSql}
              ORDER BY COALESCE(c.phone, '') DESC, l.id DESC
            `,
            disbursementQueryParams,
          ),
        });
        const reportTemplate = getLegacyReportTemplate("disbursements");
        const reportRows = mapLegacyDisbursementRows(details);

        if (format !== "json") {
          sendTabularExport(res, {
            format,
            filenameBase: reportTemplate.filenameBase,
            title: reportTemplate.title,
            headers: reportTemplate.headers,
            rows: reportRows,
            csvQuoteAllFields: true,
          });
          return;
        }

        return res.status(200).json({
          ...payload,
          reportRows,
          details,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/reports/arrears",
    authenticate,
    authorize(...reportRoles),
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
          return res.status(400).json({ message: "dateFrom must be before or equal to dateTo." });
        }
        const arrearsSnapshotAt = dateTo || new Date().toISOString();

        const branchFilter = parseId(req.query.branchId);
        const officerIdsFilter = resolveOfficerFilter(req.query.officerIds, req.query.officerId, res);
        if (officerIdsFilter === undefined) {
          return;
        }
        const cacheKeyPayload = {
          dateFrom: dateFrom || null,
          dateTo: dateTo || null,
          arrearsSnapshotAt,
          branchId: branchFilter || null,
          officerIds: officerIdsFilter || null,
        };
        const whereBuilder = createSqlWhereBuilder();
        whereBuilder.addClause("l.status IN ('active', 'restructured')");
        applyOfficerFilter(whereBuilder, "l.officer_id", officerIdsFilter);
        if (!applyScopeAndBranchFilter({
          whereBuilder,
          scope,
          branchColumnRef: "l.branch_id",
          branchFilter,
          res,
        })) {
          return;
        }
        const whereSql = whereBuilder.buildWhere();
        const queryParams = whereBuilder.getParams();

        const arrearsCte = `
          WITH loan_arrears AS (
            SELECT
              l.id                                                               AS loan_id,
              l.branch_id,
              l.balance                                                          AS outstanding_balance,
              COALESCE(SUM(i.amount_due - i.amount_paid), 0)                    AS arrears_amount,
              CAST(julianday(?) - julianday(MIN(i.due_date)) AS INTEGER)         AS days_overdue
            FROM loans l
            INNER JOIN loan_installments i ON i.loan_id = l.id
            ${whereSql}
              AND i.status != 'paid'
              AND datetime(i.due_date) < datetime(?)
            GROUP BY l.id, l.branch_id, l.balance
          )
        `;

        const summary = await resolveCachedReport({
          namespace: "reports:arrears:summary",
          user: req.user,
          scope,
          keyPayload: cacheKeyPayload,
          compute: async () => get(
            `
              ${arrearsCte}
              SELECT
                (SELECT COUNT(*) FROM loans l ${whereSql}) AS total_active_loans,
                COUNT(*)                                    AS loans_in_arrears,
                COALESCE(SUM(arrears_amount), 0)            AS total_arrears_amount,
                COALESCE(SUM(outstanding_balance), 0)       AS at_risk_balance,

                SUM(CASE WHEN days_overdue BETWEEN 1 AND 29  THEN 1 ELSE 0 END) AS par1_count,
                SUM(CASE WHEN days_overdue BETWEEN 30 AND 59 THEN 1 ELSE 0 END) AS par30_count,
                SUM(CASE WHEN days_overdue BETWEEN 60 AND 89 THEN 1 ELSE 0 END) AS par60_count,
                SUM(CASE WHEN days_overdue >= 90             THEN 1 ELSE 0 END) AS par90_count,

                COALESCE(SUM(CASE WHEN days_overdue BETWEEN 1 AND 29  THEN outstanding_balance ELSE 0 END), 0) AS par1_balance,
                COALESCE(SUM(CASE WHEN days_overdue BETWEEN 30 AND 59 THEN outstanding_balance ELSE 0 END), 0) AS par30_balance,
                COALESCE(SUM(CASE WHEN days_overdue BETWEEN 60 AND 89 THEN outstanding_balance ELSE 0 END), 0) AS par60_balance,
                COALESCE(SUM(CASE WHEN days_overdue >= 90             THEN outstanding_balance ELSE 0 END), 0) AS par90_balance,

                COALESCE(SUM(CASE WHEN days_overdue BETWEEN 1 AND 29  THEN arrears_amount ELSE 0 END), 0) AS par1_arrears,
                COALESCE(SUM(CASE WHEN days_overdue BETWEEN 30 AND 59 THEN arrears_amount ELSE 0 END), 0) AS par30_arrears,
                COALESCE(SUM(CASE WHEN days_overdue BETWEEN 60 AND 89 THEN arrears_amount ELSE 0 END), 0) AS par60_arrears,
                COALESCE(SUM(CASE WHEN days_overdue >= 90             THEN arrears_amount ELSE 0 END), 0) AS par90_arrears
              FROM loan_arrears
            `,
            [arrearsSnapshotAt, ...queryParams, arrearsSnapshotAt, ...queryParams],
          ),
        });

        const branchBreakdown = await resolveCachedReport({
          namespace: "reports:arrears:branch-breakdown",
          user: req.user,
          scope,
          keyPayload: cacheKeyPayload,
          compute: async () => all(
            `
              ${arrearsCte}
              SELECT
                b.id   AS branch_id,
                b.name AS branch_name,
                r.name AS region_name,
                COUNT(*)                             AS loans_in_arrears,
                COALESCE(SUM(la.arrears_amount), 0)  AS total_arrears_amount,
                COALESCE(SUM(la.outstanding_balance), 0) AS at_risk_balance,
                SUM(CASE WHEN days_overdue BETWEEN 1 AND 29  THEN 1 ELSE 0 END) AS par1_count,
                SUM(CASE WHEN days_overdue BETWEEN 30 AND 59 THEN 1 ELSE 0 END) AS par30_count,
                SUM(CASE WHEN days_overdue BETWEEN 60 AND 89 THEN 1 ELSE 0 END) AS par60_count,
                SUM(CASE WHEN days_overdue >= 90             THEN 1 ELSE 0 END) AS par90_count,
                COALESCE(SUM(CASE WHEN days_overdue BETWEEN 1 AND 29  THEN la.outstanding_balance ELSE 0 END), 0) AS par1_balance,
                COALESCE(SUM(CASE WHEN days_overdue BETWEEN 30 AND 59 THEN la.outstanding_balance ELSE 0 END), 0) AS par30_balance,
                COALESCE(SUM(CASE WHEN days_overdue BETWEEN 60 AND 89 THEN la.outstanding_balance ELSE 0 END), 0) AS par60_balance,
                COALESCE(SUM(CASE WHEN days_overdue >= 90             THEN la.outstanding_balance ELSE 0 END), 0) AS par90_balance,
                COALESCE(SUM(CASE WHEN days_overdue BETWEEN 1 AND 29  THEN la.arrears_amount ELSE 0 END), 0) AS par1_arrears,
                COALESCE(SUM(CASE WHEN days_overdue BETWEEN 30 AND 59 THEN la.arrears_amount ELSE 0 END), 0) AS par30_arrears,
                COALESCE(SUM(CASE WHEN days_overdue BETWEEN 60 AND 89 THEN la.arrears_amount ELSE 0 END), 0) AS par60_arrears,
                COALESCE(SUM(CASE WHEN days_overdue >= 90             THEN la.arrears_amount ELSE 0 END), 0) AS par90_arrears
              FROM loan_arrears la
              INNER JOIN branches b ON b.id = la.branch_id
              INNER JOIN regions  r ON r.id = b.region_id
              GROUP BY b.id
              ORDER BY r.name ASC, b.name ASC
            `,
            [arrearsSnapshotAt, ...queryParams, arrearsSnapshotAt],
          ),
        });

        const arrearsDetails = await resolveCachedReport({
          namespace: "reports:arrears:details",
          user: req.user,
          scope,
          keyPayload: cacheKeyPayload,
          compute: async () => all(
            `
              ${arrearsCte}
              SELECT
                la.loan_id,
                l.client_id AS borrowerid,
                c.full_name AS fullnames,
                c.phone AS phonenumber,
                l.expected_total AS loanamount,
                l.principal AS amountdisbursed,
                ROUND(l.expected_total - l.principal, 2) AS interest,
                la.arrears_amount,
                la.days_overdue AS daysinarrears,
                la.outstanding_balance AS loanbalance,
                COALESCE(lp.name, 'Unknown Product') AS productname,
                CASE
                  WHEN datetime((
                    SELECT MAX(i2.due_date)
                    FROM loan_installments i2
                    WHERE i2.loan_id = l.id
                  )) < datetime(?) THEN 'Matured'
                  ELSE 'Not Matured'
                END AS maturity,
                b.name AS branch,
                (
                  SELECT MAX(i2.due_date)
                  FROM loan_installments i2
                  WHERE i2.loan_id = l.id
                ) AS expectedcleardate,
                l.disbursed_at AS borrowdate,
                c.business_location AS businesslocation,
                COALESCE(u.full_name, 'Unassigned') AS salesrep,
                COALESCE((
                  SELECT GROUP_CONCAT(g.full_name, '; ')
                  FROM loan_guarantors lg
                  INNER JOIN guarantors g ON g.id = lg.guarantor_id
                  WHERE lg.loan_id = l.id
                ), '') AS guarantornames,
                COALESCE((
                  SELECT GROUP_CONCAT(g.phone, '; ')
                  FROM loan_guarantors lg
                  INNER JOIN guarantors g ON g.id = lg.guarantor_id
                  WHERE lg.loan_id = l.id
                ), '') AS guarantorphone,
                (CAST(julianday(?) - julianday(l.disbursed_at) AS INTEGER) - 215) AS daystonpl
              FROM loan_arrears la
              INNER JOIN loans l ON l.id = la.loan_id
              INNER JOIN clients c ON c.id = l.client_id
              LEFT JOIN loan_products lp ON lp.id = l.product_id
              LEFT JOIN branches b ON b.id = l.branch_id
              LEFT JOIN users u ON u.id = COALESCE(l.officer_id, l.created_by_user_id)
              GROUP BY
                la.loan_id,
                l.client_id,
                c.full_name,
                c.phone,
                l.expected_total,
                l.principal,
                l.registration_fee,
                l.processing_fee,
                la.arrears_amount,
                la.days_overdue,
                la.outstanding_balance,
                lp.name,
                b.name,
                l.disbursed_at,
                c.business_location,
                u.full_name
              ORDER BY borrowerid DESC, la.loan_id DESC
            `,
            [arrearsSnapshotAt, ...queryParams, arrearsSnapshotAt, arrearsSnapshotAt, arrearsSnapshotAt],
          ),
        });
        const reportTemplate = getLegacyReportTemplate("arrears");
        const reportRows = mapLegacyArrearsRows(arrearsDetails);

        if (format !== "json") {
          sendTabularExport(res, {
            format,
            filenameBase: reportTemplate.filenameBase,
            title: reportTemplate.title,
            headers: reportTemplate.headers,
            rows: reportRows,
            csvQuoteAllFields: true,
          });
          return;
        }

        return res.status(200).json({
          period: { dateFrom: dateFrom || null, dateTo: dateTo || null },
          summary,
          reportRows,
          branchBreakdown,
          arrearsDetails,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/reports/dues",
    authenticate,
    authorize(...reportRoles),
    async (req, res, next) => {
      try {
        const scope = await hierarchyService.resolveHierarchyScope(req.user);
        const format = resolveFormat(req.query.format, res);
        if (!format) return;

        const defaultDateFrom = startOfTodayIso();
        const defaultDateTo = endOfDayAfterDaysIso(30);

        const rawDateFrom = req.query.dateFrom;
        const rawDateTo = req.query.dateTo;
        const dateFrom = rawDateFrom ? parseDateParam(rawDateFrom, "dateFrom", res) : defaultDateFrom;
        if (dateFrom === undefined) return;
        const dateTo = rawDateTo ? parseDateParam(rawDateTo, "dateTo", res) : defaultDateTo;
        if (dateTo === undefined) return;
        if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
          return res.status(400).json({ message: "dateFrom must be before or equal to dateTo." });
        }
        const arrearsSnapshotAt = resolveArrearsSnapshotIso(dateTo);

        const branchFilter = parseId(req.query.branchId);
        const officerIdsFilter = resolveOfficerFilter(req.query.officerIds, req.query.officerId, res);
        if (officerIdsFilter === undefined) {
          return;
        }
        const upcomingFilterBuilder = createSqlWhereBuilder();
        upcomingFilterBuilder.addClause("i.status != 'paid'");
        upcomingFilterBuilder.addClause("l.status IN ('active', 'restructured')");
        upcomingFilterBuilder.addClause("datetime(i.due_date) BETWEEN datetime(?) AND datetime(?)", [dateFrom, dateTo]);
        applyOfficerFilter(upcomingFilterBuilder, "l.officer_id", officerIdsFilter);
        if (!applyScopeAndBranchFilter({
          whereBuilder: upcomingFilterBuilder,
          scope,
          branchColumnRef: "l.branch_id",
          branchFilter,
          res,
        })) {
          return;
        }
        const upcomingWhereSql = upcomingFilterBuilder.buildWhere();
        const upcomingParams = upcomingFilterBuilder.getParams();

        const overdueFilterBuilder = createSqlWhereBuilder();
        overdueFilterBuilder.addClause("i.status != 'paid'");
        overdueFilterBuilder.addClause("l.status IN ('active', 'restructured')");
        overdueFilterBuilder.addClause("datetime(i.due_date) < datetime(?)", [dateFrom]);
        overdueFilterBuilder.addClause("datetime(i.due_date) < datetime(?)", [arrearsSnapshotAt]);
        applyOfficerFilter(overdueFilterBuilder, "l.officer_id", officerIdsFilter);
        if (!applyScopeAndBranchFilter({
          whereBuilder: overdueFilterBuilder,
          scope,
          branchColumnRef: "l.branch_id",
          branchFilter,
          res,
        })) {
          return;
        }
        const overdueWhereSql = overdueFilterBuilder.buildWhere();
        const overdueParams = overdueFilterBuilder.getParams();
        const detailFilterBuilder = createSqlWhereBuilder();
        detailFilterBuilder.addClause("i.status != 'paid'");
        detailFilterBuilder.addClause("l.status IN ('active', 'restructured')");
        detailFilterBuilder.addClause("datetime(i.due_date) BETWEEN datetime(?) AND datetime(?)", [dateFrom, dateTo]);
        applyOfficerFilter(detailFilterBuilder, "l.officer_id", officerIdsFilter);
        if (!applyScopeAndBranchFilter({
          whereBuilder: detailFilterBuilder,
          scope,
          branchColumnRef: "l.branch_id",
          branchFilter,
          res,
        })) {
          return;
        }
        const detailWhereSql = detailFilterBuilder.buildWhere();
        const detailParams = detailFilterBuilder.getParams();
        const cacheKeyPayload = {
          dateFrom,
          dateTo,
          arrearsSnapshotAt,
          branchId: branchFilter || null,
          officerIds: officerIdsFilter || null,
        };

        const upcomingDues = await resolveCachedReport({
          namespace: "reports:dues:upcoming",
          user: req.user,
          scope,
          keyPayload: cacheKeyPayload,
          compute: async () => get(
            `
              SELECT
                COUNT(i.id)                       AS installment_count,
                COUNT(DISTINCT l.id)              AS loan_count,
                COALESCE(SUM(i.amount_due - i.amount_paid), 0) AS expected_amount,
                SUM(CASE WHEN i.status = 'overdue' THEN 1 ELSE 0 END) AS overdue_count,
                SUM(CASE WHEN i.status = 'overdue' THEN i.amount_due - i.amount_paid ELSE 0 END) AS overdue_amount,
                SUM(CASE WHEN i.status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
                SUM(CASE WHEN i.status = 'pending' THEN i.amount_due - i.amount_paid ELSE 0 END) AS pending_amount
              FROM loan_installments i
              INNER JOIN loans l ON l.id = i.loan_id
              ${upcomingWhereSql}
            `,
            upcomingParams,
          ),
        });

        const alreadyOverdue = await resolveCachedReport({
          namespace: "reports:dues:already-overdue",
          user: req.user,
          scope,
          keyPayload: cacheKeyPayload,
          compute: async () => get(
            `
              SELECT
                COUNT(i.id)                       AS installment_count,
                COUNT(DISTINCT l.id)              AS loan_count,
                COALESCE(SUM(i.amount_due - i.amount_paid), 0) AS overdue_amount
              FROM loan_installments i
              INNER JOIN loans l ON l.id = i.loan_id
              ${overdueWhereSql}
            `,
            overdueParams,
          ),
        });

        const branchBreakdown = await resolveCachedReport({
          namespace: "reports:dues:branch-breakdown",
          user: req.user,
          scope,
          keyPayload: cacheKeyPayload,
          compute: async () => all(
            `
              SELECT
                b.id   AS branch_id,
                b.name AS branch_name,
                r.name AS region_name,
                COUNT(i.id)                                AS installment_count,
                COALESCE(SUM(i.amount_due - i.amount_paid), 0) AS expected_amount,
                SUM(CASE WHEN i.status = 'overdue' THEN i.amount_due - i.amount_paid ELSE 0 END) AS overdue_amount,
                SUM(CASE WHEN i.status = 'pending' THEN i.amount_due - i.amount_paid ELSE 0 END) AS pending_amount
              FROM loan_installments i
              INNER JOIN loans l ON l.id = i.loan_id
              INNER JOIN branches b ON b.id = l.branch_id
              INNER JOIN regions  r ON r.id = b.region_id
              ${upcomingWhereSql}
              GROUP BY b.id
              ORDER BY r.name ASC, b.name ASC
            `,
            upcomingParams,
          ),
        });

        const dueItems = await resolveCachedReport({
          namespace: "reports:dues:details",
          user: req.user,
          scope,
          keyPayload: cacheKeyPayload,
          compute: async () => all(
            `
              SELECT
                l.id AS loanid,
                c.full_name AS fullnames,
                c.phone AS phonenumber,
                i.installment_number AS installmentno,
                l.principal AS amountdisbursed,
                ROUND(i.amount_due - i.amount_paid, 2) AS amountdue,
                COALESCE(ar.arrears_amount, 0) AS arrears,
                i.amount_paid AS amountpaid,
                l.expected_total AS loanamount,
                l.balance AS loanbalance,
                COALESCE(lp.name, 'Unknown Product') AS productname,
                b.name AS unittitle,
                COALESCE(u.full_name, 'Unassigned') AS fieldofficer,
                i.due_date AS duedate
              FROM loan_installments i
              INNER JOIN loans l ON l.id = i.loan_id
              INNER JOIN clients c ON c.id = l.client_id
              LEFT JOIN loan_products lp ON lp.id = l.product_id
              LEFT JOIN branches b ON b.id = l.branch_id
              LEFT JOIN users u ON u.id = COALESCE(l.officer_id, l.created_by_user_id)
              LEFT JOIN (
                SELECT
                  i2.loan_id,
                  COALESCE(SUM(i2.amount_due - i2.amount_paid), 0) AS arrears_amount
                FROM loan_installments i2
                WHERE i2.status != 'paid'
                  AND datetime(i2.due_date) < datetime(?)
                GROUP BY i2.loan_id
              ) ar ON ar.loan_id = l.id
              ${detailWhereSql}
              ORDER BY c.full_name COLLATE NOCASE DESC, l.id DESC, i.installment_number ASC
            `,
            [arrearsSnapshotAt, ...detailParams],
          ),
        });
        const reportTemplate = getLegacyReportTemplate("dues");
        const reportRows = mapLegacyDuesRows(dueItems);

        if (format !== "json") {
          sendTabularExport(res, {
            format,
            filenameBase: reportTemplate.filenameBase,
            title: reportTemplate.title,
            headers: reportTemplate.headers,
            rows: reportRows,
            csvQuoteAllFields: true,
          });
          return;
        }

        return res.status(200).json({
          period: { dateFrom, dateTo },
          duesInPeriod: upcomingDues,
          alreadyOverdueBeforePeriod: alreadyOverdue,
          reportRows,
          branchBreakdown,
          dueItems,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/reports/clients",
    authenticate,
    authorize(...reportRoles),
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
          return res.status(400).json({ message: "dateFrom must be before or equal to dateTo." });
        }
        const arrearsSnapshotAt = resolveArrearsSnapshotIso(dateTo);

        const branchFilter = parseId(req.query.branchId);
        const officerIdsFilter = resolveOfficerFilter(req.query.officerIds, req.query.officerId, res);
        if (officerIdsFilter === undefined) {
          return;
        }
        const cacheKeyPayload = {
          dateFrom: dateFrom || null,
          dateTo: dateTo || null,
          arrearsSnapshotAt,
          branchId: branchFilter || null,
          officerIds: officerIdsFilter || null,
        };

        const newClientsBuilder = createSqlWhereBuilder();
        newClientsBuilder.addDateRange("c.created_at", dateFrom, dateTo);
        applyOfficerFilter(newClientsBuilder, "COALESCE(c.officer_id, c.created_by_user_id)", officerIdsFilter);
        if (!applyScopeAndBranchFilter({
          whereBuilder: newClientsBuilder,
          scope,
          branchColumnRef: "c.branch_id",
          branchFilter,
          res,
        })) {
          return;
        }
        const newClientsWhereSql = newClientsBuilder.buildWhere();
        const newClientsParams = newClientsBuilder.getParams();

        const activeClientsBuilder = createSqlWhereBuilder();
        activeClientsBuilder.addClause("c.is_active = 1");
        activeClientsBuilder.addClause("c.deleted_at IS NULL");
        applyOfficerFilter(activeClientsBuilder, "COALESCE(c.officer_id, c.created_by_user_id)", officerIdsFilter);
        if (!applyScopeAndBranchFilter({
          whereBuilder: activeClientsBuilder,
          scope,
          branchColumnRef: "c.branch_id",
          branchFilter,
          res,
        })) {
          return;
        }
        const activeClientsWhereSql = activeClientsBuilder.buildWhere();
        const activeClientsParams = activeClientsBuilder.getParams();

        const activeBorrowersBuilder = createSqlWhereBuilder();
        activeBorrowersBuilder.addClause("l.status IN ('active', 'restructured')");
        applyOfficerFilter(activeBorrowersBuilder, "COALESCE(c.officer_id, c.created_by_user_id)", officerIdsFilter);
        if (!applyScopeAndBranchFilter({
          whereBuilder: activeBorrowersBuilder,
          scope,
          branchColumnRef: "c.branch_id",
          branchFilter,
          res,
        })) {
          return;
        }
        const activeBorrowersWhereSql = activeBorrowersBuilder.buildWhere();
        const activeBorrowersParams = activeBorrowersBuilder.getParams();

        const firstTimeBuilder = createSqlWhereBuilder();
        firstTimeBuilder.addDateRange("f.first_disbursed_at", dateFrom, dateTo);
        applyOfficerFilter(firstTimeBuilder, "COALESCE(c.officer_id, c.created_by_user_id)", officerIdsFilter);
        if (!applyScopeAndBranchFilter({
          whereBuilder: firstTimeBuilder,
          scope,
          branchColumnRef: "c.branch_id",
          branchFilter,
          res,
        })) {
          return;
        }
        const firstTimeWhereSql = firstTimeBuilder.buildWhere();
        const firstTimeParams = firstTimeBuilder.getParams();

        const repeatBorrowersBuilder = createSqlWhereBuilder();
        applyOfficerFilter(repeatBorrowersBuilder, "COALESCE(c.officer_id, c.created_by_user_id)", officerIdsFilter);
        if (!applyScopeAndBranchFilter({
          whereBuilder: repeatBorrowersBuilder,
          scope,
          branchColumnRef: "c.branch_id",
          branchFilter,
          res,
        })) {
          return;
        }
        const repeatBorrowersWhereSql = repeatBorrowersBuilder.buildWhere();
        const repeatBorrowersParams = repeatBorrowersBuilder.getParams();

        const branchScopeBuilder = createSqlWhereBuilder();
        if (!applyScopeAndBranchFilter({
          whereBuilder: branchScopeBuilder,
          scope,
          branchColumnRef: "b.id",
          branchFilter,
          res,
        })) {
          return;
        }
        const branchScopeWhereSql = branchScopeBuilder.buildWhere();
        const branchScopeParams = branchScopeBuilder.getParams();

        /** @type {string[]} */
        const newClientDateClauses: string[] = [];
        /** @type {unknown[]} */
        const newClientDateParams: unknown[] = [];
        if (dateFrom) {
          newClientDateClauses.push("AND datetime(c.created_at) >= datetime(?)");
          newClientDateParams.push(dateFrom);
        }
        if (dateTo) {
          newClientDateClauses.push("AND datetime(c.created_at) <= datetime(?)");
          newClientDateParams.push(dateTo);
        }

        /** @type {string[]} */
        const firstLoanDateClauses: string[] = [];
        /** @type {unknown[]} */
        const firstLoanDateParams: unknown[] = [];
        if (dateFrom) {
          firstLoanDateClauses.push("AND datetime(f.first_disbursed_at) >= datetime(?)");
          firstLoanDateParams.push(dateFrom);
        }
        if (dateTo) {
          firstLoanDateClauses.push("AND datetime(f.first_disbursed_at) <= datetime(?)");
          firstLoanDateParams.push(dateTo);
        }
        const officerClientClause = buildIdListClause("COALESCE(c.officer_id, c.created_by_user_id)", officerIdsFilter);
        const officerClientSql = officerClientClause ? `AND ${officerClientClause.sql}` : "";
        const officerClientParams = officerClientClause?.params || [];

        const summary = await resolveCachedReport({
          namespace: "reports:clients:summary",
          user: req.user,
          scope,
          keyPayload: cacheKeyPayload,
          compute: async () => {
            const [newClients, activeClients, activeBorrowers, firstTimeBorrowers, repeatBorrowers] = await Promise.all([
              get(
                `
                  SELECT COUNT(*) AS new_clients_registered
                  FROM clients c
                  ${newClientsWhereSql}
                `,
                newClientsParams,
              ),
              get(
                `
                  SELECT COUNT(*) AS total_active_clients
                  FROM clients c
                  ${activeClientsWhereSql}
                `,
                activeClientsParams,
              ),
              get(
                `
                  SELECT COUNT(DISTINCT l.client_id) AS active_borrowers
                  FROM loans l
                  INNER JOIN clients c ON c.id = l.client_id
                  ${activeBorrowersWhereSql}
                `,
                activeBorrowersParams,
              ),
              get(
                `
                  WITH first_loan_per_client AS (
                    SELECT
                      l.client_id,
                      MIN(datetime(l.disbursed_at)) AS first_disbursed_at
                    FROM loans l
                    WHERE l.disbursed_at IS NOT NULL
                    GROUP BY l.client_id
                  )
                  SELECT COUNT(*) AS first_time_borrowers_in_period
                  FROM first_loan_per_client f
                  INNER JOIN clients c ON c.id = f.client_id
                  ${firstTimeWhereSql}
                `,
                firstTimeParams,
              ),
              get(
                `
                  SELECT COUNT(*) AS total_repeat_borrowers
                  FROM (
                    SELECT l.client_id
                    FROM loans l
                    WHERE l.disbursed_at IS NOT NULL
                    GROUP BY l.client_id
                    HAVING COUNT(l.id) >= 2
                  ) rb
                  INNER JOIN clients c ON c.id = rb.client_id
                  ${repeatBorrowersWhereSql}
                `,
                repeatBorrowersParams,
              ),
            ]);

            return {
              new_clients_registered: Number(newClients?.new_clients_registered || 0),
              total_active_clients: Number(activeClients?.total_active_clients || 0),
              active_borrowers: Number(activeBorrowers?.active_borrowers || 0),
              first_time_borrowers_in_period: Number(firstTimeBorrowers?.first_time_borrowers_in_period || 0),
              total_repeat_borrowers: Number(repeatBorrowers?.total_repeat_borrowers || 0),
            };
          },
        });

        const branchBreakdown = await resolveCachedReport({
          namespace: "reports:clients:branch-breakdown",
          user: req.user,
          scope,
          keyPayload: cacheKeyPayload,
          compute: async () => all(
            `
              WITH first_loan_per_client AS (
                SELECT
                  l.client_id,
                  MIN(datetime(l.disbursed_at)) AS first_disbursed_at
                FROM loans l
                WHERE l.disbursed_at IS NOT NULL
                GROUP BY l.client_id
              ),
              repeat_borrowers AS (
                SELECT l.client_id
                FROM loans l
                WHERE l.disbursed_at IS NOT NULL
                GROUP BY l.client_id
                HAVING COUNT(l.id) >= 2
              )
              SELECT
                b.id AS branch_id,
                b.name AS branch_name,
                r.name AS region_name,
                (
                  SELECT COUNT(*)
                  FROM clients c
                  WHERE c.branch_id = b.id
                    ${newClientDateClauses.join("\n                    ")}
                    ${officerClientSql}
                ) AS new_clients_registered,
                (
                  SELECT COUNT(*)
                  FROM clients c
                  WHERE c.branch_id = b.id
                    AND c.is_active = 1
                    AND c.deleted_at IS NULL
                    ${officerClientSql}
                ) AS total_active_clients,
                (
                  SELECT COUNT(DISTINCT l.client_id)
                  FROM loans l
                  INNER JOIN clients c ON c.id = l.client_id
                  WHERE c.branch_id = b.id
                    AND l.status IN ('active', 'restructured')
                    ${officerClientSql}
                ) AS active_borrowers,
                (
                  SELECT COUNT(*)
                  FROM first_loan_per_client f
                  INNER JOIN clients c ON c.id = f.client_id
                  WHERE c.branch_id = b.id
                    ${firstLoanDateClauses.join("\n                    ")}
                    ${officerClientSql}
                ) AS first_time_borrowers_in_period,
                (
                  SELECT COUNT(*)
                  FROM repeat_borrowers rb
                  INNER JOIN clients c ON c.id = rb.client_id
                  WHERE c.branch_id = b.id
                    ${officerClientSql}
                ) AS total_repeat_borrowers
              FROM branches b
              INNER JOIN regions r ON r.id = b.region_id
              ${branchScopeWhereSql}
              ORDER BY r.name ASC, b.name ASC
            `,
            [
              ...newClientDateParams,
              ...officerClientParams,
              ...officerClientParams,
              ...officerClientParams,
              ...firstLoanDateParams,
              ...officerClientParams,
              ...officerClientParams,
              ...branchScopeParams,
            ],
          ),
        });

        const customerListBuilder = createSqlWhereBuilder();
        customerListBuilder.addDateRange("c.created_at", dateFrom, dateTo);
        applyOfficerFilter(customerListBuilder, "COALESCE(c.officer_id, c.created_by_user_id)", officerIdsFilter);
        if (!applyScopeAndBranchFilter({
          whereBuilder: customerListBuilder,
          scope,
          branchColumnRef: "c.branch_id",
          branchFilter,
          res,
        })) {
          return;
        }
        const customerListWhereSql = customerListBuilder.buildWhere();
        const customerListParams = customerListBuilder.getParams();

        const customers = await resolveCachedReport({
          namespace: "reports:clients:list",
          user: req.user,
          scope,
          keyPayload: cacheKeyPayload,
          compute: async () => all(
            `
              SELECT
                c.id AS customer_id,
                c.full_name AS name,
                COALESCE(NULLIF(TRIM(c.national_id), ''), c.phone, CAST(c.id AS TEXT)) AS account_number,
                '-' AS gender,
                COALESCE(u.full_name, 'Unassigned') AS agent,
                CASE WHEN c.is_active = 1 THEN 'ACTIVE' ELSE 'INACTIVE' END AS status,
                c.phone AS phone_number,
                b.name AS branch,
                c.created_at
              FROM clients c
              LEFT JOIN users u ON u.id = COALESCE(c.officer_id, c.created_by_user_id)
              LEFT JOIN branches b ON b.id = c.branch_id
              ${customerListWhereSql}
              ORDER BY datetime(c.created_at) DESC, c.id DESC
            `,
            customerListParams,
          ),
        });

        if (format !== "json") {
          const cols = customers.length > 0
            ? [
              "customer_id",
              "name",
              "account_number",
              "gender",
              "agent",
              "status",
              "phone_number",
              "branch",
              "created_at",
            ]
            : [
              "branch_id",
              "branch_name",
              "region_name",
              "new_clients_registered",
              "total_active_clients",
              "active_borrowers",
              "first_time_borrowers_in_period",
              "total_repeat_borrowers",
            ];
          sendTabularExport(res, {
            format,
            filenameBase: "clients-report",
            title: "Clients Report",
            headers: cols,
            rows: customers.length > 0 ? customers : branchBreakdown,
          });
          return;
        }

        return res.status(200).json({
          period: { dateFrom: dateFrom || null, dateTo: dateTo || null },
          summary,
          branchBreakdown,
          customers,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/reports/guarantors",
    authenticate,
    authorize(...reportRoles),
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
          return res.status(400).json({ message: "dateFrom must be before or equal to dateTo." });
        }

        const branchFilter = parseId(req.query.branchId);
        const officerIdsFilter = resolveOfficerFilter(req.query.officerIds, req.query.officerId, res);
        if (officerIdsFilter === undefined) {
          return;
        }

        async function tableExists(probeSql: string): Promise<boolean> {
          try {
            await get(probeSql);
            return true;
          } catch (error) {
            const errorMessage = String((error as { message?: unknown })?.message || error || "");
            if (/no such table|does not exist/i.test(errorMessage)) {
              return false;
            }
            throw error;
          }
        }

        const hasGuarantorsTable = await tableExists("SELECT 1 FROM guarantors LIMIT 1");
        const hasLoanGuarantorsTable = hasGuarantorsTable
          ? await tableExists("SELECT 1 FROM loan_guarantors LIMIT 1")
          : false;

        const whereBuilder = createSqlWhereBuilder();
        whereBuilder.addDateRange("g.created_at", dateFrom, dateTo);
        applyOfficerFilter(whereBuilder, "COALESCE(c.officer_id, c.created_by_user_id)", officerIdsFilter);
        if (!applyScopeAndBranchFilter({
          whereBuilder,
          scope,
          branchColumnRef: "g.branch_id",
          branchFilter,
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
          officerIds: officerIdsFilter || null,
        };

        const summary = hasGuarantorsTable
          ? await resolveCachedReport({
            namespace: "reports:guarantors:summary",
            user: req.user,
            scope,
            keyPayload: cacheKeyPayload,
            compute: async () => get(
              `
                SELECT
                  COUNT(g.id) AS total_guarantors,
                  SUM(CASE WHEN g.is_active = 1 THEN 1 ELSE 0 END) AS active_guarantors,
                  ${hasLoanGuarantorsTable ? "COUNT(DISTINCT lg.loan_id)" : "0"} AS guaranteed_loans,
                  ${hasLoanGuarantorsTable ? "COALESCE(SUM(lg.guarantee_amount), 0)" : "0"} AS total_guarantee_amount
                FROM guarantors g
                LEFT JOIN clients c ON c.id = g.client_id
                ${hasLoanGuarantorsTable ? "LEFT JOIN loan_guarantors lg ON lg.guarantor_id = g.id" : ""}
                ${whereSql}
              `,
              queryParams,
            ),
          })
          : {
            total_guarantors: 0,
            active_guarantors: 0,
            guaranteed_loans: 0,
            total_guarantee_amount: 0,
          };

        const guarantors = hasGuarantorsTable
          ? await resolveCachedReport({
            namespace: "reports:guarantors:list",
            user: req.user,
            scope,
            keyPayload: cacheKeyPayload,
            compute: async () => all(
              `
                SELECT
                  g.id AS guarantor_id,
                  g.full_name AS guarantor_name,
                  g.phone AS guarantor_phone,
                  g.national_id,
                  g.occupation,
                  g.monthly_income,
                  CASE WHEN g.is_active = 1 THEN 'ACTIVE' ELSE 'INACTIVE' END AS status,
                  g.client_id,
                  c.full_name AS client_name,
                  b.id AS branch_id,
                  b.name AS branch_name,
                  ${hasLoanGuarantorsTable ? "COALESCE(COUNT(DISTINCT lg.loan_id), 0)" : "0"} AS guaranteed_loans,
                  ${hasLoanGuarantorsTable ? "COALESCE(SUM(lg.guarantee_amount), 0)" : "0"} AS guaranteed_amount,
                  g.created_at
                FROM guarantors g
                LEFT JOIN clients c ON c.id = g.client_id
                LEFT JOIN branches b ON b.id = g.branch_id
                ${hasLoanGuarantorsTable ? "LEFT JOIN loan_guarantors lg ON lg.guarantor_id = g.id" : ""}
                ${whereSql}
                GROUP BY
                  g.id,
                  g.full_name,
                  g.phone,
                  g.national_id,
                  g.occupation,
                  g.monthly_income,
                  g.is_active,
                  g.client_id,
                  c.full_name,
                  b.id,
                  b.name,
                  g.created_at
                ORDER BY datetime(g.created_at) DESC, g.id DESC
              `,
              queryParams,
            ),
          })
          : [];

        if (format !== "json") {
          const cols = [
            "guarantor_id",
            "guarantor_name",
            "guarantor_phone",
            "national_id",
            "occupation",
            "monthly_income",
            "status",
            "client_id",
            "client_name",
            "branch_id",
            "branch_name",
            "guaranteed_loans",
            "guaranteed_amount",
            "created_at",
          ];
          sendTabularExport(res, {
            format,
            filenameBase: "guarantors-report",
            title: "Guarantors Report",
            headers: cols,
            rows: guarantors,
          });
          return;
        }

        return res.status(200).json({
          period: { dateFrom: dateFrom || null, dateTo: dateTo || null },
          summary: {
            total_guarantors: Number(summary?.total_guarantors || 0),
            active_guarantors: Number(summary?.active_guarantors || 0),
            guaranteed_loans: Number(summary?.guaranteed_loans || 0),
            total_guarantee_amount: Number(summary?.total_guarantee_amount || 0),
          },
          guarantors,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/reports/aging",
    authenticate,
    authorize(...reportRoles),
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
          return res.status(400).json({ message: "dateFrom must be before or equal to dateTo." });
        }
        const arrearsSnapshotAt = resolveArrearsSnapshotIso(dateTo);

        const branchFilter = parseId(req.query.branchId);
        const officerIdsFilter = resolveOfficerFilter(req.query.officerIds, req.query.officerId, res);
        if (officerIdsFilter === undefined) {
          return;
        }
        const cacheKeyPayload = {
          dateFrom: dateFrom || null,
          dateTo: dateTo || null,
          arrearsSnapshotAt,
          branchId: branchFilter || null,
          officerIds: officerIdsFilter || null,
        };
        const whereBuilder = createSqlWhereBuilder();
        whereBuilder.addClause("l.status IN ('active', 'restructured')");
        applyOfficerFilter(whereBuilder, "l.officer_id", officerIdsFilter);
        if (!applyScopeAndBranchFilter({
          whereBuilder,
          scope,
          branchColumnRef: "l.branch_id",
          branchFilter,
          res,
        })) {
          return;
        }
        const whereSql = whereBuilder.buildWhere();
        const queryParams = whereBuilder.getParams();

        const dueDateBuilder = createSqlWhereBuilder();
        dueDateBuilder.addDateRange("i.due_date", dateFrom, dateTo);
        const dueDateSql = dueDateBuilder.buildAnd();
        const dueDateParams = dueDateBuilder.getParams();

        const agingCte = `
          WITH loan_aging AS (
            SELECT
              l.id                                                           AS loan_id,
              l.branch_id,
              l.balance                                                      AS outstanding_balance,
              COALESCE(SUM(i.amount_due - i.amount_paid), 0)                AS overdue_amount,
              CAST(julianday(?) - julianday(MIN(i.due_date)) AS INTEGER)     AS days_overdue
            FROM loans l
            INNER JOIN loan_installments i ON i.loan_id = l.id
            ${whereSql}
              AND i.status != 'paid'
              AND datetime(i.due_date) < datetime(?)
              ${dueDateSql}
            GROUP BY l.id, l.branch_id, l.balance
          )
        `;

        const summary = await resolveCachedReport({
          namespace: "reports:aging:summary",
          user: req.user,
          scope,
          keyPayload: cacheKeyPayload,
          compute: async () => get(
            `
              ${agingCte}
              SELECT
                COUNT(*) AS loans_in_arrears,
                COALESCE(SUM(overdue_amount), 0) AS total_overdue_amount,
                COALESCE(SUM(outstanding_balance), 0) AS at_risk_balance,

                SUM(CASE WHEN days_overdue BETWEEN 1 AND 30 THEN 1 ELSE 0 END) AS bucket_1_30_count,
                COALESCE(SUM(CASE WHEN days_overdue BETWEEN 1 AND 30 THEN overdue_amount ELSE 0 END), 0) AS bucket_1_30_amount,
                COALESCE(SUM(CASE WHEN days_overdue BETWEEN 1 AND 30 THEN outstanding_balance ELSE 0 END), 0) AS bucket_1_30_balance,

                SUM(CASE WHEN days_overdue BETWEEN 31 AND 60 THEN 1 ELSE 0 END) AS bucket_31_60_count,
                COALESCE(SUM(CASE WHEN days_overdue BETWEEN 31 AND 60 THEN overdue_amount ELSE 0 END), 0) AS bucket_31_60_amount,
                COALESCE(SUM(CASE WHEN days_overdue BETWEEN 31 AND 60 THEN outstanding_balance ELSE 0 END), 0) AS bucket_31_60_balance,

                SUM(CASE WHEN days_overdue BETWEEN 61 AND 90 THEN 1 ELSE 0 END) AS bucket_61_90_count,
                COALESCE(SUM(CASE WHEN days_overdue BETWEEN 61 AND 90 THEN overdue_amount ELSE 0 END), 0) AS bucket_61_90_amount,
                COALESCE(SUM(CASE WHEN days_overdue BETWEEN 61 AND 90 THEN outstanding_balance ELSE 0 END), 0) AS bucket_61_90_balance,

                SUM(CASE WHEN days_overdue >= 91 THEN 1 ELSE 0 END) AS bucket_91_plus_count,
                COALESCE(SUM(CASE WHEN days_overdue >= 91 THEN overdue_amount ELSE 0 END), 0) AS bucket_91_plus_amount,
                COALESCE(SUM(CASE WHEN days_overdue >= 91 THEN outstanding_balance ELSE 0 END), 0) AS bucket_91_plus_balance
              FROM loan_aging
            `,
            [arrearsSnapshotAt, ...queryParams, arrearsSnapshotAt, ...dueDateParams],
          ),
        });

        const branchBreakdown = await resolveCachedReport({
          namespace: "reports:aging:branch-breakdown",
          user: req.user,
          scope,
          keyPayload: cacheKeyPayload,
          compute: async () => all(
            `
              ${agingCte}
              SELECT
                b.id AS branch_id,
                b.name AS branch_name,
                r.name AS region_name,
                COUNT(*) AS loans_in_arrears,
                COALESCE(SUM(la.overdue_amount), 0) AS total_overdue_amount,
                COALESCE(SUM(la.outstanding_balance), 0) AS at_risk_balance,
                SUM(CASE WHEN la.days_overdue BETWEEN 1 AND 30 THEN 1 ELSE 0 END) AS bucket_1_30_count,
                COALESCE(SUM(CASE WHEN la.days_overdue BETWEEN 1 AND 30 THEN la.overdue_amount ELSE 0 END), 0) AS bucket_1_30_amount,
                SUM(CASE WHEN la.days_overdue BETWEEN 31 AND 60 THEN 1 ELSE 0 END) AS bucket_31_60_count,
                COALESCE(SUM(CASE WHEN la.days_overdue BETWEEN 31 AND 60 THEN la.overdue_amount ELSE 0 END), 0) AS bucket_31_60_amount,
                SUM(CASE WHEN la.days_overdue BETWEEN 61 AND 90 THEN 1 ELSE 0 END) AS bucket_61_90_count,
                COALESCE(SUM(CASE WHEN la.days_overdue BETWEEN 61 AND 90 THEN la.overdue_amount ELSE 0 END), 0) AS bucket_61_90_amount,
                SUM(CASE WHEN la.days_overdue >= 91 THEN 1 ELSE 0 END) AS bucket_91_plus_count,
                COALESCE(SUM(CASE WHEN la.days_overdue >= 91 THEN la.overdue_amount ELSE 0 END), 0) AS bucket_91_plus_amount
              FROM loan_aging la
              INNER JOIN branches b ON b.id = la.branch_id
              INNER JOIN regions r ON r.id = b.region_id
              GROUP BY b.id
              ORDER BY r.name ASC, b.name ASC
            `,
            [arrearsSnapshotAt, ...queryParams, arrearsSnapshotAt, ...dueDateParams],
          ),
        });

        const normalizedSummary = {
          loans_in_arrears: Number(summary?.loans_in_arrears || 0),
          total_overdue_amount: Number(summary?.total_overdue_amount || 0),
          at_risk_balance: Number(summary?.at_risk_balance || 0),
          bucket_1_30_count: Number(summary?.bucket_1_30_count || 0),
          bucket_1_30_amount: Number(summary?.bucket_1_30_amount || 0),
          bucket_1_30_balance: Number(summary?.bucket_1_30_balance || 0),
          bucket_31_60_count: Number(summary?.bucket_31_60_count || 0),
          bucket_31_60_amount: Number(summary?.bucket_31_60_amount || 0),
          bucket_31_60_balance: Number(summary?.bucket_31_60_balance || 0),
          bucket_61_90_count: Number(summary?.bucket_61_90_count || 0),
          bucket_61_90_amount: Number(summary?.bucket_61_90_amount || 0),
          bucket_61_90_balance: Number(summary?.bucket_61_90_balance || 0),
          bucket_91_plus_count: Number(summary?.bucket_91_plus_count || 0),
          bucket_91_plus_amount: Number(summary?.bucket_91_plus_amount || 0),
          bucket_91_plus_balance: Number(summary?.bucket_91_plus_balance || 0),
        };

        const buckets = [
          {
            bucket: "1-30",
            loan_count: normalizedSummary.bucket_1_30_count,
            overdue_amount: normalizedSummary.bucket_1_30_amount,
            at_risk_balance: normalizedSummary.bucket_1_30_balance,
          },
          {
            bucket: "31-60",
            loan_count: normalizedSummary.bucket_31_60_count,
            overdue_amount: normalizedSummary.bucket_31_60_amount,
            at_risk_balance: normalizedSummary.bucket_31_60_balance,
          },
          {
            bucket: "61-90",
            loan_count: normalizedSummary.bucket_61_90_count,
            overdue_amount: normalizedSummary.bucket_61_90_amount,
            at_risk_balance: normalizedSummary.bucket_61_90_balance,
          },
          {
            bucket: "91+",
            loan_count: normalizedSummary.bucket_91_plus_count,
            overdue_amount: normalizedSummary.bucket_91_plus_amount,
            at_risk_balance: normalizedSummary.bucket_91_plus_balance,
          },
        ];

        const loanAgingDetails = await resolveCachedReport({
          namespace: "reports:aging:details",
          user: req.user,
          scope,
          keyPayload: cacheKeyPayload,
          compute: async () => all(
            `
              ${agingCte}
              SELECT
                la.loan_id,
                l.client_id AS borrowerid,
                c.full_name AS fullnames,
                c.phone AS phonenumber,
                l.principal AS loanamount,
                l.balance AS loanbalance,
                la.overdue_amount,
                la.days_overdue AS daysinarrears,
                COALESCE(lp.name, 'Unknown Product') AS productname,
                b.name AS branch,
                COALESCE(u.full_name, 'Unassigned') AS fieldofficer,
                (
                  SELECT MAX(i2.due_date)
                  FROM loan_installments i2
                  WHERE i2.loan_id = l.id
                ) AS expectedcleardate,
                l.disbursed_at AS borrowdate,
                CASE
                  WHEN EXISTS (
                    SELECT 1
                    FROM loans l_prev
                    WHERE l_prev.client_id = l.client_id
                      AND l_prev.disbursed_at IS NOT NULL
                      AND (
                        datetime(l_prev.disbursed_at) < datetime(l.disbursed_at)
                        OR (
                          datetime(l_prev.disbursed_at) = datetime(l.disbursed_at)
                          AND l_prev.id < l.id
                        )
                      )
                  ) THEN 'Repeat'
                  ELSE 'New'
                  END AS loantype
              FROM loan_aging la
              INNER JOIN loans l ON l.id = la.loan_id
              INNER JOIN clients c ON c.id = l.client_id
              LEFT JOIN loan_products lp ON lp.id = l.product_id
              LEFT JOIN branches b ON b.id = l.branch_id
              LEFT JOIN users u ON u.id = COALESCE(l.officer_id, l.created_by_user_id)
              ORDER BY la.days_overdue DESC, la.overdue_amount DESC, la.loan_id ASC
            `,
            [arrearsSnapshotAt, ...queryParams, arrearsSnapshotAt, ...dueDateParams],
          ),
        });

        if (format !== "json") {
          const cols = loanAgingDetails.length > 0
            ? [
              "loan_id",
              "borrowerid",
              "fullnames",
              "phonenumber",
              "loanamount",
              "loanbalance",
              "overdue_amount",
              "daysinarrears",
              "productname",
              "branch",
              "fieldofficer",
              "expectedcleardate",
              "borrowdate",
            ]
            : [
              "branch_id",
              "branch_name",
              "region_name",
              "loans_in_arrears",
              "total_overdue_amount",
              "at_risk_balance",
              "bucket_1_30_count",
              "bucket_1_30_amount",
              "bucket_31_60_count",
              "bucket_31_60_amount",
              "bucket_61_90_count",
              "bucket_61_90_amount",
              "bucket_91_plus_count",
              "bucket_91_plus_amount",
            ];
          sendTabularExport(res, {
            format,
            filenameBase: "aging-report",
            title: "Aging Report",
            headers: cols,
            rows: loanAgingDetails.length > 0 ? loanAgingDetails : branchBreakdown,
          });
          return;
        }

        return res.status(200).json({
          period: { dateFrom: dateFrom || null, dateTo: dateTo || null },
          summary: normalizedSummary,
          buckets,
          branchBreakdown,
          loanAgingDetails,
        });
      } catch (error) {
        next(error);
      }
    },
  );
}

export {
  registerPortfolioReports,
};
