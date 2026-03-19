import { parsePaginationQuery, parseSortQuery, createPagedResponse } from "../utils/http.js";
import type { UserManagementRouteOptions } from "./userManagementRouteTypes.js";
import { createUserReadRepository } from "../repositories/userReadRepository.js";
import { requirePermission } from "../middleware/permissions.js";
import type { HierarchyScope } from "../types/dataLayer.js";

function isUserVisibleInScope(
  scope: HierarchyScope | null,
  user: Record<string, any> | null | undefined,
  normalizeIds: (values: unknown[]) => number[],
): boolean {
  if (!user) {
    return false;
  }
  if (!scope || scope.level === "hq") {
    return true;
  }

  const scopeBranchIds = normalizeIds(scope.branchIds || []);
  if (scopeBranchIds.length === 0) {
    return false;
  }
  const scopeSet = new Set(scopeBranchIds);

  const directBranchId = Number(user.branch_id || 0);
  if (Number.isInteger(directBranchId) && directBranchId > 0 && scopeSet.has(directBranchId)) {
    return true;
  }

  const assignedBranchIds = normalizeIds(Array.isArray(user.assigned_branch_ids) ? user.assigned_branch_ids : []);
  return assignedBranchIds.some((branchId) => scopeSet.has(branchId));
}

