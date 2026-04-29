import type { CollectionRouteDeps, RouteRegistrar } from "../../types/routeDeps.js";
import { registerCollectionManagementRoutes } from "../modules/collectionManagementRouteModule.js";

/**
 * @param {RouteRegistrar} app
 * @param {CollectionRouteDeps} deps
 */
function registerCollectionServiceRoutes(app: RouteRegistrar, deps: CollectionRouteDeps) {
  const {
    run,
    get,
    all,
    authenticate,
    authorize,
    parseId,
    writeAuditLog,
    createCollectionActionSchema,
    updateCollectionActionSchema,
    hierarchyService,
    reportCache = null,
  } = deps;

  const collectionViewRoles = [
    "admin",
    "loan_officer",
    "cashier",
    "ceo",
    "finance",
    "operations_manager",
    "it",
    "area_manager",
  ];
  const collectionManageRoles = [
    "admin",
    "loan_officer",
    "cashier",
    "operations_manager",
    "area_manager",
  ];

  function hasOwn(payload: Record<string, unknown> | null | undefined, key: string) {
    return Object.prototype.hasOwnProperty.call(payload || {}, key);
  }

  function isTruthyFilterValue(value: unknown) {
    return ["1", "true", "yes"].includes(String(value || "").trim().toLowerCase());
  }

  function resolveOfficerFilter(req: any, res: any) {
    const mineOnly = isTruthyFilterValue(req.query.mine);
    if (mineOnly) {
      const selfOfficerId = parseId(req.user?.sub);
      if (!selfOfficerId) {
        res.status(400).json({ message: "Invalid authenticated user id for mine filter" });
        return null;
      }
      return {
        mineOnly: true,
        officerId: selfOfficerId,
      };
    }

    const rawOfficerId = String(req.query.officerId || "").trim();
    if (!rawOfficerId) {
      return {
        mineOnly: false,
        officerId: null,
      };
    }

    const officerId = parseId(rawOfficerId);
    if (!officerId) {
      res.status(400).json({ message: "Invalid officerId filter" });
      return null;
    }

    return {
      mineOnly: false,
      officerId,
    };
  }

  async function invalidateReportCaches() {
    if (!reportCache || !reportCache.enabled) {
      return;
    }
    try {
      await reportCache.invalidatePrefix("reports:");
    } catch (_error) {
      // Best-effort cache invalidation should not fail request writes.
    }
  }

  function toScopeCachePayload(scope: any) {
    const rawBranchIds = Array.isArray(scope?.branchIds) ? scope.branchIds : [];
    return {
      level: scope?.level || null,
      role: scope?.role || null,
      branchId: Number.isInteger(Number(scope?.branchId)) ? Number(scope.branchId) : null,
      regionId: Number.isInteger(Number(scope?.regionId)) ? Number(scope.regionId) : null,
      branchIds: rawBranchIds
        .map((value: unknown) => Number(value))
        .filter((value: number) => Number.isInteger(value) && value > 0)
        .sort((a: number, b: number) => a - b),
    };
  }

  registerCollectionManagementRoutes({
    app,
    authenticate,
    authorize,
    collectionViewRoles,
    collectionManageRoles,
    createCollectionActionSchema,
    updateCollectionActionSchema,
    hierarchyService,
    reportCache,
    parseId,
    hasOwn,
    resolveOfficerFilter,
    toScopeCachePayload,
    invalidateReportCaches,
    run,
    get,
    all,
    writeAuditLog,
  });
}

export {
  registerCollectionServiceRoutes,
};

