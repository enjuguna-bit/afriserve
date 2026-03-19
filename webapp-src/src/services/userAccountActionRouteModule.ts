import type { UserManagementRouteOptions } from "./userManagementRouteTypes.js";
import { requirePermission } from "../middleware/permissions.js";
import { getPermissionCatalog, getRolePermissionMatrix, SUPPORTED_PERMISSION_CODES } from "../services/permissionService.js";
import { invalidateCachedAuthSessionUser } from "../services/authSessionCache.js";
import { applyRbacPolicy } from "../middleware/rbacPolicy.js";
import { replaceUserRoles, resolveAssignedRoles, resolvePrimaryRole } from "./userRoleService.js";

function registerUserAccountActionRoutes(options: UserManagementRouteOptions) {
  const {
    app,
    authenticate,
    authorize,
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
    createUserSchema,
    updateUserProfileSchema,
    allocateUserRoleSchema,
    bcrypt,
    issuePasswordResetToken,
    get,
    all,
    run,
    writeAuditLog,
  } = options;
  const manageUsersPermission = requirePermission("user.manage");
  const manageUserPermissionsPolicy = applyRbacPolicy("users.permission.manage", authorize);
  const branchAssignmentRoles = new Set(["area_manager", "investor", "partner"]);

  async function publishUserDomainEvent(
    eventType: string,
    aggregateId: number | null | undefined,
    actorUserId: number | null | undefined,
    payload: Record<string, unknown>,
  ) {
    await publishDomainEvent({
      eventType,
      aggregateType: "user",
      aggregateId,
      payload,
      metadata: {
        actorUserId: Number.isFinite(Number(actorUserId)) ? Number(actorUserId) : null,
      },
      occurredAt: new Date().toISOString(),
    });
  }

  function supportsBranchAssignments(role: unknown): boolean {
    return branchAssignmentRoles.has(String(role || "").trim().toLowerCase());
  }

  function resolveAssignmentScopeLevel(role: unknown, branchId: unknown, assignedBranchIds: unknown[] = []): "hq" | "region" | "branch" {
    const normalizedRole = String(role || "").trim().toLowerCase();
    if (normalizedRole === "area_manager") {
      return "region";
    }
    if (Number.isInteger(Number(branchId)) && Number(branchId) > 0) {
      return "branch";
    }
    if (supportsBranchAssignments(normalizedRole) && Array.isArray(assignedBranchIds) && assignedBranchIds.length > 0) {
      return "branch";
    }
    return "hq";
  }

  function resolveEventBranchId(branchId: unknown, assignedBranchIds: unknown[] = []): number | null {
    if (Number.isInteger(Number(branchId)) && Number(branchId) > 0) {
      return Number(branchId);
    }
    const fallbackBranchId = Array.isArray(assignedBranchIds) ? Number(assignedBranchIds[0]) : NaN;
    return Number.isInteger(fallbackBranchId) && fallbackBranchId > 0 ? fallbackBranchId : null;
  }

  function parsePermissionId(input: unknown): string | null {
    const rawValue = typeof input === "string" ? input : String(input || "");
    const decoded = decodeURIComponent(rawValue).trim();
    if (!decoded) {
      return null;
    }
    if (!SUPPORTED_PERMISSION_CODES.includes(decoded as any)) {
      return null;
    }
    return decoded;
  }

  app.post("/api/users", authenticate, ...applyRbacPolicy("users.create", authorize), async (req, res, next) => {
    try {
      const payload = createUserSchema.parse(req.body);
      const requestedRoles = resolveAssignedRoles({
        role: payload.role,
        roles: payload.roles,
      });
      const primaryRole = resolvePrimaryRole({
        roles: requestedRoles,
        preferredRole: payload.role,
      });
      if (!primaryRole) {
        res.status(400).json({ message: "At least one valid role is required" });
        return;
      }

      const normalizedEmail = normalizeEmail(payload.email);
      const existingUser = await get("SELECT id FROM users WHERE LOWER(email) = ?", [normalizedEmail]);
      if (existingUser) { res.status(409).json({ message: "A user with this email already exists" }); return; }

      const assignments = await resolveRoleAssignments({
        role: primaryRole,
        branchIdInput: payload.branchId,
        branchIdsInput: payload.branchIds,
        branchCountInput: payload.branchCount,
        primaryRegionIdInput: payload.primaryRegionId,
      });
      const passwordHash = await bcrypt.hash(payload.password, 10);
      const insert = await run(
        `
          INSERT INTO users (full_name, email, password_hash, role, branch_id, primary_region_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `,
        [payload.fullName, normalizedEmail, passwordHash, primaryRole, assignments.branchId, assignments.primaryRegionId],
      );
      const assignedRoles = await replaceUserRoles({
        run,
        userId: Number(insert.lastID),
        roles: requestedRoles,
        primaryRole,
      });
      if (supportsBranchAssignments(primaryRole)) {
        await hierarchyService.replaceAreaManagerAssignments(Number(insert.lastID), assignments.areaBranchIds);
      }
      hierarchyService.invalidateHierarchyCaches({ userId: Number(insert.lastID) });

      await writeAuditLog({
        userId: req.user.sub,
        action: "user.created",
        targetType: "user",
        targetId: insert.lastID,
        details: JSON.stringify({
          email: payload.email,
          role: primaryRole,
          roles: assignedRoles,
          branchId: assignments.branchId,
          primaryRegionId: assignments.primaryRegionId,
          branchIds: assignments.areaBranchIds,
          branchCount: payload.branchCount || null,
        }),
        ipAddress: req.ip,
      });
      await publishHierarchyEvent({
        eventType: "hierarchy.user.assigned",
        scopeLevel: resolveAssignmentScopeLevel(primaryRole, assignments.branchId, assignments.areaBranchIds),
        regionId: assignments.primaryRegionId,
        branchId: resolveEventBranchId(assignments.branchId, assignments.areaBranchIds),
        actorUserId: req.user.sub,
        details: { targetUserId: Number(insert.lastID), role: primaryRole, roles: assignedRoles, branchIds: assignments.areaBranchIds },
      });
      await publishUserDomainEvent("user.created", Number(insert.lastID), req.user.sub, {
        email: normalizedEmail,
        role: primaryRole,
        roles: assignedRoles,
        branchId: assignments.branchId,
        primaryRegionId: assignments.primaryRegionId,
        assignedBranchIds: assignments.areaBranchIds,
      });

      const createdUser = await fetchUserById(Number(insert.lastID));
      res.status(201).json(sanitizeUserRow(createdUser));
    } catch (error) { next(error); }
  });

  app.patch("/api/users/:id/profile", authenticate, ...applyRbacPolicy("users.profile.update", authorize), async (req, res, next) => {
    try {
      const userId = parseUserIdOrRespond(req, res);
      if (!userId) return;

      const payload = updateUserProfileSchema.parse(req.body);
      const user = await fetchUserById(userId);
      if (!user) { res.status(404).json({ message: "User not found" }); return; }

      const nextRole = user.role;
      const nextIsActive = typeof payload.isActive === "boolean" ? (payload.isActive ? 1 : 0) : Number(user.is_active);
      const continuityViolation = await getAdminContinuityViolation({
        actingUserId: req.user.sub,
        targetUser: user,
        nextRole,
        nextIsActive,
      });
      if (continuityViolation) { res.status(continuityViolation.status).json({ message: continuityViolation.message }); return; }

      const setClauses = [];
      const queryParams = [];
      const changedFields: Record<string, unknown> = {};

      if (typeof payload.fullName === "string" && payload.fullName !== user.full_name) {
        setClauses.push("full_name = ?");
        queryParams.push(payload.fullName);
        changedFields.fullName = payload.fullName;
      }

      if (typeof payload.email === "string") {
        const normalized = normalizeEmail(payload.email);
        if (normalized !== user.email) {
          const existingEmail = await get("SELECT id FROM users WHERE LOWER(email) = ? AND id != ?", [normalized, userId]);
          if (existingEmail) { res.status(409).json({ message: "A user with this email already exists" }); return; }
          setClauses.push("email = ?");
          queryParams.push(normalized);
          changedFields.email = normalized;
        }
      }

      if (typeof payload.isActive === "boolean") {
        const activeValue = payload.isActive ? 1 : 0;
        if (activeValue !== Number(user.is_active)) {
          changedFields.isActive = payload.isActive;
          if (activeValue === 1) {
            setClauses.push("is_active = 1", "deactivated_at = NULL");
          } else {
            setClauses.push(
              "is_active = 0",
              "deactivated_at = datetime('now')",
              "failed_login_attempts = 0",
              "locked_until = NULL",
              "token_version = token_version + 1",
            );
          }
        }
      }

      const assignmentTouched = hasOwn(payload, "branchId")
        || hasOwn(payload, "branchIds")
        || hasOwn(payload, "branchCount")
        || hasOwn(payload, "primaryRegionId");
      let nextAreaBranchIds = user.assigned_branch_ids || [];
      let areaAssignmentsChanged = false;
      if (assignmentTouched) {
        const shouldReuseExistingAreaBranchIds = !hasOwn(payload, "branchIds") && !hasOwn(payload, "branchCount");
        const assignment = await resolveRoleAssignments({
          role: user.role,
          branchIdInput: hasOwn(payload, "branchId") ? payload.branchId : user.branch_id,
          branchIdsInput: hasOwn(payload, "branchIds")
            ? payload.branchIds
            : (shouldReuseExistingAreaBranchIds ? user.assigned_branch_ids : undefined),
          branchCountInput: hasOwn(payload, "branchCount") ? payload.branchCount : undefined,
          primaryRegionIdInput: hasOwn(payload, "primaryRegionId") ? payload.primaryRegionId : user.primary_region_id,
        });
        const nextBranchId = assignment.branchId || null;
        const nextRegionId = assignment.primaryRegionId || null;
        nextAreaBranchIds = assignment.areaBranchIds;

        if (nextBranchId !== (user.branch_id || null)) {
          setClauses.push("branch_id = ?");
          queryParams.push(nextBranchId);
          changedFields.branchId = nextBranchId;
          ensureTokenVersionBump(setClauses);
        }
        if (nextRegionId !== (user.primary_region_id || null)) {
          setClauses.push("primary_region_id = ?");
          queryParams.push(nextRegionId);
          changedFields.primaryRegionId = nextRegionId;
          ensureTokenVersionBump(setClauses);
        }
        if (supportsBranchAssignments(user.role)) {
          areaAssignmentsChanged = !sameIdList(user.assigned_branch_ids || [], nextAreaBranchIds);
          if (areaAssignmentsChanged) {
            changedFields.assignedBranchIds = nextAreaBranchIds;
            ensureTokenVersionBump(setClauses);
          }
        }
      }

      if (setClauses.length === 0 && !areaAssignmentsChanged) {
        res.status(200).json({ message: "No profile changes were applied", user: sanitizeUserRow(user) });
        return;
      }

      if (setClauses.length > 0) {
        await run(
          `
            UPDATE users
            SET ${setClauses.join(", ")}
            WHERE id = ?
          `,
          [...queryParams, userId],
        );
        await invalidateCachedAuthSessionUser(userId);
      }

      if (supportsBranchAssignments(user.role) && areaAssignmentsChanged) {
        await hierarchyService.replaceAreaManagerAssignments(userId, nextAreaBranchIds);
      }

      hierarchyService.invalidateHierarchyCaches({ userId });
      await writeAuditLog({
        userId: req.user.sub,
        action: "user.profile.updated",
        targetType: "user",
        targetId: userId,
        details: JSON.stringify(changedFields),
        ipAddress: req.ip,
      });
      if (assignmentTouched) {
        const eventBranchId = hasOwn(changedFields, "branchId")
          ? changedFields.branchId
          : user.branch_id || null;
        const eventAssignedBranchIds = areaAssignmentsChanged ? nextAreaBranchIds : (user.assigned_branch_ids || []);
        await publishHierarchyEvent({
          eventType: "hierarchy.user.assigned",
          scopeLevel: resolveAssignmentScopeLevel(user.role, eventBranchId, eventAssignedBranchIds),
          regionId: changedFields.primaryRegionId ?? user.primary_region_id ?? null,
          branchId: resolveEventBranchId(eventBranchId, eventAssignedBranchIds),
          actorUserId: req.user.sub,
          details: { targetUserId: userId, role: user.role, changedFields },
        });
      }
      await publishUserDomainEvent("user.profile.updated", userId, req.user.sub, {
        changedFields,
      });
      if (hasOwn(changedFields, "fullName") || hasOwn(changedFields, "email")) {
        await invalidateReportCaches();
      }

      const updated = await fetchUserById(userId);
      res.status(200).json({ message: "User profile updated", user: sanitizeUserRow(updated) });
    } catch (error) { next(error); }
  });

  app.put("/api/users/:id", authenticate, ...applyRbacPolicy("users.profile.update", authorize), async (req, res, next) => {
    try {
      const userId = parseUserIdOrRespond(req, res);
      if (!userId) return;

      const payload = updateUserProfileSchema.parse(req.body);
      const user = await fetchUserById(userId);
      if (!user) { res.status(404).json({ message: "User not found" }); return; }

      const nextRole = user.role;
      const nextIsActive = typeof payload.isActive === "boolean" ? (payload.isActive ? 1 : 0) : Number(user.is_active);
      const continuityViolation = await getAdminContinuityViolation({
        actingUserId: req.user.sub,
        targetUser: user,
        nextRole,
        nextIsActive,
      });
      if (continuityViolation) { res.status(continuityViolation.status).json({ message: continuityViolation.message }); return; }

      const setClauses = [];
      const queryParams = [];
      const changedFields: Record<string, unknown> = {};

      if (typeof payload.fullName === "string" && payload.fullName !== user.full_name) {
        setClauses.push("full_name = ?");
        queryParams.push(payload.fullName);
        changedFields.fullName = payload.fullName;
      }

      if (typeof payload.email === "string") {
        const normalized = normalizeEmail(payload.email);
        if (normalized !== user.email) {
          const existingEmail = await get("SELECT id FROM users WHERE LOWER(email) = ? AND id != ?", [normalized, userId]);
          if (existingEmail) { res.status(409).json({ message: "A user with this email already exists" }); return; }
          setClauses.push("email = ?");
          queryParams.push(normalized);
          changedFields.email = normalized;
        }
      }

      if (typeof payload.isActive === "boolean") {
        const activeValue = payload.isActive ? 1 : 0;
        if (activeValue !== Number(user.is_active)) {
          changedFields.isActive = payload.isActive;
          if (activeValue === 1) {
            setClauses.push("is_active = 1", "deactivated_at = NULL");
          } else {
            setClauses.push(
              "is_active = 0",
              "deactivated_at = datetime('now')",
              "failed_login_attempts = 0",
              "locked_until = NULL",
              "token_version = token_version + 1",
            );
          }
        }
      }

      const assignmentTouched = hasOwn(payload, "branchId")
        || hasOwn(payload, "branchIds")
        || hasOwn(payload, "branchCount")
        || hasOwn(payload, "primaryRegionId");
      let nextAreaBranchIds = user.assigned_branch_ids || [];
      let areaAssignmentsChanged = false;
      if (assignmentTouched) {
        const shouldReuseExistingAreaBranchIds = !hasOwn(payload, "branchIds") && !hasOwn(payload, "branchCount");
        const assignment = await resolveRoleAssignments({
          role: user.role,
          branchIdInput: hasOwn(payload, "branchId") ? payload.branchId : user.branch_id,
          branchIdsInput: hasOwn(payload, "branchIds")
            ? payload.branchIds
            : (shouldReuseExistingAreaBranchIds ? user.assigned_branch_ids : undefined),
          branchCountInput: hasOwn(payload, "branchCount") ? payload.branchCount : undefined,
          primaryRegionIdInput: hasOwn(payload, "primaryRegionId") ? payload.primaryRegionId : user.primary_region_id,
        });
        const nextBranchId = assignment.branchId || null;
        const nextRegionId = assignment.primaryRegionId || null;
        nextAreaBranchIds = assignment.areaBranchIds;

        if (nextBranchId !== (user.branch_id || null)) {
          setClauses.push("branch_id = ?");
          queryParams.push(nextBranchId);
          changedFields.branchId = nextBranchId;
          ensureTokenVersionBump(setClauses);
        }
        if (nextRegionId !== (user.primary_region_id || null)) {
          setClauses.push("primary_region_id = ?");
          queryParams.push(nextRegionId);
          changedFields.primaryRegionId = nextRegionId;
          ensureTokenVersionBump(setClauses);
        }
        if (supportsBranchAssignments(user.role)) {
          areaAssignmentsChanged = !sameIdList(user.assigned_branch_ids || [], nextAreaBranchIds);
          if (areaAssignmentsChanged) {
            changedFields.assignedBranchIds = nextAreaBranchIds;
            ensureTokenVersionBump(setClauses);
          }
        }
      }

      if (setClauses.length === 0 && !areaAssignmentsChanged) {
        res.status(200).json({ message: "No profile changes were applied", user: sanitizeUserRow(user) });
        return;
      }

      if (setClauses.length > 0) {
        await run(
          `
            UPDATE users
            SET ${setClauses.join(", ")}
            WHERE id = ?
          `,
          [...queryParams, userId],
        );
        await invalidateCachedAuthSessionUser(userId);
      }

      if (supportsBranchAssignments(user.role) && areaAssignmentsChanged) {
        await hierarchyService.replaceAreaManagerAssignments(userId, nextAreaBranchIds);
      }

      hierarchyService.invalidateHierarchyCaches({ userId });
      await writeAuditLog({
        userId: req.user.sub,
        action: "user.profile.updated",
        targetType: "user",
        targetId: userId,
        details: JSON.stringify(changedFields),
        ipAddress: req.ip,
      });
      if (assignmentTouched) {
        const eventBranchId = hasOwn(changedFields, "branchId")
          ? changedFields.branchId
          : user.branch_id || null;
        const eventAssignedBranchIds = areaAssignmentsChanged ? nextAreaBranchIds : (user.assigned_branch_ids || []);
        await publishHierarchyEvent({
          eventType: "hierarchy.user.assigned",
          scopeLevel: resolveAssignmentScopeLevel(user.role, eventBranchId, eventAssignedBranchIds),
          regionId: changedFields.primaryRegionId ?? user.primary_region_id ?? null,
          branchId: resolveEventBranchId(eventBranchId, eventAssignedBranchIds),
          actorUserId: req.user.sub,
          details: { targetUserId: userId, role: user.role, changedFields },
        });
      }
      await publishUserDomainEvent("user.profile.updated", userId, req.user.sub, {
        changedFields,
      });
      if (hasOwn(changedFields, "fullName") || hasOwn(changedFields, "email")) {
        await invalidateReportCaches();
      }

      const updated = await fetchUserById(userId);
      res.status(200).json({ message: "User profile updated", user: sanitizeUserRow(updated) });
    } catch (error) { next(error); }
  });

  app.patch("/api/users/:id/role", authenticate, ...applyRbacPolicy("users.role.assign", authorize), async (req, res, next) => {
    try {
      const userId = parseUserIdOrRespond(req, res);
      if (!userId) return;

      const payload = allocateUserRoleSchema.parse(req.body);
      const user = await fetchUserById(userId);
      if (!user) { res.status(404).json({ message: "User not found" }); return; }
      const currentRoles = resolveAssignedRoles({
        role: user.role,
        roles: user.roles,
      });
      const requestedRoles = resolveAssignedRoles({
        role: payload.role,
        roles: payload.roles,
        fallbackRole: user.role,
      });
      const nextPrimaryRole = resolvePrimaryRole({
        roles: requestedRoles,
        preferredRole: payload.role,
        fallbackRole: user.role,
      });
      if (!nextPrimaryRole) {
        res.status(400).json({ message: "At least one valid role is required" });
        return;
      }

      const continuityViolation = await getAdminContinuityViolation({
        actingUserId: req.user.sub,
        targetUser: user,
        nextRole: nextPrimaryRole,
        nextIsActive: Number(user.is_active),
      });
      if (continuityViolation) { res.status(continuityViolation.status).json({ message: continuityViolation.message }); return; }

      const assignment = await resolveRoleAssignments({
        role: nextPrimaryRole,
        branchIdInput: hasOwn(payload, "branchId")
          ? payload.branchId
          : (supportsBranchAssignments(nextPrimaryRole) ? null : user.branch_id),
        branchIdsInput: hasOwn(payload, "branchIds")
          ? payload.branchIds
          : ((!hasOwn(payload, "branchCount") && supportsBranchAssignments(nextPrimaryRole)) ? user.assigned_branch_ids : undefined),
        branchCountInput: hasOwn(payload, "branchCount") ? payload.branchCount : undefined,
        primaryRegionIdInput: hasOwn(payload, "primaryRegionId") ? payload.primaryRegionId : user.primary_region_id,
      });
      const unchanged =
        nextPrimaryRole === user.role &&
        sameRoleList(currentRoles, requestedRoles) &&
        (assignment.branchId || null) === (user.branch_id || null) &&
        (assignment.primaryRegionId || null) === (user.primary_region_id || null) &&
        sameIdList(user.assigned_branch_ids || [], assignment.areaBranchIds);
      if (unchanged) {
        res.status(200).json({ message: "User already has this role and hierarchy assignment", user: sanitizeUserRow(user) });
        return;
      }

      await run(
        `
          UPDATE users
          SET role = ?, branch_id = ?, primary_region_id = ?, token_version = token_version + 1
          WHERE id = ?
        `,
        [nextPrimaryRole, assignment.branchId, assignment.primaryRegionId, userId],
      );
      const updatedRoles = await replaceUserRoles({
        run,
        userId,
        roles: requestedRoles,
        primaryRole: nextPrimaryRole,
      });
      await invalidateCachedAuthSessionUser(userId);
      if (supportsBranchAssignments(nextPrimaryRole)) {
        await hierarchyService.replaceAreaManagerAssignments(userId, assignment.areaBranchIds);
      } else {
        await hierarchyService.replaceAreaManagerAssignments(userId, []);
      }

      hierarchyService.invalidateHierarchyCaches({ userId });
      await writeAuditLog({
        userId: req.user.sub,
        action: "user.role.allocated",
        targetType: "user",
        targetId: userId,
        details: JSON.stringify({
          previousRole: user.role,
          previousRoles: currentRoles,
          newRole: nextPrimaryRole,
          newRoles: updatedRoles,
          branchId: assignment.branchId,
          primaryRegionId: assignment.primaryRegionId,
          assignedBranchIds: assignment.areaBranchIds,
        }),
        ipAddress: req.ip,
      });
      await publishHierarchyEvent({
        eventType: "hierarchy.user.assigned",
        scopeLevel: resolveAssignmentScopeLevel(nextPrimaryRole, assignment.branchId, assignment.areaBranchIds),
        regionId: assignment.primaryRegionId,
        branchId: resolveEventBranchId(assignment.branchId, assignment.areaBranchIds),
        actorUserId: req.user.sub,
        details: {
          targetUserId: userId,
          previousRole: user.role,
          previousRoles: currentRoles,
          newRole: nextPrimaryRole,
          newRoles: updatedRoles,
          assignedBranchIds: assignment.areaBranchIds,
        },
      });
      await publishUserDomainEvent("user.role.updated", userId, req.user.sub, {
        previousRole: user.role,
        previousRoles: currentRoles,
        newRole: nextPrimaryRole,
        newRoles: updatedRoles,
        branchId: assignment.branchId,
        primaryRegionId: assignment.primaryRegionId,
        assignedBranchIds: assignment.areaBranchIds,
      });

      const updated = await fetchUserById(userId);
      res.status(200).json({ message: "User role updated", user: sanitizeUserRow(updated) });
    } catch (error) { next(error); }
  });

  app.post("/api/users/:id/roles", authenticate, ...applyRbacPolicy("users.role.assign", authorize), async (req, res, next) => {
    try {
      const userId = parseUserIdOrRespond(req, res);
      if (!userId) return;

      const payload = allocateUserRoleSchema.parse(req.body);
      const user = await fetchUserById(userId);
      if (!user) { res.status(404).json({ message: "User not found" }); return; }
      const currentRoles = resolveAssignedRoles({
        role: user.role,
        roles: user.roles,
      });
      const requestedRoles = resolveAssignedRoles({
        role: payload.role,
        roles: payload.roles,
        fallbackRole: user.role,
      });
      const nextPrimaryRole = resolvePrimaryRole({
        roles: requestedRoles,
        preferredRole: payload.role,
        fallbackRole: user.role,
      });
      if (!nextPrimaryRole) {
        res.status(400).json({ message: "At least one valid role is required" });
        return;
      }

      const continuityViolation = await getAdminContinuityViolation({
        actingUserId: req.user.sub,
        targetUser: user,
        nextRole: nextPrimaryRole,
        nextIsActive: Number(user.is_active),
      });
      if (continuityViolation) { res.status(continuityViolation.status).json({ message: continuityViolation.message }); return; }

      const assignment = await resolveRoleAssignments({
        role: nextPrimaryRole,
        branchIdInput: hasOwn(payload, "branchId")
          ? payload.branchId
          : (supportsBranchAssignments(nextPrimaryRole) ? null : user.branch_id),
        branchIdsInput: hasOwn(payload, "branchIds")
          ? payload.branchIds
          : ((!hasOwn(payload, "branchCount") && supportsBranchAssignments(nextPrimaryRole)) ? user.assigned_branch_ids : undefined),
        branchCountInput: hasOwn(payload, "branchCount") ? payload.branchCount : undefined,
        primaryRegionIdInput: hasOwn(payload, "primaryRegionId") ? payload.primaryRegionId : user.primary_region_id,
      });
      const unchanged =
        nextPrimaryRole === user.role &&
        sameRoleList(currentRoles, requestedRoles) &&
        (assignment.branchId || null) === (user.branch_id || null) &&
        (assignment.primaryRegionId || null) === (user.primary_region_id || null) &&
        sameIdList(user.assigned_branch_ids || [], assignment.areaBranchIds);
      if (unchanged) {
        res.status(200).json({ message: "User already has this role and hierarchy assignment", user: sanitizeUserRow(user) });
        return;
      }

      await run(
        `
          UPDATE users
          SET role = ?, branch_id = ?, primary_region_id = ?, token_version = token_version + 1
          WHERE id = ?
        `,
        [nextPrimaryRole, assignment.branchId, assignment.primaryRegionId, userId],
      );
      const updatedRoles = await replaceUserRoles({
        run,
        userId,
        roles: requestedRoles,
        primaryRole: nextPrimaryRole,
      });
      await invalidateCachedAuthSessionUser(userId);
      if (supportsBranchAssignments(nextPrimaryRole)) {
        await hierarchyService.replaceAreaManagerAssignments(userId, assignment.areaBranchIds);
      } else {
        await hierarchyService.replaceAreaManagerAssignments(userId, []);
      }

      hierarchyService.invalidateHierarchyCaches({ userId });
      await writeAuditLog({
        userId: req.user.sub,
        action: "user.role.allocated",
        targetType: "user",
        targetId: userId,
        details: JSON.stringify({
          previousRole: user.role,
          previousRoles: currentRoles,
          nextRole: nextPrimaryRole,
          nextRoles: updatedRoles,
          branchId: assignment.branchId,
          primaryRegionId: assignment.primaryRegionId,
          assignedBranchIds: assignment.areaBranchIds,
        }),
        ipAddress: req.ip,
      });
      await publishHierarchyEvent({
        eventType: "hierarchy.user.assigned",
        scopeLevel: resolveAssignmentScopeLevel(nextPrimaryRole, assignment.branchId, assignment.areaBranchIds),
        regionId: assignment.primaryRegionId,
        branchId: resolveEventBranchId(assignment.branchId, assignment.areaBranchIds),
        actorUserId: req.user.sub,
        details: { targetUserId: userId, role: nextPrimaryRole, roles: updatedRoles, branchIds: assignment.areaBranchIds },
      });
      await publishUserDomainEvent("user.role.updated", userId, req.user.sub, {
        previousRole: user.role,
        previousRoles: currentRoles,
        nextRole: nextPrimaryRole,
        nextRoles: updatedRoles,
        branchId: assignment.branchId,
        primaryRegionId: assignment.primaryRegionId,
        assignedBranchIds: assignment.areaBranchIds,
      });

      const updated = await fetchUserById(userId);
      res.status(200).json({ message: "User role updated", user: sanitizeUserRow(updated) });
    } catch (error) { next(error); }
  });

  app.post("/api/users/:id/revoke-sessions", authenticate, authorize("admin"), manageUsersPermission, async (req, res, next) => {
    try {
      const userId = parseUserIdOrRespond(req, res);
      if (!userId) return;
      const user = await fetchUserById(userId);
      if (!user) { res.status(404).json({ message: "User not found" }); return; }
      await run("UPDATE users SET token_version = token_version + 1 WHERE id = ?", [userId]);
      await invalidateCachedAuthSessionUser(userId);
      hierarchyService.invalidateHierarchyCaches({ userId });
      await writeAuditLog({
        userId: req.user.sub,
        action: "user.sessions.revoked",
        targetType: "user",
        targetId: userId,
        details: JSON.stringify({ email: user.email }),
        ipAddress: req.ip,
      });
      await publishUserDomainEvent("user.sessions.revoked", userId, req.user.sub, {
        email: user.email,
      });
      const updated = await fetchUserById(userId);
      res.status(200).json({ message: "User sessions revoked", user: sanitizeUserRow(updated) });
    } catch (error) { next(error); }
  });

  app.post("/api/users/:id/unlock", authenticate, authorize("admin"), manageUsersPermission, async (req, res, next) => {
    try {
      const userId = parseUserIdOrRespond(req, res);
      if (!userId) return;
      const user = await fetchUserById(userId);
      if (!user) { res.status(404).json({ message: "User not found" }); return; }
      await run("UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?", [userId]);
      await writeAuditLog({
        userId: req.user.sub,
        action: "user.unlocked",
        targetType: "user",
        targetId: userId,
        details: JSON.stringify({ email: user.email, previousFailedAttempts: user.failed_login_attempts }),
        ipAddress: req.ip,
      });
      await publishUserDomainEvent("user.unlocked", userId, req.user.sub, {
        email: user.email,
        previousFailedAttempts: user.failed_login_attempts,
      });
      const updated = await fetchUserById(userId);
      res.status(200).json({ message: "User account unlocked", user: sanitizeUserRow(updated) });
    } catch (error) { next(error); }
  });

  app.post("/api/users/:id/reset-token", authenticate, authorize("admin"), manageUsersPermission, async (req, res, next) => {
    try {
      const userId = parseUserIdOrRespond(req, res);
      if (!userId) return;
      const user = await fetchUserById(userId);
      if (!user) { res.status(404).json({ message: "User not found" }); return; }
      if (user.is_active !== 1) { res.status(400).json({ message: "Cannot generate reset token for inactive user" }); return; }
      const reset = await issuePasswordResetToken({
        userId,
        userEmail: user.email,
        ipAddress: req.ip,
        requestedByUserId: req.user.sub,
        requestedBy: "admin",
      });
      res.status(200).json({
        message: "Password reset has been initiated for the user",
        expiresAt: reset.expiresAt,
        note: "Token is not returned in API responses.",
      });
    } catch (error) { next(error); }
  });

  app.get("/api/permissions/catalog", authenticate, ...manageUserPermissionsPolicy, async (_req, res, next) => {
    try {
      const rolePermissionMatrix = getRolePermissionMatrix();
      const permissions = getPermissionCatalog()
        .map((permission) => ({
          permission_id: permission.permissionId,
          description: permission.description,
          default_roles: Object.entries(rolePermissionMatrix)
            .filter(([, permissionIds]) => permissionIds.includes(permission.permissionId))
            .map(([role]) => role)
            .sort((left, right) => left.localeCompare(right)),
        }))
        .sort((left, right) => left.permission_id.localeCompare(right.permission_id));

      res.status(200).json({ permissions });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/users/:id/permissions", authenticate, ...manageUserPermissionsPolicy, async (req, res, next) => {
    try {
      const userId = parseUserIdOrRespond(req, res);
      if (!userId) {
        return;
      }

      const user = await fetchUserById(userId);
      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      const userRoles = resolveAssignedRoles({
        role: user.role,
        roles: user.roles,
      });
      const rolePermissions = userRoles.length > 0
        ? await all(
          `
            SELECT
              rp.permission_id,
              p.description,
              MIN(rp.created_at) AS created_at
            FROM role_permissions rp
            INNER JOIN permissions p ON p.permission_id = rp.permission_id
            WHERE rp.role IN (${userRoles.map(() => "?").join(", ")})
            GROUP BY rp.permission_id, p.description
            ORDER BY rp.permission_id ASC
          `,
          userRoles,
        )
        : [];

      const customPermissions = await all(
        `
          SELECT
            ucp.permission_id,
            p.description,
            ucp.granted_at,
            ucp.granted_by_user_id,
            grantor.full_name AS granted_by_user_name
          FROM user_custom_permissions ucp
          INNER JOIN permissions p ON p.permission_id = ucp.permission_id
          LEFT JOIN users grantor ON grantor.id = ucp.granted_by_user_id
          WHERE ucp.user_id = ?
          ORDER BY ucp.permission_id ASC
        `,
        [userId],
      );

      const effectivePermissions = [...new Set([
        ...rolePermissions.map((entry) => String(entry.permission_id || "").trim()).filter(Boolean),
        ...customPermissions.map((entry) => String(entry.permission_id || "").trim()).filter(Boolean),
      ])].sort((left: string, right: string) => left.localeCompare(right));

      res.status(200).json({
        userId,
        role: user.role,
        roles: userRoles,
        rolePermissions,
        customPermissions,
        effectivePermissions,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/users/:id/permissions", authenticate, ...manageUserPermissionsPolicy, async (req, res, next) => {
    try {
      const userId = parseUserIdOrRespond(req, res);
      if (!userId) {
        return;
      }

      const user = await fetchUserById(userId);
      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      const permissionId = parsePermissionId(req.body?.permissionId);
      if (!permissionId) {
        res.status(400).json({
          message: "Invalid permissionId",
          allowedPermissionIds: SUPPORTED_PERMISSION_CODES,
        });
        return;
      }

      const alreadyGranted = await get(
        `
          SELECT permission_id
          FROM user_custom_permissions
          WHERE user_id = ? AND permission_id = ?
          LIMIT 1
        `,
        [userId, permissionId],
      );

      if (alreadyGranted) {
        res.status(200).json({
          message: "Permission already granted",
          userId,
          permissionId,
        });
        return;
      }

      await run(
        `
          INSERT INTO user_custom_permissions (user_id, permission_id, granted_at, granted_by_user_id)
          VALUES (?, ?, datetime('now'), ?)
        `,
        [userId, permissionId, req.user.sub],
      );

      await run("UPDATE users SET token_version = token_version + 1 WHERE id = ?", [userId]);
      await invalidateCachedAuthSessionUser(userId);
      hierarchyService.invalidateHierarchyCaches({ userId });

      await writeAuditLog({
        userId: req.user.sub,
        action: "user.permission.granted",
        targetType: "user",
        targetId: userId,
        details: JSON.stringify({ permissionId, grantedByUserId: req.user.sub }),
        ipAddress: req.ip,
      });
      await publishUserDomainEvent("user.permission.granted", userId, req.user.sub, {
        permissionId,
      });

      res.status(201).json({
        message: "Permission granted",
        userId,
        permissionId,
      });
    } catch (error) {
      next(error);
    }
  });

  app.delete(
    "/api/users/:id/permissions/:permissionId",
    authenticate,
    ...manageUserPermissionsPolicy,
    async (req, res, next) => {
      try {
        const userId = parseUserIdOrRespond(req, res);
        if (!userId) {
          return;
        }

        const user = await fetchUserById(userId);
        if (!user) {
          res.status(404).json({ message: "User not found" });
          return;
        }

        const permissionId = parsePermissionId(req.params.permissionId);
        if (!permissionId) {
          res.status(400).json({
            message: "Invalid permissionId",
            allowedPermissionIds: SUPPORTED_PERMISSION_CODES,
          });
          return;
        }

        const deleteResult = await run(
          "DELETE FROM user_custom_permissions WHERE user_id = ? AND permission_id = ?",
          [userId, permissionId],
        );
        if (Number(deleteResult?.changes || 0) === 0) {
          res.status(404).json({ message: "Permission not found for user" });
          return;
        }

        await run("UPDATE users SET token_version = token_version + 1 WHERE id = ?", [userId]);
        await invalidateCachedAuthSessionUser(userId);
        hierarchyService.invalidateHierarchyCaches({ userId });

        await writeAuditLog({
          userId: req.user.sub,
          action: "user.permission.revoked",
          targetType: "user",
          targetId: userId,
          details: JSON.stringify({ permissionId, revokedByUserId: req.user.sub }),
          ipAddress: req.ip,
        });
        await publishUserDomainEvent("user.permission.revoked", userId, req.user.sub, {
          permissionId,
        });

        res.status(200).json({
          message: "Permission revoked",
          userId,
          permissionId,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post("/api/users/:id/deactivate", authenticate, authorize("admin"), manageUsersPermission, async (req, res, next) => {
    try {
      const userId = parseUserIdOrRespond(req, res);
      if (!userId) return;
      const user = await fetchUserById(userId);
      if (!user) { res.status(404).json({ message: "User not found" }); return; }
      const continuityViolation = await getAdminContinuityViolation({
        actingUserId: req.user.sub,
        targetUser: user,
        nextRole: user.role,
        nextIsActive: 0,
      });
      if (continuityViolation) { res.status(continuityViolation.status).json({ message: continuityViolation.message }); return; }
      if (user.is_active !== 1) { res.status(200).json({ message: "User is already inactive", user: sanitizeUserRow(user) }); return; }

      const updateResult = await run(
        "UPDATE users SET is_active = 0, deactivated_at = datetime('now'), failed_login_attempts = 0, locked_until = NULL, token_version = token_version + 1 WHERE id = ? AND is_active = 1",
        [userId],
      );
      if (Number(updateResult?.changes || 0) === 0) {
        const current = await fetchUserById(userId);
        if (!current) {
          res.status(404).json({ message: "User not found" });
          return;
        }
        res.status(200).json({ message: "User is already inactive", user: sanitizeUserRow(current) });
        return;
      }
      await invalidateCachedAuthSessionUser(userId);
      hierarchyService.invalidateHierarchyCaches({ userId });
      await writeAuditLog({
        userId: req.user.sub,
        action: "user.deactivated",
        targetType: "user",
        targetId: userId,
        details: JSON.stringify({ email: user.email }),
        ipAddress: req.ip,
      });
      await publishUserDomainEvent("user.deactivated", userId, req.user.sub, {
        email: user.email,
      });
      const updated = await fetchUserById(userId);
      res.status(200).json({ message: "User deactivated", user: sanitizeUserRow(updated) });
    } catch (error) { next(error); }
  });

  app.post("/api/users/:id/activate", authenticate, authorize("admin"), manageUsersPermission, async (req, res, next) => {
    try {
      const userId = parseUserIdOrRespond(req, res);
      if (!userId) return;
      const user = await fetchUserById(userId);
      if (!user) { res.status(404).json({ message: "User not found" }); return; }
      if (user.is_active === 1) { res.status(200).json({ message: "User is already active", user: sanitizeUserRow(user) }); return; }

      await run("UPDATE users SET is_active = 1, deactivated_at = NULL WHERE id = ?", [userId]);
      await invalidateCachedAuthSessionUser(userId);
      hierarchyService.invalidateHierarchyCaches({ userId });
      await writeAuditLog({
        userId: req.user.sub,
        action: "user.activated",
        targetType: "user",
        targetId: userId,
        details: JSON.stringify({ email: user.email }),
        ipAddress: req.ip,
      });
      await publishUserDomainEvent("user.activated", userId, req.user.sub, {
        email: user.email,
      });
      const updated = await fetchUserById(userId);
      res.status(200).json({ message: "User activated", user: sanitizeUserRow(updated) });
    } catch (error) { next(error); }
  });

  app.delete("/api/users/:id", authenticate, authorize("admin"), manageUsersPermission, async (req, res, next) => {
    try {
      const userId = parseUserIdOrRespond(req, res);
      if (!userId) return;
      const user = await fetchUserById(userId);
      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      const continuityViolation = await getAdminContinuityViolation({
        actingUserId: req.user.sub,
        targetUser: user,
        nextRole: user.role,
        nextIsActive: 0,
      });
      if (continuityViolation) {
        res.status(continuityViolation.status).json({ message: continuityViolation.message });
        return;
      }

      if (user.is_active !== 1) {
        res.status(200).json({ message: "User is already deactivated", user: sanitizeUserRow(user) });
        return;
      }

      await run("DELETE FROM password_resets WHERE user_id = ?", [userId]);
      await run(
        "UPDATE users SET is_active = 0, deactivated_at = datetime('now'), failed_login_attempts = 0, locked_until = NULL, token_version = token_version + 1 WHERE id = ?",
        [userId],
      );
      await invalidateCachedAuthSessionUser(userId);

      hierarchyService.invalidateHierarchyCaches({ userId });

      await writeAuditLog({
        userId: req.user.sub,
        action: "user.soft_deleted",
        targetType: "user",
        targetId: userId,
        details: JSON.stringify({
          email: user.email,
          role: user.role,
          branchId: user.branch_id || null,
          primaryRegionId: user.primary_region_id || null,
          assignedBranchIds: user.assigned_branch_ids || [],
          permanent: false,
        }),
        ipAddress: req.ip,
      });
      await publishHierarchyEvent({
        eventType: "hierarchy.user.deactivated",
        scopeLevel: resolveAssignmentScopeLevel(user.role, user.branch_id || null, user.assigned_branch_ids || []),
        regionId: user.primary_region_id || null,
        branchId: resolveEventBranchId(user.branch_id || null, user.assigned_branch_ids || []),
        actorUserId: req.user.sub,
        details: {
          deactivatedUserId: userId,
          role: user.role,
          email: user.email,
        },
      });
      await publishUserDomainEvent("user.soft_deleted", userId, req.user.sub, {
        email: user.email,
        role: user.role,
        branchId: user.branch_id || null,
        primaryRegionId: user.primary_region_id || null,
        assignedBranchIds: user.assigned_branch_ids || [],
      });
      await invalidateReportCaches();

      const updated = await fetchUserById(userId);
      res.status(200).json({ message: "User deactivated", user: sanitizeUserRow(updated) });
    } catch (error) { next(error); }
  });
}

export {
  registerUserAccountActionRoutes,
};
