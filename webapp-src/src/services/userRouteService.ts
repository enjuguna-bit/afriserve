import type { RouteRegistrar, UserRouteDeps } from "../types/routeDeps.js";
import { registerUserManagementRoutes } from "./userManagementRouteModule.js";
import { getUserRolesForUser, sameRoleList } from "./userRoleService.js";

/**
 * @param {RouteRegistrar} app
 * @param {UserRouteDeps} deps
 */
function registerUserServiceRoutes(app: RouteRegistrar, deps: UserRouteDeps) {
  const {
    run, get, all, authenticate, authorize, writeAuditLog, issuePasswordResetToken,
    normalizeEmail, createHttpError, parseId, createUserSchema, updateUserProfileSchema, allocateUserRoleSchema,
    getAllowedRoles, getRoleCatalog, normalizeRoleInput, hierarchyService, hierarchyEventService, bcrypt,
    publishDomainEvent: publishDomainEventFromDeps,
    reportCache = null,
    logger,
  } = deps;

  const allowedRoles = getAllowedRoles();
  const roleCatalog = getRoleCatalog();
  const roleListLabel = allowedRoles.join(", ");
  const branchAssignmentRoles = new Set(["area_manager", "investor", "partner"]);

  function supportsBranchAssignments(role: unknown): boolean {
    return branchAssignmentRoles.has(String(normalizeRoleInput(role) || "").trim().toLowerCase());
  }

  function hasOwn(payload: Record<string, unknown> | null | undefined, key: string) {
    return Object.prototype.hasOwnProperty.call(payload || {}, key);
  }

  function ensureTokenVersionBump(setClauses: string[]) {
    if (!setClauses.includes("token_version = token_version + 1")) setClauses.push("token_version = token_version + 1");
  }

  function sameIdList(left: unknown[], right: unknown[]) {
    const a = hierarchyService.normalizeIds(left);
    const b = hierarchyService.normalizeIds(right);
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }

  function sanitizeUserRow(user: Record<string, any> | null | undefined) {
    if (!user) return null;
    return {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      roles: Array.isArray(user.roles) ? user.roles : [],
      is_active: user.is_active,
      deactivated_at: user.deactivated_at || null,
      failed_login_attempts: user.failed_login_attempts,
      locked_until: user.locked_until,
      token_version: user.token_version,
      branch_id: user.branch_id || null,
      branch_name: user.branch_name || null,
      primary_region_id: user.primary_region_id || null,
      region_name: user.region_name || null,
      assigned_branch_ids: Array.isArray(user.assigned_branch_ids) ? user.assigned_branch_ids : [],
      created_at: user.created_at,
    };
  }

  async function fetchUserById(userId: number) {
    const user = await get(
      `
        SELECT
          u.id, u.full_name, u.email, u.role, u.is_active, u.deactivated_at, u.failed_login_attempts, u.locked_until, u.token_version,
          u.branch_id, u.primary_region_id, u.created_at, b.name AS branch_name, r.name AS region_name
        FROM users u
        LEFT JOIN branches b ON b.id = u.branch_id
        LEFT JOIN regions r ON r.id = COALESCE(u.primary_region_id, b.region_id)
        WHERE u.id = ?
      `,
      [userId],
    );
    if (!user) return null;
    user.roles = await getUserRolesForUser({
      all,
      get,
      userId,
      primaryRole: user.role,
    });
    user.assigned_branch_ids = supportsBranchAssignments(user.role)
      ? await hierarchyService.getAreaManagerBranchIds(user.id)
      : [];
    return user;
  }

  async function resolveRoleAssignments({
    role,
    branchIdInput,
    branchIdsInput,
    branchCountInput,
    primaryRegionIdInput,
  }: {
    role: unknown;
    branchIdInput?: unknown;
    branchIdsInput?: unknown;
    branchCountInput?: unknown;
    primaryRegionIdInput?: unknown;
  }) {
    const normalizedRole = normalizeRoleInput(role);
    const branchId = branchIdInput == null ? null : parseId(branchIdInput);
    const branchIds = Array.isArray(branchIdsInput) ? hierarchyService.normalizeIds(branchIdsInput) : [];
    const branchCount = branchCountInput == null ? null : parseId(branchCountInput);
    let primaryRegionId = primaryRegionIdInput == null ? null : parseId(primaryRegionIdInput);
    let selectedBranch: Record<string, any> | null = null;
    if (branchId) {
      selectedBranch = await hierarchyService.getBranchById(branchId, { requireActive: true });
      if (!selectedBranch) throw createHttpError(400, "Assigned branch was not found or is inactive");
    }
    if (primaryRegionId) {
      const region = await hierarchyService.getRegionById(primaryRegionId);
      if (!region || Number(region.is_active) !== 1) throw createHttpError(400, "Assigned region was not found or is inactive");
    }

    if (normalizedRole === "operations_manager" || normalizedRole === "loan_officer" || normalizedRole === "cashier") {
      if (branchCount) {
        throw createHttpError(400, "branchCount is only supported for area_manager, investor, and partner roles");
      }
      if (branchIds.length > 1) {
        throw createHttpError(400, "branchIds must match branchId for branch-scoped roles");
      }
      let resolvedBranch = selectedBranch;
      let resolvedBranchId = branchId;
      if (!resolvedBranchId && branchIds.length === 1) {
        resolvedBranchId = branchIds[0];
        resolvedBranch = await hierarchyService.getBranchById(resolvedBranchId, { requireActive: true });
      }
      if (!resolvedBranchId) {
        const candidateBranches = await hierarchyService.getBranches({
          includeInactive: false,
          regionId: primaryRegionId || null,
        });
        if (candidateBranches.length === 0) {
          throw createHttpError(400, primaryRegionId
            ? "No active branches are available in the selected region"
            : "No active branches are available for assignment");
        }
        resolvedBranch = candidateBranches[0];
        resolvedBranchId = Number(resolvedBranch.id);
      }
      if (!resolvedBranch || !resolvedBranchId) {
        throw createHttpError(400, "Assigned branch was not found or is inactive");
      }
      if (branchIds.length > 0 && (branchIds.length !== 1 || branchIds[0] !== resolvedBranchId)) {
        throw createHttpError(400, "branchIds must match branchId for branch-scoped roles");
      }
      const resolvedRegionId = Number(resolvedBranch.region_id || 0) || null;
      if (primaryRegionId && resolvedRegionId && primaryRegionId !== resolvedRegionId) {
        throw createHttpError(400, "Assigned branch does not belong to the selected region");
      }
      return { branchId: resolvedBranchId, primaryRegionId: resolvedRegionId, areaBranchIds: [] };
    }

    if (normalizedRole === "area_manager") {
      if (branchId && branchIds.length > 0 && !branchIds.includes(branchId)) {
        throw createHttpError(400, "branchId must be included in branchIds for area_manager role");
      }
      let resolvedBranchIds = branchIds.length > 0 ? branchIds : (branchId ? [branchId] : []);
      if (branchCount) {
        if (resolvedBranchIds.length > 0 && resolvedBranchIds.length !== branchCount) {
          throw createHttpError(400, "branchCount must match the number of provided branchIds");
        }
        if (resolvedBranchIds.length === 0) {
          if (!primaryRegionId) {
            throw createHttpError(400, "primaryRegionId is required when branchCount is provided for area_manager role");
          }
          const candidateBranches = await hierarchyService.getBranches({
            includeInactive: false,
            regionId: primaryRegionId,
          });
          const candidateBranchIds = candidateBranches
            .map((branch: Record<string, any>) => Number(branch.id))
            .filter((id: number) => Number.isInteger(id) && id > 0);
          if (candidateBranchIds.length < branchCount) {
            throw createHttpError(400, "branchCount exceeds available active branches in the selected region");
          }
          resolvedBranchIds = candidateBranchIds.slice(0, branchCount);
        }
      }
      if (resolvedBranchIds.length === 0) {
        const fallbackBranches = await hierarchyService.getBranches({
          includeInactive: false,
          regionId: primaryRegionId || null,
        });
        if (fallbackBranches.length === 0) {
          throw createHttpError(400, primaryRegionId
            ? "No active branches are available in the selected region"
            : "No active branches are available for assignment");
        }
        resolvedBranchIds = [Number(fallbackBranches[0].id)];
      }
      const branches = await hierarchyService.getBranchesByIds(resolvedBranchIds, { requireActive: true });
      if (branches.length !== resolvedBranchIds.length) throw createHttpError(400, "One or more assigned branches are invalid or inactive");
      const regionIds = [...new Set(branches.map((branch: Record<string, any>) => Number(branch.region_id)).filter(Boolean))];
      if (regionIds.length !== 1) throw createHttpError(400, "Area Manager branches must belong to one region");
      if (branchCount && resolvedBranchIds.length !== branchCount) {
        throw createHttpError(400, "branchCount must match the number of resolved area manager branches");
      }
      if (primaryRegionId && primaryRegionId !== regionIds[0]) throw createHttpError(400, "Assigned region must match Area Manager branch region");
      return { branchId: null, primaryRegionId: regionIds[0], areaBranchIds: resolvedBranchIds };
    }

    if (normalizedRole === "investor" || normalizedRole === "partner") {
      if (branchId && branchIds.length > 0 && !branchIds.includes(branchId)) {
        throw createHttpError(400, `branchId must be included in branchIds for ${normalizedRole} role`);
      }
      let resolvedBranchIds = branchIds.length > 0 ? branchIds : (branchId ? [branchId] : []);
      if (branchCount) {
        if (resolvedBranchIds.length > 0 && resolvedBranchIds.length !== branchCount) {
          throw createHttpError(400, "branchCount must match the number of provided branchIds");
        }
        if (resolvedBranchIds.length === 0) {
          const candidateBranches = await hierarchyService.getBranches({
            includeInactive: false,
            regionId: primaryRegionId || null,
          });
          const candidateBranchIds = candidateBranches
            .map((branch: Record<string, any>) => Number(branch.id))
            .filter((id: number) => Number.isInteger(id) && id > 0);
          if (candidateBranchIds.length < branchCount) {
            throw createHttpError(400, primaryRegionId
              ? "branchCount exceeds available active branches in the selected region"
              : "branchCount exceeds available active branches");
          }
          resolvedBranchIds = candidateBranchIds.slice(0, branchCount);
        }
      }
      if (resolvedBranchIds.length === 0) {
        throw createHttpError(
          400,
          `${normalizedRole === "investor" ? "Investors" : "Partners"} must be assigned using branchIds, branchId, or branchCount`,
        );
      }
      const branches = await hierarchyService.getBranchesByIds(resolvedBranchIds, { requireActive: true });
      if (branches.length !== resolvedBranchIds.length) throw createHttpError(400, "One or more assigned branches are invalid or inactive");
      if (primaryRegionId) {
        const hasRegionMatch = branches.some((branch: Record<string, any>) => Number(branch.region_id) === primaryRegionId);
        if (!hasRegionMatch) throw createHttpError(400, "Assigned region must match at least one assigned branch");
      } else {
        const regionIds = [...new Set(branches.map((branch: Record<string, any>) => Number(branch.region_id)).filter(Boolean))];
        if (regionIds.length === 1) primaryRegionId = regionIds[0];
      }
      return { branchId: null, primaryRegionId, areaBranchIds: resolvedBranchIds };
    }

    if (branchCount) {
      throw createHttpError(400, "branchCount is only supported for area_manager, investor, and partner roles");
    }
    if (branchIds.length > 0) throw createHttpError(400, "branchIds are only supported for area_manager, investor, and partner roles");
    if (branchId && primaryRegionId && selectedBranch && Number(selectedBranch.region_id) !== primaryRegionId) {
      throw createHttpError(400, "Assigned branch does not belong to the selected region");
    }
    if (!primaryRegionId && selectedBranch) primaryRegionId = Number(selectedBranch.region_id);
    return { branchId, primaryRegionId, areaBranchIds: [] };
  }

  async function countActiveAdmins() {
    const row = await get("SELECT COUNT(*) AS total FROM users WHERE role = 'admin' AND is_active = 1");
    return Number(row?.total || 0);
  }

  async function getAdminContinuityViolation({
    actingUserId,
    targetUser,
    nextRole,
    nextIsActive,
  }: {
    actingUserId: number;
    targetUser: Record<string, any>;
    nextRole: string;
    nextIsActive: number;
  }) {
    if (targetUser.id === actingUserId && nextIsActive !== 1) return { status: 400, message: "You cannot deactivate your own account" };
    if (targetUser.id === actingUserId && targetUser.role === "admin" && nextRole !== "admin") {
      return { status: 400, message: "You cannot remove your own admin role" };
    }
    const targetIsActiveAdmin = targetUser.role === "admin" && targetUser.is_active === 1;
    const remainsActiveAdmin = nextRole === "admin" && nextIsActive === 1;
    if (targetIsActiveAdmin && !remainsActiveAdmin) {
      const activeAdminCount = await countActiveAdmins();
      if (activeAdminCount <= 1) return { status: 409, message: "Operation blocked: at least one active admin must remain" };
    }
    return null;
  }

  async function publishHierarchyEvent(payload: Record<string, unknown>) {
    if (!hierarchyEventService || typeof hierarchyEventService.publishHierarchyEvent !== "function") return;
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

  async function publishDomainEvent(payload: {
    eventType: string;
    aggregateType: string;
    aggregateId: number | null | undefined;
    payload?: Record<string, unknown> | null | undefined;
    metadata?: Record<string, unknown> | null | undefined;
    occurredAt?: string | null | undefined;
  }) {
    if (typeof publishDomainEventFromDeps !== "function") {
      return;
    }
    try {
      await publishDomainEventFromDeps(payload);
    } catch (error) {
      if (logger && typeof logger.error === "function") {
        logger.error("domain_event.publish_failed", {
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

  function parseUserIdOrRespond(req: any, res: any) {
    const userId = parseId(req.params.id);
    if (!userId) {
      res.status(400).json({ message: "Invalid user id" });
      return null;
    }
    return userId;
  }

  registerUserManagementRoutes({
    app,
    authenticate,
    authorize,
    allowedRoles,
    roleCatalog,
    roleListLabel,
    parseUserIdOrRespond,
    fetchUserById,
    sanitizeUserRow,
    resolveRoleAssignments,
    getAdminContinuityViolation,
    hasOwn,
    ensureTokenVersionBump,
    sameIdList,
    sameRoleList,
    invalidateReportCaches,
    publishHierarchyEvent,
    publishDomainEvent,
    hierarchyService,
    normalizeEmail,
    normalizeRoleInput,
    createUserSchema,
    updateUserProfileSchema,
    allocateUserRoleSchema,
    bcrypt,
    issuePasswordResetToken,
    get,
    all,
    run,
    writeAuditLog,
  });
}

export {
  registerUserServiceRoutes,
};
