import type { DbTransactionContext, HierarchyScope, HierarchyServiceOptions } from "../types/dataLayer.js";
import { ForbiddenScopeError } from "../domain/errors.js";
import { prisma } from "../db/prismaClient.js";

function createHierarchyService({ get, all, executeTransaction }: HierarchyServiceOptions) {
  const cacheTtlMs = Number(process.env.HIERARCHY_CACHE_TTL_MS || 30000);
  const staticCache: {
    regions: { value: Array<Record<string, any>> | null; expiresAt: number };
    activeBranches: { value: Array<Record<string, any>> | null; expiresAt: number };
    allBranches: { value: Array<Record<string, any>> | null; expiresAt: number };
  } = {
    regions: { value: null, expiresAt: 0 },
    activeBranches: { value: null, expiresAt: 0 },
    allBranches: { value: null, expiresAt: 0 },
  };
  const userScopeCache = new Map<string, { value: HierarchyScope | null; expiresAt: number }>();
  const hqRoles = new Set(["admin", "ceo", "finance", "it"]);
  const singleBranchRoles = new Set(["operations_manager", "loan_officer", "cashier"]);
  const branchAssignmentRoles = new Set(["area_manager", "investor", "partner"]);

  function now(): number {
    return Date.now();
  }

  function fromCache<T>(entry: { value: T; expiresAt: number } | null | undefined): T | null {
    if (entry && entry.expiresAt > now()) {
      return entry.value;
    }
    return null;
  }

  function toCache<T>(entry: { value: T; expiresAt: number }, value: T): void {
    entry.value = value;
    entry.expiresAt = now() + cacheTtlMs;
  }

  /**
   * @param {number | string | null | undefined} userId
   * @param {string | null | undefined} role
   * @param {HierarchyScope | null | undefined} scope
   * @returns {void}
   */
  function cacheScope(userId: number | string | null | undefined, role: string | null | undefined, scope: HierarchyScope | null | undefined): void {
    if (!userId || !role) {
      return;
    }

    userScopeCache.set(`${userId}:${role}`, {
      value: cloneScope(scope),
      expiresAt: now() + cacheTtlMs,
    });
  }

  /**
   * @param {number | string | null | undefined} userId
   * @param {string | null | undefined} role
   * @returns {HierarchyScope | null}
   */
  function readCachedScope(userId: number | string | null | undefined, role: string | null | undefined): HierarchyScope | null {
    if (!userId || !role) {
      return null;
    }

    const key = `${userId}:${role}`;
    const entry = userScopeCache.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt <= now()) {
      userScopeCache.delete(key);
      return null;
    }
    return cloneScope(entry.value);
  }

  /**
   * @param {HierarchyScope | null | undefined} scope
   * @returns {HierarchyScope | null}
   */
  function cloneScope(scope: HierarchyScope | null | undefined): HierarchyScope | null {
    if (!scope) {
      return null;
    }

    return {
      ...scope,
      branchIds: Array.isArray(scope.branchIds) ? [...scope.branchIds] : [],
    };
  }

  /**
   * @param {{ userId?: number | null }} [options]
   * @returns {void}
   */
  function invalidateHierarchyCaches({ userId = null }: { userId?: number | null } = {}): void {
    staticCache.regions.expiresAt = 0;
    staticCache.activeBranches.expiresAt = 0;
    staticCache.allBranches.expiresAt = 0;

    if (userId) {
      userScopeCache.forEach((_value, key) => {
        if (key.startsWith(`${userId}:`)) {
          userScopeCache.delete(key);
        }
      });
      return;
    }

    userScopeCache.clear();
  }

  /**
   * @param {{ includeInactive?: boolean }} [options]
   * @returns {Promise<Array<Record<string, any>>>}
   */
  async function getRegions({ includeInactive = false }: { includeInactive?: boolean } = {}): Promise<Array<Record<string, any>>> {
    if (!includeInactive) {
      const cached = fromCache(staticCache.regions);
      if (cached) {
        return cached;
      }
    }

    const regions = await prisma.regions.findMany({
      where: includeInactive
        ? undefined
        : { is_active: 1 },
      orderBy: { name: "asc" },
    });
    const hqIds = [...new Set(regions.map((region: any) => Number(region.hq_id || 0)).filter((id: any) => id > 0))];
    const headquartersRows = hqIds.length > 0
      ? await prisma.headquarters.findMany({
        where: { id: { in: hqIds } },
        select: { id: true, name: true, code: true },
      })
      : [];
    const headquartersById = new Map(headquartersRows.map((row: any) => [Number(row.id), row]));
    const rows = regions.map((region: any) => {
      const headquarters = headquartersById.get(Number(region.hq_id || 0));
      return {
        ...region,
        hq_name: (headquarters as any)?.name || null,
        hq_code: (headquarters as any)?.code || null,
      };
    });

    if (!includeInactive) {
      toCache(staticCache.regions, rows);
    }

    return rows;
  }

  /**
   * @param {unknown} regionId
   * @returns {Promise<Record<string, any> | null | undefined>}
   */
  async function getRegionById(regionId: unknown): Promise<Record<string, any> | null | undefined> {
    const parsedRegionId = Number(regionId);
    if (!Number.isInteger(parsedRegionId) || parsedRegionId <= 0) {
      return null;
    }

    return prisma.regions.findUnique({
      where: { id: parsedRegionId },
      select: {
        id: true,
        name: true,
        code: true,
        is_active: true,
        hq_id: true,
      },
    });
  }

  /**
   * @param {{ includeInactive?: boolean, regionId?: number | null }} [options]
   * @returns {Promise<Array<Record<string, any>>>}
   */
  async function getBranches(
    { includeInactive = false, regionId = null }: { includeInactive?: boolean; regionId?: number | null } = {},
  ): Promise<Array<Record<string, any>>> {
    const hasRegionFilter = Number.isInteger(Number(regionId)) && Number(regionId) > 0;
    const cacheRef = includeInactive ? staticCache.allBranches : staticCache.activeBranches;
    if (!hasRegionFilter) {
      const cached = fromCache(cacheRef);
      if (cached) {
        return cached;
      }
    }

    const branches = await prisma.branches.findMany({
      where: {
        ...(includeInactive ? {} : { is_active: 1 }),
        ...(hasRegionFilter ? { region_id: Number(regionId) } : {}),
      },
      orderBy: [{ region_id: "asc" }, { name: "asc" }],
    });
    const regionIds = [...new Set(branches.map((branch: any) => Number(branch.region_id || 0)).filter((id: any) => id > 0))];
    const regionRows = regionIds.length > 0
      ? await prisma.regions.findMany({
        where: { id: { in: regionIds } },
        select: { id: true, name: true, code: true },
      })
      : [];
    const regionsById = new Map(regionRows.map((row: any) => [Number(row.id), row]));
    const rows = branches.map((branch: any) => {
      const region = regionsById.get(Number(branch.region_id || 0));
      return {
        ...branch,
        region_name: (region as any)?.name || null,
        region_code: (region as any)?.code || null,
      };
    });
    rows.sort((left: any, right: any) => {
      const regionSort = String(left.region_name || "").localeCompare(String(right.region_name || ""));
      if (regionSort !== 0) {
        return regionSort;
      }
      return String(left.name || "").localeCompare(String(right.name || ""));
    });

    if (!hasRegionFilter) {
      toCache(cacheRef, rows);
    }

    return rows;
  }

  /**
   * @param {unknown} branchId
   * @param {{ requireActive?: boolean }} [options]
   * @returns {Promise<Record<string, any> | null | undefined>}
   */
  async function getBranchById(
    branchId: unknown,
    { requireActive = false }: { requireActive?: boolean } = {},
  ): Promise<Record<string, any> | null | undefined> {
    const parsedBranchId = Number(branchId);
    if (!Number.isInteger(parsedBranchId) || parsedBranchId <= 0) {
      return null;
    }

    const branch = await prisma.branches.findUnique({ where: { id: parsedBranchId } });

    if (!branch) {
      return null;
    }
    if (requireActive && Number(branch.is_active) !== 1) {
      return null;
    }

    const region = await prisma.regions.findUnique({
      where: { id: Number(branch.region_id || 0) },
      select: { name: true, code: true },
    });

    return {
      ...branch,
      region_name: region?.name || null,
      region_code: region?.code || null,
    };
  }

  /**
   * @param {unknown[]} branchIds
   * @param {{ requireActive?: boolean }} [options]
   * @returns {Promise<Array<Record<string, any>>>}
   */
  async function getBranchesByIds(
    branchIds: unknown[],
    { requireActive = false }: { requireActive?: boolean } = {},
  ): Promise<Array<Record<string, any>>> {
    const normalizedIds = normalizeIds(branchIds);
    if (normalizedIds.length === 0) {
      return [];
    }

    const branches = await prisma.branches.findMany({
      where: {
        id: { in: normalizedIds },
        ...(requireActive ? { is_active: 1 } : {}),
      },
      orderBy: { id: "asc" },
    });
    const regionIds = [...new Set(branches.map((branch: any) => Number(branch.region_id || 0)).filter((id: any) => id > 0))];
    const regionRows = regionIds.length > 0
      ? await prisma.regions.findMany({
        where: { id: { in: regionIds } },
        select: { id: true, name: true, code: true },
      })
      : [];
    const regionsById = new Map(regionRows.map((row: any) => [Number(row.id), row]));
    return branches.map((branch: any) => {
      const region = regionsById.get(Number(branch.region_id || 0));
      return {
        ...branch,
        region_name: (region as any)?.name || null,
        region_code: (region as any)?.code || null,
      };
    });
  }

  /**
   * @param {number} userId
   * @returns {Promise<number[]>}
   */
  async function getAreaManagerBranchIds(userId: number): Promise<number[]> {
    const rows = await prisma.area_manager_branch_assignments.findMany({
      where: { user_id: userId },
      select: { branch_id: true },
      orderBy: { branch_id: "asc" },
    });
    return rows.map((row: any) => Number(row.branch_id)).filter((id: any) => Number.isInteger(id) && id > 0);
  }

  /**
   * @param {number} userId
   * @param {unknown[]} branchIds
   * @returns {Promise<number[]>}
   */
  async function replaceAreaManagerAssignments(userId: number, branchIds: unknown[]): Promise<number[]> {
    const normalizedIds = normalizeIds(branchIds);
    await prisma.$transaction(async (tx: any) => {
      await tx.area_manager_branch_assignments.deleteMany({ where: { user_id: userId } });
      if (normalizedIds.length > 0) {
        await tx.area_manager_branch_assignments.createMany({
          data: normalizedIds.map((branchId) => ({
            user_id: userId,
            branch_id: branchId,
            created_at: new Date().toISOString(),
          })),
        });
      }
    });
    invalidateHierarchyCaches({ userId });
    return normalizedIds;
  }

  /**
   * @param {Record<string, any> | null | undefined} user
   * @returns {Promise<HierarchyScope>}
   */
  async function resolveHierarchyScope(user: Record<string, any> | null | undefined): Promise<HierarchyScope> {
    if (!user || !Number.isInteger(Number(user.sub))) {
      return {
        level: "hq",
        role: "anonymous",
        branchIds: [],
        branchId: null,
        regionId: null,
      };
    }

    const cached = readCachedScope(user.sub, user.role);
    if (cached) {
      return cached;
    }

    const role = String(user.role || "").trim().toLowerCase();
    if (hqRoles.has(role)) {
      const hqScope: HierarchyScope = {
        level: "hq",
        role,
        branchIds: [],
        branchId: null,
        regionId: null,
      };
      cacheScope(user.sub, role, hqScope);
      return hqScope;
    }

    if (singleBranchRoles.has(role)) {
      const userRow = await prisma.users.findUnique({
        where: { id: Number(user.sub) },
        select: {
          id: true,
          role: true,
          branch_id: true,
          primary_region_id: true,
        },
      });

      const branch = userRow?.branch_id
        ? await prisma.branches.findUnique({
          where: { id: Number(userRow.branch_id) },
          select: {
            id: true,
            name: true,
            region_id: true,
            is_active: true,
          },
        })
        : null;

      if (!userRow || !userRow.branch_id) {
        throw new ForbiddenScopeError("Branch assignment is required for this role");
      }
      if (!branch || Number(branch.is_active) !== 1) {
        throw new ForbiddenScopeError("Assigned branch is inactive");
      }

      const scope: HierarchyScope = {
        level: "branch",
        role,
        branchIds: [Number(userRow.branch_id)],
        branchId: Number(userRow.branch_id),
        regionId: Number(branch.region_id || userRow.primary_region_id || 0) || null,
        branchName: branch.name || null,
      };
      cacheScope(user.sub, role, scope);
      return scope;
    }

    if (branchAssignmentRoles.has(role)) {
      const assignedRows = await prisma.area_manager_branch_assignments.findMany({
        where: { user_id: Number(user.sub) },
        select: { branch_id: true },
        orderBy: { branch_id: "asc" },
      });
      const assignedBranchIds = assignedRows
        .map((row: any) => Number(row.branch_id || 0))
        .filter((id: any) => Number.isInteger(id) && id > 0);
      const assignedBranches = assignedBranchIds.length > 0
        ? await prisma.branches.findMany({
          where: { id: { in: assignedBranchIds } },
          select: { id: true, name: true, region_id: true, is_active: true },
          orderBy: { id: "asc" },
        })
        : [];

      const activeBranchIds = assignedBranches
        .filter((row: any) => Number(row.is_active) === 1)
        .map((row: any) => Number(row.id))
        .filter((id: any) => Number.isInteger(id) && id > 0);

      if (activeBranchIds.length === 0) {
        throw new ForbiddenScopeError(`${role} has no active branch assignments`);
      }

      const regionIds = [...new Set(assignedBranches.map((row: any) => Number(row.region_id)).filter(Boolean))];
      if (role === "area_manager" && regionIds.length > 1) {
        throw new ForbiddenScopeError("Area manager assignments must belong to one region");
      }

      const activeBranchRows = assignedBranches.filter((row: any) => Number(row.is_active) === 1);
      const scope: HierarchyScope = role === "area_manager"
        ? {
          level: "region",
          role,
          branchIds: activeBranchIds,
          branchId: null,
          regionId: Number(regionIds[0] || 0) || null,
        }
        : {
          level: "branch",
          role,
          branchIds: activeBranchIds,
          branchId: Number(activeBranchIds[0] || 0) || null,
          regionId: regionIds.length === 1 ? Number(regionIds[0]) : null,
          branchName: activeBranchRows.length === 1 ? String(activeBranchRows[0].name || "") || null : null,
        };
      cacheScope(user.sub, role, scope);
      return scope;
    }

    const defaultScope: HierarchyScope = {
      level: "none",
      role,
      branchIds: [],
      branchId: null,
      regionId: null,
    };
    cacheScope(user.sub, role, defaultScope);
    return defaultScope;
  }

  /**
   * @param {HierarchyScope | null | undefined} scope
   * @param {string} branchColumnRef
   * @returns {{ sql: string, params: unknown[] }}
   */
  function buildScopeCondition(scope: HierarchyScope | null | undefined, branchColumnRef: string): { sql: string; params: unknown[] } {
    if (!scope) {
      return {
        sql: "",
        params: [],
      };
    }

    if (scope.level === "hq") {
      return {
        sql: "",
        params: [],
      };
    }

    const scopeBranchIds = normalizeIds(scope.branchIds);
    if (scopeBranchIds.length === 0) {
      return {
        sql: "1 = 0",
        params: [],
      };
    }

    if (scopeBranchIds.length === 1) {
      return {
        sql: `${branchColumnRef} = ?`,
        params: [scopeBranchIds[0]],
      };
    }

    return {
      sql: `${branchColumnRef} IN (${scopeBranchIds.map(() => "?").join(", ")})`,
      params: scopeBranchIds,
    };
  }

  /**
   * @param {{
   *   scope: HierarchyScope | null | undefined,
   *   whereClauses: string[],
   *   queryParams: unknown[],
   *   branchColumnRef: string
   * }} params
   * @returns {void}
   */
  function addScopeFilter(
    {
      scope,
      whereClauses,
      queryParams,
      branchColumnRef,
    }: {
      scope: HierarchyScope | null | undefined;
      whereClauses: string[];
      queryParams: unknown[];
      branchColumnRef: string;
    },
  ): void {
    const condition = buildScopeCondition(scope, branchColumnRef);
    if (condition.sql) {
      whereClauses.push(condition.sql);
      queryParams.push(...condition.params);
    }
  }

  /**
   * @param {HierarchyScope | null | undefined} scope
   * @param {unknown} branchId
   * @returns {boolean}
   */
  function isBranchInScope(scope: HierarchyScope | null | undefined, branchId: unknown): boolean {
    if (!scope || scope.level === "hq") {
      return true;
    }
    const parsedBranchId = Number(branchId);
    if (!Number.isInteger(parsedBranchId) || parsedBranchId <= 0) {
      return false;
    }
    return normalizeIds(scope.branchIds).includes(parsedBranchId);
  }

  /**
   * @param {HierarchyScope | null | undefined} scope
   * @param {unknown[]} branchIds
   * @returns {number[]}
   */
  function projectBranchIdsToScope(scope: HierarchyScope | null | undefined, branchIds: unknown[]): number[] {
    const normalizedIds = normalizeIds(branchIds);
    if (!scope || scope.level === "hq") {
      return normalizedIds;
    }
    const scopeSet = new Set(normalizeIds(scope.branchIds));
    return normalizedIds.filter((id) => scopeSet.has(id));
  }

  return {
    invalidateHierarchyCaches,
    getRegions,
    getRegionById,
    getBranches,
    getBranchById,
    getBranchesByIds,
    getAreaManagerBranchIds,
    replaceAreaManagerAssignments,
    resolveHierarchyScope,
    buildScopeCondition,
    addScopeFilter,
    isBranchInScope,
    projectBranchIdsToScope,
    normalizeIds,
  };
}

/**
 * @param {unknown[]} values
 * @returns {number[]}
 */
function normalizeIds(values: unknown[]): number[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return [...new Set(values.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];
}

export {
  createHierarchyService,
  normalizeIds,
};
