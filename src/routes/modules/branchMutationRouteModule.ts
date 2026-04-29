import type { BranchManagementRouteOptions } from "./branchManagementRouteTypes.js";
import { getCurrentTenantId } from "../../utils/tenantStore.js";

const SQLITE_NOW_ISO = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

function registerBranchMutationRoutes(options: BranchManagementRouteOptions) {
  const {
    app,
    authenticate,
    authorize,
    parseId,
    createBranchSchema,
    updateBranchSchema,
    hierarchyService,
    run,
    get,
    all,
    writeAuditLog,
    normalizeBranchCode,
    ensureUniqueBranchCode,
    getBranchDeletionDependencies,
    hasDeletionDependencies,
    publishHierarchyEvent,
    invalidateReportCaches,
  } = options;

  async function getAreaManagerRegionMoveConflicts(branchId: number, nextRegionId: number): Promise<number[]> {
    const rows = await all(
      `
        SELECT
          amba.user_id,
          b.region_id
        FROM area_manager_branch_assignments amba
        INNER JOIN users u ON u.id = amba.user_id
        INNER JOIN branches b ON b.id = amba.branch_id
        WHERE amba.user_id IN (
          SELECT amba_inner.user_id
          FROM area_manager_branch_assignments amba_inner
          INNER JOIN users u_inner ON u_inner.id = amba_inner.user_id
          WHERE amba_inner.branch_id = ?
            AND u_inner.role = 'area_manager'
        )
          AND u.role = 'area_manager'
          AND b.id != ?
      `,
      [branchId, branchId],
    );

    const regionsByUserId = new Map<number, Set<number>>();
    for (const row of rows) {
      const userId = Number(row.user_id || 0);
      const regionId = Number(row.region_id || 0);
      if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(regionId) || regionId <= 0) {
        continue;
      }
      if (!regionsByUserId.has(userId)) {
        regionsByUserId.set(userId, new Set<number>());
      }
      regionsByUserId.get(userId)?.add(regionId);
    }

    const conflictingUserIds: number[] = [];
    regionsByUserId.forEach((regionSet, userId) => {
      regionSet.add(nextRegionId);
      if (regionSet.size > 1) {
        conflictingUserIds.push(userId);
      }
    });

    return conflictingUserIds.sort((left, right) => left - right);
  }

  app.post("/api/branches", authenticate, authorize("admin"), async (req, res, next) => {
    try {
      const payload = createBranchSchema.parse(req.body);
      const region = await hierarchyService.getRegionById(payload.regionId);
      if (!region || Number(region.is_active) !== 1) {
        res.status(400).json({ message: "Selected region was not found or is inactive" });
        return;
      }

      const code = await ensureUniqueBranchCode(payload.branchCode || `${payload.town}-${payload.county}`);
      const insert = await run(
        `
          INSERT INTO branches (
            tenant_id,
            name,
            code,
            location_address,
            county,
            town,
            contact_phone,
            contact_email,
            region_id,
            is_active,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ${SQLITE_NOW_ISO}, ${SQLITE_NOW_ISO})
        `,
        [
          getCurrentTenantId(),
          payload.name,
          code,
          payload.locationAddress,
          payload.county,
          payload.town,
          payload.contactPhone || null,
          payload.contactEmail || null,
          payload.regionId,
        ],
      );

      hierarchyService.invalidateHierarchyCaches();
      const createdBranch = await hierarchyService.getBranchById(Number(insert.lastID), { requireActive: false });

      await writeAuditLog({
        userId: req.user.sub,
        action: "branch.created",
        targetType: "branch",
        targetId: insert.lastID,
        details: JSON.stringify({ code, regionId: payload.regionId, name: payload.name }),
        ipAddress: req.ip,
      });
      await publishHierarchyEvent({
        eventType: "hierarchy.branch.created",
        scopeLevel: "branch",
        regionId: payload.regionId,
        branchId: insert.lastID,
        actorUserId: req.user.sub,
        details: { name: payload.name, code },
      });
      await invalidateReportCaches();

      res.status(201).json(createdBranch);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/branches/:id", authenticate, authorize("admin"), async (req, res, next) => {
    try {
      const branchId = parseId(req.params.id);
      if (!branchId) {
        res.status(400).json({ message: "Invalid branch id" });
        return;
      }
      const payload = updateBranchSchema.parse(req.body);
      const existing = await hierarchyService.getBranchById(branchId, { requireActive: false });
      if (!existing) {
        res.status(404).json({ message: "Branch not found" });
        return;
      }
      const isDeactivationRequested = payload.isActive === false && Number(existing.is_active) === 1;
      if (isDeactivationRequested) {
        const activeUsers = await get("SELECT COUNT(*) AS total FROM users WHERE branch_id = ? AND is_active = 1", [branchId]);
        if (Number(activeUsers?.total || 0) > 0) {
          res.status(409).json({ message: "Cannot deactivate branch while active users are assigned" });
          return;
        }
      }

      const setClauses = [];
      const params = [];
      const changes: Record<string, unknown> = {};

      if (typeof payload.name === "string" && payload.name !== existing.name) {
        setClauses.push("name = ?");
        params.push(payload.name);
        changes.name = payload.name;
      }
      if (typeof payload.locationAddress === "string" && payload.locationAddress !== existing.location_address) {
        setClauses.push("location_address = ?");
        params.push(payload.locationAddress);
        changes.locationAddress = payload.locationAddress;
      }
      if (typeof payload.county === "string" && payload.county !== existing.county) {
        setClauses.push("county = ?");
        params.push(payload.county);
        changes.county = payload.county;
      }
      if (typeof payload.town === "string" && payload.town !== existing.town) {
        setClauses.push("town = ?");
        params.push(payload.town);
        changes.town = payload.town;
      }
      if (typeof payload.contactPhone !== "undefined") {
        const nextPhone = payload.contactPhone || null;
        if (nextPhone !== (existing.contact_phone || null)) {
          setClauses.push("contact_phone = ?");
          params.push(nextPhone);
          changes.contactPhone = nextPhone;
        }
      }
      if (typeof payload.contactEmail !== "undefined") {
        const nextEmail = payload.contactEmail || null;
        if (nextEmail !== (existing.contact_email || null)) {
          setClauses.push("contact_email = ?");
          params.push(nextEmail);
          changes.contactEmail = nextEmail;
        }
      }
      if (typeof payload.isActive === "boolean") {
        const nextActive = payload.isActive ? 1 : 0;
        if (nextActive !== Number(existing.is_active)) {
          setClauses.push("is_active = ?");
          params.push(nextActive);
          changes.isActive = payload.isActive;
        }
      }
      if (typeof payload.regionId !== "undefined" && Number(payload.regionId) !== Number(existing.region_id)) {
        const region = await hierarchyService.getRegionById(payload.regionId);
        if (!region || Number(region.is_active) !== 1) {
          res.status(400).json({ message: "Selected region was not found or is inactive" });
          return;
        }
        const conflictingAreaManagerIds = await getAreaManagerRegionMoveConflicts(branchId, Number(payload.regionId));
        if (conflictingAreaManagerIds.length > 0) {
          res.status(409).json({
            message: "Cannot move branch to the selected region because assigned area manager scopes would span multiple regions",
            conflictingAreaManagerIds,
          });
          return;
        }
        setClauses.push("region_id = ?");
        params.push(payload.regionId);
        changes.regionId = payload.regionId;
      }
      if (typeof payload.branchCode === "string") {
        const normalizedCode = normalizeBranchCode(payload.branchCode);
        if (!normalizedCode) {
          res.status(400).json({ message: "Invalid branch code" });
          return;
        }
        if (normalizedCode !== existing.code) {
          const duplicate = await get("SELECT id FROM branches WHERE code = ? AND id != ? AND tenant_id = ?", [normalizedCode, branchId, getCurrentTenantId()]);
          if (duplicate) {
            res.status(409).json({ message: "Branch code already exists" });
            return;
          }
          setClauses.push("code = ?");
          params.push(normalizedCode);
          changes.code = normalizedCode;
        }
      }

      if (setClauses.length === 0) {
        res.status(200).json({ message: "No branch changes were applied", branch: existing });
        return;
      }

      setClauses.push(`updated_at = ${SQLITE_NOW_ISO}`);
      await run(
        `
          UPDATE branches
          SET ${setClauses.join(", ")}
          WHERE id = ?
        `,
        [...params, branchId],
      );
      if (isDeactivationRequested) {
        const assignmentCount = await get(
          "SELECT COUNT(*) AS total FROM area_manager_branch_assignments WHERE branch_id = ?",
          [branchId],
        );
        const removedAssignments = Number(assignmentCount?.total || 0);
        if (removedAssignments > 0) {
          await run("DELETE FROM area_manager_branch_assignments WHERE branch_id = ?", [branchId]);
          changes.removedBranchAssignments = removedAssignments;
        }
      }

      hierarchyService.invalidateHierarchyCaches();
      const updated = await hierarchyService.getBranchById(branchId, { requireActive: false });
      if (!updated) {
        res.status(500).json({ message: "Branch update could not be verified" });
        return;
      }
      await writeAuditLog({
        userId: req.user.sub,
        action: "branch.updated",
        targetType: "branch",
        targetId: branchId,
        details: JSON.stringify(changes),
        ipAddress: req.ip,
      });
      await publishHierarchyEvent({
        eventType: "hierarchy.branch.updated",
        scopeLevel: "branch",
        regionId: updated.region_id,
        branchId,
        actorUserId: req.user.sub,
        details: changes,
      });
      await invalidateReportCaches();

      res.status(200).json({ message: "Branch updated", branch: updated });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/branches/:id", authenticate, authorize("admin"), async (req, res, next) => {
    try {
      const branchId = parseId(req.params.id);
      if (!branchId) {
        res.status(400).json({ message: "Invalid branch id" });
        return;
      }
      const payload = updateBranchSchema.parse(req.body);
      const existing = await hierarchyService.getBranchById(branchId, { requireActive: false });
      if (!existing) {
        res.status(404).json({ message: "Branch not found" });
        return;
      }
      const isDeactivationRequested = payload.isActive === false && Number(existing.is_active) === 1;
      if (isDeactivationRequested) {
        const activeUsers = await get("SELECT COUNT(*) AS total FROM users WHERE branch_id = ? AND is_active = 1", [branchId]);
        if (Number(activeUsers?.total || 0) > 0) {
          res.status(409).json({ message: "Cannot deactivate branch while active users are assigned" });
          return;
        }
      }

      const setClauses = [];
      const params = [];
      const changes: Record<string, unknown> = {};

      if (typeof payload.name === "string" && payload.name !== existing.name) {
        setClauses.push("name = ?");
        params.push(payload.name);
        changes.name = payload.name;
      }
      if (typeof payload.locationAddress === "string" && payload.locationAddress !== existing.location_address) {
        setClauses.push("location_address = ?");
        params.push(payload.locationAddress);
        changes.locationAddress = payload.locationAddress;
      }
      if (typeof payload.county === "string" && payload.county !== existing.county) {
        setClauses.push("county = ?");
        params.push(payload.county);
        changes.county = payload.county;
      }
      if (typeof payload.town === "string" && payload.town !== existing.town) {
        setClauses.push("town = ?");
        params.push(payload.town);
        changes.town = payload.town;
      }
      if (typeof payload.contactPhone !== "undefined") {
        const nextPhone = payload.contactPhone || null;
        if (nextPhone !== (existing.contact_phone || null)) {
          setClauses.push("contact_phone = ?");
          params.push(nextPhone);
          changes.contactPhone = nextPhone;
        }
      }
      if (typeof payload.contactEmail !== "undefined") {
        const nextEmail = payload.contactEmail || null;
        if (nextEmail !== (existing.contact_email || null)) {
          setClauses.push("contact_email = ?");
          params.push(nextEmail);
          changes.contactEmail = nextEmail;
        }
      }
      if (typeof payload.isActive === "boolean") {
        const nextActive = payload.isActive ? 1 : 0;
        if (nextActive !== Number(existing.is_active)) {
          setClauses.push("is_active = ?");
          params.push(nextActive);
          changes.isActive = payload.isActive;
        }
      }
      if (typeof payload.regionId !== "undefined" && Number(payload.regionId) !== Number(existing.region_id)) {
        const region = await hierarchyService.getRegionById(payload.regionId);
        if (!region || Number(region.is_active) !== 1) {
          res.status(400).json({ message: "Selected region was not found or is inactive" });
          return;
        }
        const conflictingAreaManagerIds = await getAreaManagerRegionMoveConflicts(branchId, Number(payload.regionId));
        if (conflictingAreaManagerIds.length > 0) {
          res.status(409).json({
            message: "Cannot move branch to the selected region because assigned area manager scopes would span multiple regions",
            conflictingAreaManagerIds,
          });
          return;
        }
        setClauses.push("region_id = ?");
        params.push(payload.regionId);
        changes.regionId = payload.regionId;
      }
      if (typeof payload.branchCode === "string") {
        const normalizedCode = normalizeBranchCode(payload.branchCode);
        if (!normalizedCode) {
          res.status(400).json({ message: "Invalid branch code" });
          return;
        }
        if (normalizedCode !== existing.code) {
          const duplicate = await get("SELECT id FROM branches WHERE code = ? AND id != ? AND tenant_id = ?", [normalizedCode, branchId, getCurrentTenantId()]);
          if (duplicate) {
            res.status(409).json({ message: "Branch code already exists" });
            return;
          }
          setClauses.push("code = ?");
          params.push(normalizedCode);
          changes.code = normalizedCode;
        }
      }

      if (setClauses.length === 0) {
        res.status(200).json({ message: "No branch changes were applied", branch: existing });
        return;
      }

      setClauses.push(`updated_at = ${SQLITE_NOW_ISO}`);
      await run(
        `
          UPDATE branches
          SET ${setClauses.join(", ")}
          WHERE id = ?
        `,
        [...params, branchId],
      );

      hierarchyService.invalidateHierarchyCaches();
      const updatedBranch = await hierarchyService.getBranchById(branchId, { requireActive: false });

      await writeAuditLog({
        userId: req.user.sub,
        action: "branch.updated",
        targetType: "branch",
        targetId: branchId,
        details: JSON.stringify(changes),
        ipAddress: req.ip,
      });
      await publishHierarchyEvent({
        eventType: "hierarchy.branch.updated",
        scopeLevel: "branch",
        regionId: updatedBranch?.region_id || existing.region_id,
        branchId,
        actorUserId: req.user.sub,
        details: changes,
      });
      await invalidateReportCaches();

      res.status(200).json({ message: "Branch updated", branch: updatedBranch });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/branches/:id", authenticate, authorize("admin"), async (req, res, next) => {
    try {
      const branchId = parseId(req.params.id);
      if (!branchId) {
        res.status(400).json({ message: "Invalid branch id" });
        return;
      }
      const branch = await hierarchyService.getBranchById(branchId, { requireActive: false });
      if (!branch) {
        res.status(404).json({ message: "Branch not found" });
        return;
      }
      const activeUsers = await get(
        "SELECT COUNT(*) AS total FROM users WHERE branch_id = ? AND is_active = 1",
        [branchId],
      );
      if (Number(activeUsers?.total || 0) > 0) {
        res.status(409).json({ message: "Cannot deactivate branch while active users are assigned" });
        return;
      }

      await run(`UPDATE branches SET is_active = 0, updated_at = ${SQLITE_NOW_ISO} WHERE id = ? AND tenant_id = ?`, [branchId, getCurrentTenantId()]);
      await run("DELETE FROM area_manager_branch_assignments WHERE branch_id = ?", [branchId]);
      hierarchyService.invalidateHierarchyCaches();

      await writeAuditLog({
        userId: req.user.sub,
        action: "branch.deactivated",
        targetType: "branch",
        targetId: branchId,
        details: JSON.stringify({ code: branch.code, name: branch.name }),
        ipAddress: req.ip,
      });
      await publishHierarchyEvent({
        eventType: "hierarchy.branch.deactivated",
        scopeLevel: "branch",
        regionId: branch.region_id,
        branchId,
        actorUserId: req.user.sub,
        details: { name: branch.name, code: branch.code },
      });
      await invalidateReportCaches();

      res.status(200).json({ message: "Branch deactivated" });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/branches/:id/permanent", authenticate, authorize("admin"), async (req, res, next) => {
    try {
      const branchId = parseId(req.params.id);
      if (!branchId) {
        res.status(400).json({ message: "Invalid branch id" });
        return;
      }

      const branch = await hierarchyService.getBranchById(branchId, { requireActive: false });
      if (!branch) {
        res.status(404).json({ message: "Branch not found" });
        return;
      }

      const dependencies = await getBranchDeletionDependencies(branchId);
      if (hasDeletionDependencies(dependencies)) {
        res.status(409).json({
          message: "Cannot permanently delete branch with linked records. Reassign or remove linked records first.",
          dependencies,
        });
        return;
      }

      await run("UPDATE hierarchy_events SET branch_id = NULL WHERE branch_id = ?", [branchId]);
      await run("DELETE FROM branches WHERE id = ? AND tenant_id = ?", [branchId, getCurrentTenantId()]);
      hierarchyService.invalidateHierarchyCaches();

      await writeAuditLog({
        userId: req.user.sub,
        action: "branch.deleted",
        targetType: "branch",
        targetId: branchId,
        details: JSON.stringify({
          name: branch.name,
          code: branch.code,
          regionId: branch.region_id,
          permanent: true,
        }),
        ipAddress: req.ip,
      });
      await publishHierarchyEvent({
        eventType: "hierarchy.branch.deleted",
        scopeLevel: "region",
        regionId: branch.region_id,
        branchId: null,
        actorUserId: req.user.sub,
        details: {
          deletedBranchId: branchId,
          name: branch.name,
          code: branch.code,
        },
      });
      await invalidateReportCaches();

      res.status(200).json({ message: "Branch deleted permanently" });
    } catch (error) {
      next(error);
    }
  });
}

export {
  registerBranchMutationRoutes,
};
