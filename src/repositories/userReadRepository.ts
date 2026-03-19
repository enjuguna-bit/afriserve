import { createSqlWhereBuilder } from "../utils/sqlBuilder.js";
import { mapUserRolesByUserId } from "../services/userRoleService.js";
import type { HierarchyScope } from "../types/dataLayer.js";

type DbAll = (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
type DbGet = (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;

interface UserReadRepositoryDeps {
  all: DbAll;
  get: DbGet;
}

interface ScopeCondition {
  sql: string;
  params: unknown[];
}

interface ListUsersFilters {
  scope: HierarchyScope | null;
  role?: string;
  isActive?: 0 | 1;
  branchId?: number;
  regionId?: number;
  search?: string;
  limit: number;
  offset: number;
  sortBy: "u.id" | "u.full_name" | "u.email" | "u.role" | "u.is_active" | "u.created_at";
  sortOrder: "asc" | "desc";
}

interface UserRoleCountRow {
  role: string;
  total_users: number;
  active_users: number;
}

interface UserSummaryTotals {
  total_users: number;
  active_users: number;
  inactive_users: number;
  locked_users: number;
}

function normalizeBranchIds(values: unknown[]): number[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return [...new Set(values.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];
}

function buildIdFilter(columnRef: string, values: number[]): ScopeCondition {
  if (values.length === 0) {
    return { sql: "1 = 0", params: [] };
  }
  if (values.length === 1) {
    return { sql: `${columnRef} = ?`, params: [values[0]] };
  }
  return {
    sql: `${columnRef} IN (${values.map(() => "?").join(", ")})`,
    params: values,
  };
}

function buildUserVisibilityScopeCondition(scope: HierarchyScope | null | undefined, userColumnRef: string): ScopeCondition {
  if (!scope || scope.level === "hq") {
    return { sql: "", params: [] };
  }

  const scopeBranchIds = normalizeBranchIds(scope.branchIds);
  if (scopeBranchIds.length === 0) {
    return { sql: "1 = 0", params: [] };
  }

  const directBranchCondition = buildIdFilter(`${userColumnRef}.branch_id`, scopeBranchIds);
  const assignmentBranchCondition = buildIdFilter("amb_scope.branch_id", scopeBranchIds);

  return {
    sql: `(${directBranchCondition.sql} OR EXISTS (SELECT 1 FROM area_manager_branch_assignments amb_scope WHERE amb_scope.user_id = ${userColumnRef}.id AND ${assignmentBranchCondition.sql}))`,
    params: [...directBranchCondition.params, ...assignmentBranchCondition.params],
  };
}

function createUserReadRepository(deps: UserReadRepositoryDeps) {
  const { all, get } = deps;
  const assignmentRoles = new Set(["area_manager", "investor", "partner"]);

  async function listUsers(filters: ListUsersFilters) {
    const where = createSqlWhereBuilder();
    where.addCondition(buildUserVisibilityScopeCondition(filters.scope, "u"));

    if (filters.role) {
      where.addEquals("u.role", filters.role);
    }

    if (filters.isActive === 0 || filters.isActive === 1) {
      where.addEquals("u.is_active", filters.isActive);
    }

    if (Number.isInteger(filters.branchId) && Number(filters.branchId) > 0) {
      where.addClause(
        "(u.branch_id = ? OR EXISTS (SELECT 1 FROM area_manager_branch_assignments amb WHERE amb.user_id = u.id AND amb.branch_id = ?))",
        [Number(filters.branchId), Number(filters.branchId)],
      );
    }

    if (Number.isInteger(filters.regionId) && Number(filters.regionId) > 0) {
      where.addEquals("COALESCE(u.primary_region_id, b.region_id)", Number(filters.regionId));
    }

    if (filters.search) {
      const pattern = `%${String(filters.search).toLowerCase()}%`;
      where.addClause("(LOWER(u.full_name) LIKE ? OR LOWER(u.email) LIKE ?)", [pattern, pattern]);
    }

    const whereSql = where.buildWhere();
    const queryParams = where.getParams();
    const sortOrder = filters.sortOrder === "asc" ? "ASC" : "DESC";

    const users = await all(
      `
        SELECT
          u.id, u.full_name, u.email, u.role, u.is_active, u.deactivated_at, u.failed_login_attempts, u.locked_until, u.token_version,
          u.branch_id, u.primary_region_id, u.created_at, b.name AS branch_name, r.name AS region_name
        FROM users u
        LEFT JOIN branches b ON b.id = u.branch_id
        LEFT JOIN regions r ON r.id = COALESCE(u.primary_region_id, b.region_id)
        ${whereSql}
        ORDER BY ${filters.sortBy} ${sortOrder}, u.id DESC
        LIMIT ? OFFSET ?
      `,
      [...queryParams, filters.limit, filters.offset],
    );

    const managerIds = users
      .filter((row) => assignmentRoles.has(String(row.role || "").trim().toLowerCase()))
      .map((row) => Number(row.id))
      .filter(Boolean);
    let usersWithAssignments: Array<Record<string, any>>;
    if (managerIds.length === 0) {
      usersWithAssignments = users.map((row) => ({ ...row, assigned_branch_ids: [] }));
    } else {
      const placeholders = managerIds.map(() => "?").join(", ");
      const assignmentRows = await all(
        `
          SELECT user_id, branch_id
          FROM area_manager_branch_assignments
          WHERE user_id IN (${placeholders})
          ORDER BY user_id ASC, branch_id ASC
        `,
        managerIds,
      );
      const assignmentMap = new Map<number, number[]>();
      for (const row of assignmentRows) {
        const userId = Number(row.user_id);
        if (!assignmentMap.has(userId)) {
          assignmentMap.set(userId, []);
        }
        assignmentMap.get(userId)?.push(Number(row.branch_id));
      }
      usersWithAssignments = users.map((row) => ({
        ...row,
        assigned_branch_ids: assignmentRoles.has(String(row.role || "").trim().toLowerCase())
          ? (assignmentMap.get(Number(row.id)) || [])
          : [],
      }));
    }

    const fallbackRoleByUserId = new Map<number, unknown>(
      usersWithAssignments.map((row) => [Number(row.id), row.role]),
    );
    const roleMap = await mapUserRolesByUserId({
      all,
      userIds: usersWithAssignments.map((row) => Number(row.id)),
      fallbackRoleByUserId,
    });
    usersWithAssignments = usersWithAssignments.map((row) => ({
      ...row,
      roles: roleMap.get(Number(row.id)) || [],
    }));

    const totalRow = await get(
      `
        SELECT COUNT(*) AS total
        FROM users u
        LEFT JOIN branches b ON b.id = u.branch_id
        ${whereSql}
      `,
      queryParams,
    );

    return {
      rows: usersWithAssignments,
      total: Number(totalRow?.total || 0),
    };
  }

  async function listUserRoleCounts(scope: HierarchyScope | null): Promise<UserRoleCountRow[]> {
    const scopeCondition = buildUserVisibilityScopeCondition(scope, "u");
    const whereSql = scopeCondition.sql ? `WHERE ${scopeCondition.sql}` : "";
    const scopeParams = scopeCondition.params;
    let rows: Array<Record<string, any>> = [];
    try {
      rows = await all(
        `
          WITH assigned_roles AS (
            SELECT ur.user_id, ur.role
            FROM user_roles ur
            UNION
            SELECT u.id AS user_id, u.role
            FROM users u
            WHERE NOT EXISTS (
              SELECT 1
              FROM user_roles ur2
              WHERE ur2.user_id = u.id
            )
          )
          SELECT
            ar.role AS role,
            COUNT(DISTINCT ar.user_id) AS total_users,
            SUM(CASE WHEN u.is_active = 1 THEN 1 ELSE 0 END) AS active_users
          FROM assigned_roles ar
          INNER JOIN users u ON u.id = ar.user_id
          ${whereSql}
          GROUP BY ar.role
        `,
        scopeParams,
      );
    } catch (_error) {
      rows = await all(
        `
          SELECT
            u.role AS role,
            COUNT(*) AS total_users,
            SUM(CASE WHEN u.is_active = 1 THEN 1 ELSE 0 END) AS active_users
          FROM users u
          ${whereSql}
          GROUP BY u.role
        `,
        scopeParams,
      );
    }
    return rows.map((row) => ({
      role: String(row.role || ""),
      total_users: Number(row.total_users || 0),
      active_users: Number(row.active_users || 0),
    }));
  }

  async function getUserSummaryTotals(scope: HierarchyScope | null): Promise<UserSummaryTotals> {
    const scopeCondition = buildUserVisibilityScopeCondition(scope, "u");
    const whereSql = scopeCondition.sql ? `WHERE ${scopeCondition.sql}` : "";
    const totals = await get(
      `
        SELECT
          COUNT(*) AS total_users,
          SUM(CASE WHEN u.is_active = 1 THEN 1 ELSE 0 END) AS active_users,
          SUM(CASE WHEN u.is_active = 0 THEN 1 ELSE 0 END) AS inactive_users,
          SUM(CASE WHEN u.locked_until IS NOT NULL AND datetime(u.locked_until) > datetime('now') THEN 1 ELSE 0 END) AS locked_users
        FROM users u
        ${whereSql}
      `,
      scopeCondition.params,
    );

    return {
      total_users: Number(totals?.total_users || 0),
      active_users: Number(totals?.active_users || 0),
      inactive_users: Number(totals?.inactive_users || 0),
      locked_users: Number(totals?.locked_users || 0),
    };
  }

  return {
    listUsers,
    listUserRoleCounts,
    getUserSummaryTotals,
  };
}

export {
  createUserReadRepository,
};
