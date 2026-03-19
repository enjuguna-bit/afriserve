import { createSqlWhereBuilder } from "../../utils/sqlBuilder.js";
import type { RouteRegistrar } from "../../types/routeDeps.js";

function registerOfficerReports(app: RouteRegistrar, context: Record<string, any>) {
  const {
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

  /**
   * GET /api/reports/officer-performance
   *
   * Per-loan-officer breakdown of:
   *  - Loans disbursed (and total principal) in the period
   *  - Collections received in the period (on the officer portfolio)
   *  - Expected installment amount due in the period
   *  - Collection rate (collected / expected due)
   *
   * "Disbursed by officer" uses loans.created_by_user_id.
   * "Collections by officer" uses loans.officer_id, with fallback to loans.created_by_user_id
   * when officer assignment is missing.
   */
  app.get(
    "/api/reports/officer-performance",
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
          return res.status(400).json({ message: "dateFrom must be before or equal to dateTo." });
        }

        const branchFilter = parseId(req.query.branchId);
        const officerIdsFilter = resolveOfficerFilter(req.query.officerIds, req.query.officerId, res);
        if (officerIdsFilter === undefined) {
          return;
        }
        const cacheKeyPayload = {
          dateFrom: dateFrom || null,
          dateTo: dateTo || null,
          branchId: branchFilter || null,
          officerIds: officerIdsFilter || null,
        };
        const officerIdClause = buildIdListClause("o.user_id", officerIdsFilter);

        const disbFilterBuilder = createSqlWhereBuilder();
        disbFilterBuilder.addClause("l.disbursed_at IS NOT NULL");
        disbFilterBuilder.addDateRange("l.disbursed_at", dateFrom, dateTo);
        if (!applyScopeAndBranchFilter({
          whereBuilder: disbFilterBuilder,
          scope,
          branchColumnRef: "l.branch_id",
          branchFilter,
          tenantColumnRef: "l.tenant_id",
          res,
        })) {
          return;
        }
        const disbWhereSql = disbFilterBuilder.buildWhere() || "WHERE 1=1";
        const disbFilterParams = disbFilterBuilder.getParams();

        const colFilterBuilder = createSqlWhereBuilder();
        colFilterBuilder.addDateRange("r.paid_at", dateFrom, dateTo);
        if (!applyScopeAndBranchFilter({
          whereBuilder: colFilterBuilder,
          scope,
          branchColumnRef: "l.branch_id",
          branchFilter,
          tenantColumnRef: "l.tenant_id",
          res,
        })) {
          return;
        }
        const colWhereSql = colFilterBuilder.buildWhere() || "WHERE 1=1";
        const colFilterParams = colFilterBuilder.getParams();

        const dueFilterBuilder = createSqlWhereBuilder();
        dueFilterBuilder.addDateRange("i.due_date", dateFrom, dateTo);
        if (!applyScopeAndBranchFilter({
          whereBuilder: dueFilterBuilder,
          scope,
          branchColumnRef: "l.branch_id",
          branchFilter,
          tenantColumnRef: "l.tenant_id",
          res,
        })) {
          return;
        }
        const dueWhereSql = dueFilterBuilder.buildWhere() || "WHERE 1=1";
        const dueFilterParams = dueFilterBuilder.getParams();

        const officers = await resolveCachedReport({
          namespace: "reports:officer-performance:list",
          user: req.user,
          scope,
          keyPayload: cacheKeyPayload,
          compute: async () => {
            const officers = await all(
              `
                WITH disb_by_officer AS (
                  SELECT
                    u.id AS user_id,
                    MAX(b.name) AS branch_name,
                    COUNT(l.id) AS loans_disbursed,
                    COALESCE(SUM(l.principal), 0) AS total_principal_disbursed,
                    SUM(CASE
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
                      ) THEN 0
                      ELSE 1
                    END) AS new_client_loans,
                    SUM(CASE
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
                      ) THEN 1
                      ELSE 0
                    END) AS repeat_client_loans
                  FROM loans l
                  INNER JOIN users u ON u.id = l.created_by_user_id
                  LEFT JOIN branches b ON b.id = l.branch_id
                  ${disbWhereSql}
                  GROUP BY u.id
                ),
                col_by_officer AS (
                  SELECT
                    u.id AS user_id,
                    COUNT(r.id) AS repayment_count,
                    COALESCE(SUM(r.amount), 0) AS total_collected
                  FROM repayments r
                  INNER JOIN loans l ON l.id = r.loan_id
                  INNER JOIN users u ON u.id = COALESCE(l.officer_id, l.created_by_user_id)
                  ${colWhereSql}
                  GROUP BY u.id
                ),
                due_by_officer AS (
                  SELECT
                    u.id AS user_id,
                    COALESCE(SUM(i.amount_due), 0) AS expected_due_in_period
                  FROM loan_installments i
                  INNER JOIN loans l ON l.id = i.loan_id
                  INNER JOIN users u ON u.id = COALESCE(l.officer_id, l.created_by_user_id)
                  ${dueWhereSql}
                  GROUP BY u.id
                ),
                officer_ids AS (
                  SELECT user_id FROM disb_by_officer
                  UNION
                  SELECT user_id FROM col_by_officer
                  UNION
                  SELECT user_id FROM due_by_officer
                )
                SELECT
                  o.user_id,
                  COALESCE(u.full_name, 'Unknown Officer') AS officer_name,
                  u.email AS officer_email,
                  COALESCE(d.branch_name, ub.name) AS branch_name,
                  COALESCE(d.loans_disbursed, 0) AS loans_disbursed,
                  COALESCE(d.total_principal_disbursed, 0) AS total_principal_disbursed,
                  COALESCE(d.new_client_loans, 0) AS new_client_loans,
                  COALESCE(d.repeat_client_loans, 0) AS repeat_client_loans,
                  COALESCE(c.repayment_count, 0) AS repayment_count,
                  COALESCE(c.total_collected, 0) AS total_collected,
                  COALESCE(due.expected_due_in_period, 0) AS expected_due_in_period,
                  COALESCE(
                    COALESCE(c.total_collected, 0) / NULLIF(COALESCE(due.expected_due_in_period, 0), 0),
                    0
                  ) AS collection_rate_pct
                FROM officer_ids o
                LEFT JOIN disb_by_officer d ON d.user_id = o.user_id
                LEFT JOIN col_by_officer c ON c.user_id = o.user_id
                LEFT JOIN due_by_officer due ON due.user_id = o.user_id
                LEFT JOIN users u ON u.id = o.user_id
                LEFT JOIN branches ub ON ub.id = u.branch_id
                ${officerIdClause ? `WHERE ${officerIdClause.sql}` : ""}
                ORDER BY total_principal_disbursed DESC, total_collected DESC, o.user_id ASC
              `,
              [
                ...disbFilterParams,
                ...colFilterParams,
                ...dueFilterParams,
                ...(officerIdClause?.params || []),
              ],
            );

            return officers.map(
              (row: Record<string, any>) => ({
                ...row,
                user_id: Number(row.user_id || 0),
                loans_disbursed: Number(row.loans_disbursed || 0),
                total_principal_disbursed: Number(row.total_principal_disbursed || 0),
                new_client_loans: Number(row.new_client_loans || 0),
                repeat_client_loans: Number(row.repeat_client_loans || 0),
                repayment_count: Number(row.repayment_count || 0),
                total_collected: Number(row.total_collected || 0),
                expected_due_in_period: Number(row.expected_due_in_period || 0),
                collection_rate_pct: Number(row.collection_rate_pct || 0),
              }),
            );
          },
        });

        if (format !== "json") {
          const cols = [
            "user_id", "officer_name", "officer_email", "branch_name",
            "loans_disbursed", "total_principal_disbursed", "new_client_loans", "repeat_client_loans",
            "repayment_count", "total_collected", "expected_due_in_period", "collection_rate_pct",
          ];
          sendTabularExport(res, {
            format,
            filenameBase: "officer-performance-report",
            title: "Officer Performance Report",
            headers: cols,
            rows: officers,
          });
          return;
        }

        return res.status(200).json({
          period: { dateFrom: dateFrom || null, dateTo: dateTo || null },
          officers,
        });
      } catch (error) {
        next(error);
      }
    },
  );
}

export {
  registerOfficerReports,
};
