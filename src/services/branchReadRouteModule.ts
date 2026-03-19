import { parsePaginationQuery, parseSortQuery, createPagedResponse } from "../utils/http.js";
import type { BranchManagementRouteOptions } from "./branchManagementRouteTypes.js";
import { createBranchReadRepository } from "../repositories/branchReadRepository.js";

function registerBranchReadRoutes(options: BranchManagementRouteOptions) {
  const {
    app,
    authenticate,
    authorize,
    parseId,
    hierarchyService,
    hierarchyEventService,
    getScope,
    get,
    all,
  } = options;
  const branchReadRepository = createBranchReadRepository({ all, get });

  app.get("/api/regions", authenticate, async (req, res, next) => {
    try {
      const scope = await getScope(req);
      const allRegions = await hierarchyService.getRegions({ includeInactive: true });
      if (scope.level === "hq") {
        res.status(200).json({ data: allRegions });
        return;
      }

      const visibleRegionIds = new Set();
      if (scope.regionId) {
        visibleRegionIds.add(Number(scope.regionId));
      }
      if (Array.isArray(scope.branchIds) && scope.branchIds.length > 0) {
        const branches = await hierarchyService.getBranchesByIds(scope.branchIds, { requireActive: false });
        for (const branch of branches) {
          visibleRegionIds.add(Number(branch.region_id));
        }
      }
      res.status(200).json({
        data: allRegions.filter((region: Record<string, any>) => visibleRegionIds.has(Number(region.id))),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/branches", authenticate, async (req, res, next) => {
    try {
      const scope = await getScope(req);

      const search = String(req.query.search || "").trim();

      const regionId = String(req.query.regionId || "").trim();
      let parsedRegionId: number | undefined;
      if (regionId) {
        parsedRegionId = parseId(regionId) || undefined;
        if (!parsedRegionId) {
          res.status(400).json({ message: "Invalid regionId filter" });
          return;
        }
      }

      const isActive = String(req.query.isActive || "").trim().toLowerCase();
      let parsedIsActive: number | undefined;
      if (isActive) {
        if (!["true", "false", "1", "0"].includes(isActive)) {
          res.status(400).json({ message: "Invalid isActive filter. Use true or false" });
          return;
        }
        parsedIsActive = ["true", "1"].includes(isActive) ? 1 : 0;
      }

      const scopeCondition = hierarchyService.buildScopeCondition(scope, "b.id");
      const { limit, offset } = parsePaginationQuery(req.query, {
        defaultLimit: 100,
        maxLimit: 200,
        requirePagination: true,
        strict: true,
      });
      const { requestedSortBy, sortBy, sortOrder } = parseSortQuery(req.query, {
        sortFieldMap: {
          id: "id",
          name: "name",
          code: "code",
          town: "town",
          county: "county",
          region: "region",
          createdAt: "createdAt",
        },
        defaultSortBy: "name",
        defaultSortOrder: "asc",
        sortByErrorMessage: "Invalid sortBy. Use one of: id, name, code, town, county, region, createdAt",
      });

      const { rows, total } = await branchReadRepository.listBranches({
        search: search || undefined,
        regionId: parsedRegionId,
        isActive: parsedIsActive,
        scopeCondition,
        limit,
        offset,
        sortBy: sortBy as "id" | "name" | "code" | "town" | "county" | "region" | "createdAt",
        sortOrder,
      });

      res.status(200).json(
        createPagedResponse({
          data: rows,
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
  });

  app.get("/api/branches/:id", authenticate, async (req, res, next) => {
    try {
      const branchId = parseId(req.params.id);
      if (!branchId) {
        res.status(400).json({ message: "Invalid branch id" });
        return;
      }

      const scope = await getScope(req);
      if (!hierarchyService.isBranchInScope(scope, branchId)) {
        res.status(403).json({ message: "Forbidden: branch is outside your scope" });
        return;
      }

      const branch = await hierarchyService.getBranchById(branchId, { requireActive: false });
      if (!branch) {
        res.status(404).json({ message: "Branch not found" });
        return;
      }

      const loanStats = await get(
        `
          SELECT
            COUNT(*) AS total_loans,
            SUM(CASE WHEN status IN ('active', 'restructured') THEN 1 ELSE 0 END) AS active_loans,
            SUM(CASE WHEN status = 'restructured' THEN 1 ELSE 0 END) AS restructured_loans,
            SUM(CASE WHEN status = 'written_off' THEN 1 ELSE 0 END) AS written_off_loans,
            COALESCE(SUM(principal), 0) AS principal_disbursed,
            COALESCE(SUM(expected_total), 0) AS expected_total,
            COALESCE(SUM(repaid_total), 0) AS repaid_total,
            COALESCE(SUM(CASE WHEN status IN ('active', 'restructured') THEN balance ELSE 0 END), 0) AS outstanding_balance,
            COALESCE(SUM(CASE WHEN status = 'written_off' THEN balance ELSE 0 END), 0) AS written_off_balance
          FROM loans
          WHERE branch_id = ?
        `,
        [branchId],
      );

      const clientStats = await get(
        `
          SELECT
            COUNT(*) AS total_clients,
            SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active_clients
          FROM clients
          WHERE branch_id = ?
        `,
        [branchId],
      );

      const overdueStats = await get(
        `
          SELECT
            COUNT(*) AS overdue_installments,
            COUNT(DISTINCT l.id) AS overdue_loans
          FROM loan_installments i
          INNER JOIN loans l ON l.id = i.loan_id
          WHERE l.branch_id = ?
            AND l.status IN ('active', 'restructured')
            AND i.status != 'paid'
            AND datetime(i.due_date) < datetime('now')
        `,
        [branchId],
      );

      res.status(200).json({
        ...branch,
        stats: {
          total_clients: Number(clientStats?.total_clients || 0),
          active_clients: Number(clientStats?.active_clients || 0),
          total_loans: Number(loanStats?.total_loans || 0),
          active_loans: Number(loanStats?.active_loans || 0),
          restructured_loans: Number(loanStats?.restructured_loans || 0),
          written_off_loans: Number(loanStats?.written_off_loans || 0),
          principal_disbursed: Number(loanStats?.principal_disbursed || 0),
          expected_total: Number(loanStats?.expected_total || 0),
          repaid_total: Number(loanStats?.repaid_total || 0),
          outstanding_balance: Number(loanStats?.outstanding_balance || 0),
          written_off_balance: Number(loanStats?.written_off_balance || 0),
          overdue_installments: Number(overdueStats?.overdue_installments || 0),
          overdue_loans: Number(overdueStats?.overdue_loans || 0),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/hierarchy/tree", authenticate, authorize("admin"), async (_req, res, next) => {
    try {
      const hq = await get("SELECT id, name, code, location, contact_phone, contact_email FROM headquarters ORDER BY id ASC LIMIT 1");
      const regions = await all(
        `
          SELECT
            r.id,
            r.name,
            r.code,
            r.is_active,
            COUNT(b.id) AS branch_count
          FROM regions r
          LEFT JOIN branches b ON b.region_id = r.id AND b.is_active = 1
          GROUP BY r.id
          ORDER BY r.name ASC
        `,
      );
      const branches = await all(
        `
          SELECT
            b.id,
            b.name,
            b.code,
            b.region_id,
            b.county,
            b.town,
            b.location_address,
            b.contact_phone,
            b.contact_email,
            b.is_active
          FROM branches b
          ORDER BY b.region_id ASC, b.name ASC
        `,
      );
      const branchesByRegion = new Map();
      for (const branch of branches) {
        if (!branchesByRegion.has(branch.region_id)) branchesByRegion.set(branch.region_id, []);
        branchesByRegion.get(branch.region_id).push(branch);
      }

      res.status(200).json({
        headquarters: hq,
        regions: regions.map((region) => ({
          ...region,
          branches: branchesByRegion.get(region.id) || [],
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/hierarchy/events", authenticate, async (req, res, next) => {
    try {
      const scope = await getScope(req);
      const sinceId = Math.max(0, Number(req.query.sinceId) || 0);
      const limit = Math.min(Math.max(Math.floor(Number(req.query.limit) || 50), 1), 500);
      if (!hierarchyEventService || typeof hierarchyEventService.listHierarchyEvents !== "function") {
        res.status(200).json({ data: [], nextSinceId: sinceId });
        return;
      }
      const events = await hierarchyEventService.listHierarchyEvents({ sinceId, limit, scope });
      res.status(200).json({ data: events, nextSinceId: events.length > 0 ? events[events.length - 1].id : sinceId });
    } catch (error) {
      next(error);
    }
  });
}

export {
  registerBranchReadRoutes,
};