function registerUserReadRoutes(options: UserManagementRouteOptions) {
  const {
    app,
    authenticate,
    authorize,
    allowedRoles,
    roleCatalog,
    roleListLabel,
    parseUserIdOrRespond,
    fetchUserById,
    sanitizeUserRow,
    normalizeRoleInput,
    hierarchyService,
    get,
    all,
  } = options;
  const userReadRepository = createUserReadRepository({ all, get });
  const manageUsersPermission = requirePermission("user.manage");
  const readUsersPermission = requirePermission("user.view");

  app.get("/api/users", authenticate, authorize("admin"), manageUsersPermission, async (req, res, next) => {
    try {
      const rawRole = String(req.query.role || "").trim();
      let normalizedRole: string | undefined;
      if (rawRole) {
        const role = normalizeRoleInput(rawRole);
        if (!allowedRoles.includes(role)) { res.status(400).json({ message: `Invalid role filter. Use ${roleListLabel}` }); return; }
        normalizedRole = role;
      }
      const isActive = String(req.query.isActive || "").trim().toLowerCase();
      let normalizedIsActive: 0 | 1 | undefined;
      if (isActive) {
        if (!["true", "false", "1", "0"].includes(isActive)) { res.status(400).json({ message: "Invalid isActive filter. Use true or false" }); return; }
        normalizedIsActive = ["true", "1"].includes(isActive) ? 1 : 0;
      }
      const branchIdFilter = String(req.query.branchId || "").trim();
      let normalizedBranchId: number | undefined;
      if (branchIdFilter) {
        const branchId = Number(branchIdFilter);
        if (!Number.isInteger(branchId) || branchId <= 0) { res.status(400).json({ message: "Invalid branchId filter" }); return; }
        normalizedBranchId = branchId;
      }
      const regionIdFilter = String(req.query.regionId || "").trim();
      let normalizedRegionId: number | undefined;
      if (regionIdFilter) {
        const regionId = Number(regionIdFilter);
        if (!Number.isInteger(regionId) || regionId <= 0) { res.status(400).json({ message: "Invalid regionId filter" }); return; }
        normalizedRegionId = regionId;
      }
      const search = String(req.query.search || "").trim();
      const { limit, offset } = parsePaginationQuery(req.query, {
        defaultLimit: 50,
        maxLimit: 200,
        requirePagination: true,
        strict: true,
      });
      const { requestedSortBy, sortBy, sortOrder } = parseSortQuery(req.query, {
        sortFieldMap: {
          id: "u.id",
          fullName: "u.full_name",
          email: "u.email",
          role: "u.role",
          isActive: "u.is_active",
          createdAt: "u.created_at",
        },
        defaultSortBy: "id",
        defaultSortOrder: "desc",
        sortByErrorMessage: "Invalid sortBy. Use one of: id, fullName, email, role, isActive, createdAt",
      });
      const scope = await hierarchyService.resolveHierarchyScope(req.user);

      const { rows: usersWithAssignments, total } = await userReadRepository.listUsers({
        scope,
        role: normalizedRole,
        isActive: normalizedIsActive,
        branchId: normalizedBranchId,
        regionId: normalizedRegionId,
        search: search || undefined,
        limit,
        offset,
        sortBy: sortBy as "u.id" | "u.full_name" | "u.email" | "u.role" | "u.is_active" | "u.created_at",
        sortOrder,
      });
      res.status(200).json(
        createPagedResponse({
          data: usersWithAssignments.map((user) => sanitizeUserRow(user)),
          total,
          limit,
          offset,
          sortBy: requestedSortBy,
          sortOrder,
        }),
      );
    } catch (error) { next(error); }
  });

  app.get("/api/users/roles", authenticate, authorize("admin"), manageUsersPermission, async (req, res, next) => {
    try {
      const scope = await hierarchyService.resolveHierarchyScope(req.user);
      const counts = await userReadRepository.listUserRoleCounts(scope);
      const countMap = new Map(counts.map((row) => [row.role, row]));
      const roles = allowedRoles.map((roleKey) => {
        const metadata = roleCatalog[roleKey] || {};
        const aggregate = countMap.get(roleKey);
        return {
          key: roleKey,
          label: metadata.label || roleKey,
          description: metadata.description || "",
          scopeRule: metadata.scopeRule || "",
          capabilities: Array.isArray(metadata.capabilities) ? metadata.capabilities : [],
          assignedUsers: Number(aggregate?.total_users || 0),
          activeUsers: Number(aggregate?.active_users || 0),
        };
      });
      res.status(200).json({ roles });
    } catch (error) { next(error); }
  });

  app.get("/api/users/summary", authenticate, authorize("admin"), manageUsersPermission, async (req, res, next) => {
    try {
      const scope = await hierarchyService.resolveHierarchyScope(req.user);
      const totals = await userReadRepository.getUserSummaryTotals(scope);
      const roleRows = await userReadRepository.listUserRoleCounts(scope);
      const roleCounts = new Map(roleRows.map((row) => [row.role, row]));
      const byRole = allowedRoles.map((roleKey) => ({
        role: roleKey,
        totalUsers: Number(roleCounts.get(roleKey)?.total_users || 0),
        activeUsers: Number(roleCounts.get(roleKey)?.active_users || 0),
      }));
      res.status(200).json({
        totals: {
          totalUsers: Number(totals.total_users || 0),
          activeUsers: Number(totals.active_users || 0),
          inactiveUsers: Number(totals.inactive_users || 0),
          lockedUsers: Number(totals.locked_users || 0),
        },
        byRole,
      });
    } catch (error) { next(error); }
  });

  app.get("/api/users/:id", authenticate, authorize("admin"), manageUsersPermission, async (req, res, next) => {
    try {
      const userId = parseUserIdOrRespond(req, res);
      if (!userId) return;
      const scope = await hierarchyService.resolveHierarchyScope(req.user);
      const user = await fetchUserById(userId);
      if (!user) { res.status(404).json({ message: "User not found" }); return; }
      if (!isUserVisibleInScope(scope, user, hierarchyService.normalizeIds)) {
        res.status(404).json({ message: "User not found" });
        return;
      }
      const roleDetails = roleCatalog[user.role] ? { key: user.role, ...roleCatalog[user.role] } : null;
      const roleKeys = Array.isArray(user.roles) ? user.roles : [];
      const rolesDetails = roleKeys.map((roleKey) => ({
        key: roleKey,
        ...(roleCatalog[roleKey] || {}),
      }));
      res.status(200).json({ ...sanitizeUserRow(user), roleDetails, rolesDetails });
    } catch (error) { next(error); }
  });

  app.get("/api/users/:id/security-state", authenticate, authorize("admin", "it"), readUsersPermission, async (req, res, next) => {
    try {
      const userId = parseUserIdOrRespond(req, res);
      if (!userId) return;

      const scope = await hierarchyService.resolveHierarchyScope(req.user);
      const user = await fetchUserById(userId);
      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }
      if (!isUserVisibleInScope(scope, user, hierarchyService.normalizeIds)) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      const recentActions = await all(
        `
          SELECT
            al.id,
            al.user_id AS actor_user_id,
            actor.full_name AS actor_user_name,
            al.action,
            al.details,
            al.ip_address,
            al.created_at
          FROM audit_logs al
          LEFT JOIN users actor ON actor.id = al.user_id
          WHERE al.target_type = 'user'
            AND al.target_id = ?
            AND (
              LOWER(al.action) LIKE 'auth.%'
              OR LOWER(al.action) LIKE 'user.%'
            )
          ORDER BY al.created_at DESC, al.id DESC
          LIMIT 10
        `,
        [userId],
      );

      const lockedUntil = typeof user.locked_until === "string" && user.locked_until.trim()
        ? user.locked_until
        : null;
      const isLocked = Boolean(lockedUntil && new Date(lockedUntil).getTime() > Date.now());

      res.status(200).json({
        userId,
        email: user.email,
        role: user.role,
        roles: Array.isArray(user.roles) ? user.roles : [],
        isActive: Number(user.is_active) === 1,
        deactivatedAt: user.deactivated_at || null,
        failedLoginAttempts: Number(user.failed_login_attempts || 0),
        lockedUntil,
        isLocked,
        tokenVersion: Number(user.token_version || 0),
        recentActions: recentActions.map((entry) => ({
          id: Number(entry.id || 0),
          actorUserId: entry.actor_user_id == null ? null : Number(entry.actor_user_id),
          actorUserName: entry.actor_user_name || null,
          action: String(entry.action || ""),
          details: entry.details || null,
          ipAddress: entry.ip_address || null,
          createdAt: entry.created_at || null,
        })),
      });
    } catch (error) { next(error); }
  });
}

export {
  registerUserReadRoutes,
};


