import type { BranchRouteDeps, RouteRegistrar } from "../../types/routeDeps.js";
import { getCurrentTenantId } from "../../utils/tenantStore.js";
import { registerBranchManagementRoutes } from "../modules/branchManagementRouteModule.js";

/**
 * @param {RouteRegistrar} app
 * @param {BranchRouteDeps} deps
 */
function registerBranchServiceRoutes(app: RouteRegistrar, deps: BranchRouteDeps) {
  const {
    run,
    get,
    all,
    parseId,
    authenticate,
    authorize,
    writeAuditLog,
    createBranchSchema,
    updateBranchSchema,
    hierarchyService,
    hierarchyEventService,
    reportCache = null,
    logger,
  } = deps;

  function normalizeBranchCode(code: unknown) {
    return String(code || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, "");
  }

  async function publishHierarchyEvent(payload: Record<string, unknown>) {
    if (!hierarchyEventService || typeof hierarchyEventService.publishHierarchyEvent !== "function") {
      return;
    }
    try {
      await hierarchyEventService.publishHierarchyEvent(payload);
    } catch (error) {
      if (logger && typeof logger.error === "function") {
        logger.error("hierarchy_event.publish_failed", {
          error,
          payload,
        });
      }
    }
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

  async function getBranchDeletionDependencies(branchId: number) {
    const currentTenantId = getCurrentTenantId();
    const row = await get(
      `
        SELECT
          (SELECT COUNT(*) FROM users WHERE branch_id = ? AND tenant_id = ?) AS users_assigned,
          (SELECT COUNT(*) FROM clients WHERE branch_id = ? AND tenant_id = ?) AS clients_assigned,
          (SELECT COUNT(*) FROM loans WHERE branch_id = ? AND tenant_id = ?) AS loans_linked,
          (SELECT COUNT(*) FROM transactions WHERE branch_id = ? AND tenant_id = ?) AS transactions_linked,
          (SELECT COUNT(*) FROM collection_actions WHERE branch_id = ? AND tenant_id = ?) AS collection_actions_linked
      `,
      [
        branchId,
        currentTenantId,
        branchId,
        currentTenantId,
        branchId,
        currentTenantId,
        branchId,
        currentTenantId,
        branchId,
        currentTenantId,
      ],
    );

    return {
      users_assigned: Number(row?.users_assigned || 0),
      clients_assigned: Number(row?.clients_assigned || 0),
      loans_linked: Number(row?.loans_linked || 0),
      transactions_linked: Number(row?.transactions_linked || 0),
      collection_actions_linked: Number(row?.collection_actions_linked || 0),
    };
  }

  function hasDeletionDependencies(dependencies: Record<string, number>) {
    return Object.values(dependencies).some((count) => Number(count || 0) > 0);
  }

  async function ensureUniqueBranchCode(initialCode: unknown) {
    let code = normalizeBranchCode(initialCode);
    if (!code) {
      code = `BR-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    }
    let attempt = 0;
    while (attempt < 10) {
      const existing = await get("SELECT id FROM branches WHERE code = ?", [code]);
      if (!existing) {
        return code;
      }
      attempt += 1;
      code = `${code}-${attempt}`;
    }
    throw new Error("Unable to generate a unique branch code");
  }

  async function getScope(req: any) {
    return hierarchyService.resolveHierarchyScope(req.user);
  }

  registerBranchManagementRoutes({
    app,
    authenticate,
    authorize,
    parseId,
    createBranchSchema,
    updateBranchSchema,
    hierarchyService,
    hierarchyEventService,
    run,
    get,
    all,
    writeAuditLog,
    normalizeBranchCode,
    ensureUniqueBranchCode,
    getScope,
    getBranchDeletionDependencies,
    hasDeletionDependencies,
    publishHierarchyEvent,
    invalidateReportCaches,
  });
}

export {
  registerBranchServiceRoutes,
};

