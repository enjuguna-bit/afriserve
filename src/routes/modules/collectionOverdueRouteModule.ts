import { parsePaginationQuery, parseSortQuery, createPagedResponse } from "../../utils/http.js";
import type { CollectionManagementRouteOptions } from "./collectionManagementRouteTypes.js";
import { createCollectionReadRepository } from "../../repositories/collectionReadRepository.js";

function registerCollectionOverdueRoutes(options: CollectionManagementRouteOptions) {
  const {
    app,
    authenticate,
    authorize,
    collectionViewRoles,
    hierarchyService,
    parseId,
    resolveOfficerFilter,
    get,
    all,
  } = options;
  const collectionReadRepository = createCollectionReadRepository({ all, get });

  app.get(
    "/api/collections/overdue",
    authenticate,
    authorize(...collectionViewRoles),
    async (req, res, next) => {
      try {
        const scope = await hierarchyService.resolveHierarchyScope(req.user);
        const officerFilter = resolveOfficerFilter(req, res);
        if (!officerFilter) {
          return;
        }
        const { limit, offset } = parsePaginationQuery(req.query, {
          defaultLimit: 50,
          maxLimit: 200,
          requirePagination: false,
          strict: true,
        });

        const parsedMinDays = Number(req.query.minDaysOverdue);
        const minDaysOverdue = Number.isFinite(parsedMinDays) ? Math.max(Math.floor(parsedMinDays), 0) : 0;

        const { requestedSortBy, sortBy, sortOrder } = parseSortQuery(req.query, {
          sortFieldMap: {
            loanId: "loanId",
            dueDate: "dueDate",
            overdueAmount: "overdueAmount",
            daysOverdue: "daysOverdue",
            clientName: "clientName",
          },
          defaultSortBy: "daysOverdue",
          defaultSortOrder: "desc",
          sortByErrorMessage: "Invalid sortBy. Use one of: loanId, dueDate, overdueAmount, daysOverdue, clientName",
        });

        const scopeCondition = hierarchyService.buildScopeCondition(scope, "l.branch_id");
        const { rows: overdueRows, total } = await collectionReadRepository.listOverdueLoans({
          scopeCondition,
          officerId: officerFilter.officerId || undefined,
          minDaysOverdue,
          limit,
          offset,
          sortBy: sortBy as "loanId" | "dueDate" | "overdueAmount" | "daysOverdue" | "clientName",
          sortOrder,
        });

        res.status(200).json(
          createPagedResponse({
            data: overdueRows,
            total,
            limit,
            offset,
            sortBy: requestedSortBy,
            sortOrder,
          }),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/collections/actions",
    authenticate,
    authorize(...collectionViewRoles),
    async (req, res, next) => {
      try {
        const scope = await hierarchyService.resolveHierarchyScope(req.user);
        const officerFilter = resolveOfficerFilter(req, res);
        if (!officerFilter) {
          return;
        }

        const loanId = parseId(req.query.loanId);
        if (!loanId && typeof req.query.loanId !== "undefined" && String(req.query.loanId).trim() !== "") {
          res.status(400).json({ message: "Invalid loanId filter" });
          return;
        }

        const status = String(req.query.status || "").trim().toLowerCase();
        if (status) {
          if (!["open", "completed", "cancelled"].includes(status)) {
            res.status(400).json({ message: "Invalid status filter. Use open, completed, or cancelled" });
            return;
          }
        }

        const scopeCondition = hierarchyService.buildScopeCondition(scope, "ca.branch_id");
        const { limit, offset } = parsePaginationQuery(req.query, {
          defaultLimit: 50,
          maxLimit: 200,
          requirePagination: false,
          strict: true,
        });

        const { rows: actions, total } = await collectionReadRepository.listCollectionActions({
          loanId: loanId || undefined,
          status: (status || undefined) as "open" | "completed" | "cancelled" | undefined,
          officerId: officerFilter.officerId || undefined,
          scopeCondition,
          limit,
          offset,
        });

        res.status(200).json(
          createPagedResponse({
            data: actions,
            total,
            limit,
            offset,
            sortBy: "id",
            sortOrder: "desc",
          }),
        );
      } catch (error) {
        next(error);
      }
    },
  );
}

export {
  registerCollectionOverdueRoutes,
};


