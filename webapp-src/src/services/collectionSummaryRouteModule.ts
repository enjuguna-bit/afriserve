import type { CollectionManagementRouteOptions } from "./collectionManagementRouteTypes.js";

function registerCollectionSummaryRoutes(options: CollectionManagementRouteOptions) {
  const {
    app,
    authenticate,
    authorize,
    collectionViewRoles,
    hierarchyService,
    reportCache,
    parseId,
    resolveOfficerFilter,
    toScopeCachePayload,
    get,
  } = options;

  app.get(
    "/api/reports/collections-summary",
    authenticate,
    authorize(...collectionViewRoles),
    async (req, res, next) => {
      try {
        const scope = await hierarchyService.resolveHierarchyScope(req.user);
        const officerFilter = resolveOfficerFilter(req, res);
        if (!officerFilter) {
          return;
        }
        const effectiveOfficerFilter = officerFilter;

        async function computeSummaryPayload() {
          const scopeCondition = hierarchyService.buildScopeCondition(scope, "l.branch_id");
          const scopeSql = scopeCondition.sql ? `AND ${scopeCondition.sql}` : "";
          const filteredOfficerId = effectiveOfficerFilter.officerId;
          const officerSql = filteredOfficerId != null ? "AND l.officer_id = ?" : "";
          const scopedLoanParams = [...scopeCondition.params, ...(filteredOfficerId != null ? [filteredOfficerId] : [])];
          const totals = await get(
            `
              SELECT
                COUNT(DISTINCT i.loan_id) AS overdue_loans,
                COUNT(i.id) AS overdue_installments,
                ROUND(COALESCE(SUM(i.amount_due - i.amount_paid), 0), 2) AS overdue_amount
              FROM loan_installments i
              INNER JOIN loans l ON l.id = i.loan_id
              WHERE i.status != 'paid'
                AND l.status IN ('active', 'restructured')
                AND datetime(i.due_date) < datetime('now')
                ${scopeSql}
                ${officerSql}
            `,
            scopedLoanParams,
          );

          const actionScopeSql = scopeCondition.sql
            ? `AND ${scopeCondition.sql.replace(/l\.branch_id/g, "ca.branch_id")}`
            : "";
          const actions = await get(
            `
              SELECT
                COUNT(*) AS total_collection_actions,
                SUM(CASE WHEN action_status = 'open' THEN 1 ELSE 0 END) AS open_collection_actions,
                SUM(CASE WHEN action_type = 'promise_to_pay' AND action_status = 'open' THEN 1 ELSE 0 END) AS open_promises
              FROM collection_actions ca
              INNER JOIN loans l ON l.id = ca.loan_id
              WHERE 1 = 1
                ${actionScopeSql}
                ${officerSql}
            `,
            scopedLoanParams,
          );

          const quickCountOfficerId = effectiveOfficerFilter.officerId != null
            ? effectiveOfficerFilter.officerId
            : parseId(req.user?.sub);
          const officerOverdueTotals = quickCountOfficerId
            ? await get(
              `
                SELECT
                  COUNT(DISTINCT i.loan_id) AS overdue_loans_for_officer,
                  ROUND(COALESCE(SUM(i.amount_due - i.amount_paid), 0), 2) AS overdue_amount_for_officer
                FROM loan_installments i
                INNER JOIN loans l ON l.id = i.loan_id
                WHERE i.status != 'paid'
                  AND l.status IN ('active', 'restructured')
                  AND datetime(i.due_date) < datetime('now')
                  ${scopeSql}
                  AND l.officer_id = ?
              `,
              [...scopeCondition.params, quickCountOfficerId],
            )
            : null;

          return {
            ...totals,
            ...actions,
            overdue_loans_for_officer: Number(officerOverdueTotals?.overdue_loans_for_officer || 0),
            overdue_amount_for_officer: Number(officerOverdueTotals?.overdue_amount_for_officer || 0),
          };
        }

        const summaryResult = reportCache && reportCache.enabled
          ? await reportCache.getOrSet({
            key: reportCache.buildKey("reports:collections-summary", {
              userId: req.user?.sub || null,
              role: req.user?.role || null,
              scope: toScopeCachePayload(scope),
              mineOnly: officerFilter.mineOnly,
              officerIdFilter: officerFilter.officerId || null,
            }),
            compute: computeSummaryPayload,
          })
          : {
            value: await computeSummaryPayload(),
            cacheHit: false,
            key: "disabled",
          };

        res.status(200).json(summaryResult.value);
      } catch (error) {
        next(error);
      }
    },
  );
}

export {
  registerCollectionSummaryRoutes,
};
