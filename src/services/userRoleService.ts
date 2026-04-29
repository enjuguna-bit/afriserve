import { getAllowedRoles, normalizeRoleInput } from "../config/roles.js";
import { getCurrentTenantId } from "../utils/tenantStore.js";

type DbRun = (sql: string, params?: unknown[]) => Promise<unknown>;
type DbGet = (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
type DbAll = (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;

const allowedRoleSet = new Set(getAllowedRoles().map((role) => String(role).trim().toLowerCase()).filter(Boolean));
let ensureTablePromise: Promise<void> | null = null;
const roleScopePriority: Record<string, number> = {
  operations_manager: 1,
  loan_officer: 1,
  cashier: 1,
  area_manager: 2,
  investor: 2,
  partner: 2,
  admin: 3,
  ceo: 3,
  finance: 3,
  it: 3,
};

function normalizeRole(role: unknown): string | null {
  const normalized = normalizeRoleInput(role);
  const roleId = String(normalized || "").trim().toLowerCase();
  if (!roleId || !allowedRoleSet.has(roleId)) {
    return null;
  }
  return roleId;
}

function normalizeRoleList(input: unknown): string[] {
  const source = Array.isArray(input) ? input : [input];
  const seen = new Set<string>();
  const normalizedRoles: string[] = [];

  for (const role of source) {
    const normalized = normalizeRole(role);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    normalizedRoles.push(normalized);
  }

  return normalizedRoles;
}

function getRoleScopePriority(role: unknown): number {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) {
    return Number.MAX_SAFE_INTEGER;
  }
  return roleScopePriority[normalizedRole] ?? Number.MAX_SAFE_INTEGER;
}

function selectMostRestrictiveRole(roles: unknown): string | null {
  const normalizedRoles = normalizeRoleList(roles);
  if (normalizedRoles.length === 0) {
    return null;
  }

  return normalizedRoles
    .map((role, index) => ({ role, index }))
    .sort((left, right) => {
      const priorityDelta = getRoleScopePriority(left.role) - getRoleScopePriority(right.role);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      return left.index - right.index;
    })[0]?.role || null;
}

function resolveAssignedRoles({
  role,
  roles,
  fallbackRole,
}: {
  role?: unknown;
  roles?: unknown;
  fallbackRole?: unknown;
}): string[] {
  const normalizedRoles = normalizeRoleList(roles);
  const preferredRole = normalizeRole(role);
  const fallback = normalizeRole(fallbackRole);

  if (preferredRole) {
    if (!normalizedRoles.includes(preferredRole)) {
      normalizedRoles.unshift(preferredRole);
    } else {
      const reordered = [preferredRole, ...normalizedRoles.filter((entry) => entry !== preferredRole)];
      normalizedRoles.splice(0, normalizedRoles.length, ...reordered);
    }
  }

  if (normalizedRoles.length === 0 && fallback) {
    normalizedRoles.push(fallback);
  }

  return normalizedRoles;
}

function resolvePrimaryRole({
  roles,
  preferredRole,
  fallbackRole,
}: {
  roles: unknown;
  preferredRole?: unknown;
  fallbackRole?: unknown;
}): string | null {
  const normalizedRoles = normalizeRoleList(roles);
  const mostRestrictiveRole = selectMostRestrictiveRole(normalizedRoles);
  if (mostRestrictiveRole) {
    return mostRestrictiveRole;
  }
  const preferred = normalizeRole(preferredRole);
  if (preferred && normalizedRoles.includes(preferred)) {
    return preferred;
  }
  const fallback = normalizeRole(fallbackRole);
  if (fallback && normalizedRoles.includes(fallback)) {
    return fallback;
  }
  return normalizedRoles[0] || preferred || fallback || null;
}

function sameRoleList(left: unknown, right: unknown): boolean {
  const leftRoles = normalizeRoleList(left).sort((a, b) => a.localeCompare(b));
  const rightRoles = normalizeRoleList(right).sort((a, b) => a.localeCompare(b));
  return leftRoles.length === rightRoles.length && leftRoles.every((role, index) => role === rightRoles[index]);
}

async function ensureUserRolesTable(run: DbRun): Promise<void> {
  if (!ensureTablePromise) {
    ensureTablePromise = (async () => {
      await run(`
        CREATE TABLE IF NOT EXISTS user_roles (
          user_id INTEGER NOT NULL,
          role TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (user_id, role),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
        )
      `);
      await run("CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id)");
      await run("CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role)");
    })();
  }

  try {
    await ensureTablePromise;
  } catch (error) {
    ensureTablePromise = null;
    throw error;
  }
}

async function replaceUserRoles({
  run,
  userId,
  roles,
  primaryRole,
}: {
  run: DbRun;
  userId: number;
  roles: unknown;
  primaryRole?: unknown;
}): Promise<string[]> {
  const normalizedRoles = normalizeRoleList(roles);
  const normalizedPrimaryRole = normalizeRole(primaryRole);
  const finalRoles = normalizedPrimaryRole
    ? resolveAssignedRoles({ role: normalizedPrimaryRole, roles: normalizedRoles })
    : normalizedRoles;

  if (!Number.isInteger(userId) || userId <= 0 || finalRoles.length === 0) {
    return [];
  }

  await ensureUserRolesTable(run);
  // Scope delete to tenant via user ownership check
  await run("DELETE FROM user_roles WHERE user_id = ? AND EXISTS (SELECT 1 FROM users WHERE id = ? AND tenant_id = ?)", [userId, userId, getCurrentTenantId()]);
  const nowIso = new Date().toISOString();
  for (const role of finalRoles) {
    await run(
      `
        INSERT OR IGNORE INTO user_roles (user_id, role, created_at)
        SELECT ?, ?, ?
        WHERE EXISTS (
          SELECT 1
          FROM users
          WHERE id = ? AND tenant_id = ?
        )
      `,
      [userId, role, nowIso, userId, getCurrentTenantId()],
    );
  }

  return finalRoles;
}

async function getUserRolesForUser({
  all,
  get,
  userId,
  primaryRole,
  tenantId,
}: {
  all: DbAll;
  get: DbGet;
  userId: number;
  primaryRole?: unknown;
  tenantId?: string | null;
}): Promise<string[]> {
  if (!Number.isInteger(userId) || userId <= 0) {
    return [];
  }

  const effectiveTenantId = String(tenantId || getCurrentTenantId()).trim() || getCurrentTenantId();
  const fallbackRole = normalizeRole(primaryRole);
  try {
    const rows = await all(
      `
        SELECT ur.role
        FROM user_roles ur
        INNER JOIN users u ON u.id = ur.user_id
        WHERE ur.user_id = ?
          AND u.tenant_id = ?
        ORDER BY ur.role ASC
      `,
      [userId, effectiveTenantId],
    );

    const normalized = normalizeRoleList(rows.map((row) => row.role));
    if (normalized.length > 0) {
      if (fallbackRole && !normalized.includes(fallbackRole)) {
        return [fallbackRole, ...normalized];
      }
      return normalized;
    }
  } catch (_error) {
  }

  if (fallbackRole) {
    return [fallbackRole];
  }

  const user = await get("SELECT role FROM users WHERE id = ? AND tenant_id = ? LIMIT 1", [userId, effectiveTenantId]);
  const roleFromUser = normalizeRole(user?.role);
  return roleFromUser ? [roleFromUser] : [];
}

async function mapUserRolesByUserId({
  all,
  userIds,
  fallbackRoleByUserId = new Map<number, unknown>(),
  tenantId,
}: {
  all: DbAll;
  userIds: number[];
  fallbackRoleByUserId?: Map<number, unknown>;
  tenantId?: string | null;
}): Promise<Map<number, string[]>> {
  const effectiveTenantId = String(tenantId || getCurrentTenantId()).trim() || getCurrentTenantId();
  const normalizedIds = [...new Set(userIds.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];
  const result = new Map<number, string[]>();
  for (const userId of normalizedIds) {
    const fallback = normalizeRole(fallbackRoleByUserId.get(userId));
    result.set(userId, fallback ? [fallback] : []);
  }

  if (normalizedIds.length === 0) {
    return result;
  }

  try {
    const placeholders = normalizedIds.map(() => "?").join(", ");
    const rows = await all(
      `
        SELECT ur.user_id, ur.role
        FROM user_roles ur
        INNER JOIN users u ON u.id = ur.user_id
        WHERE ur.user_id IN (${placeholders})
          AND u.tenant_id = ?
        ORDER BY ur.user_id ASC, ur.role ASC
      `,
      [...normalizedIds, effectiveTenantId],
    );

    for (const row of rows) {
      const userId = Number(row.user_id);
      const role = normalizeRole(row.role);
      if (!Number.isInteger(userId) || userId <= 0 || !role) {
        continue;
      }
      const existing = result.get(userId) || [];
      if (!existing.includes(role)) {
        result.set(userId, [...existing, role]);
      }
    }
  } catch (_error) {
    return result;
  }

  return result;
}

export {
  normalizeRoleList,
  resolveAssignedRoles,
  resolvePrimaryRole,
  selectMostRestrictiveRole,
  sameRoleList,
  ensureUserRolesTable,
  replaceUserRoles,
  getUserRolesForUser,
  mapUserRolesByUserId,
};
