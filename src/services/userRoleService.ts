import { getAllowedRoles, normalizeRoleInput } from "../config/roles.js";

type DbRun = (sql: string, params?: unknown[]) => Promise<unknown>;
type DbGet = (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
type DbAll = (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;

const allowedRoleSet = new Set(getAllowedRoles().map((role) => String(role).trim().toLowerCase()).filter(Boolean));
let ensureTablePromise: Promise<void> | null = null;

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
  await run("DELETE FROM user_roles WHERE user_id = ?", [userId]);
  const nowIso = new Date().toISOString();
  for (const role of finalRoles) {
    await run(
      `
        INSERT INTO user_roles (user_id, role, created_at)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, role) DO NOTHING
      `,
      [userId, role, nowIso],
    );
  }

  return finalRoles;
}

async function getUserRolesForUser({
  all,
  get,
  userId,
  primaryRole,
}: {
  all: DbAll;
  get: DbGet;
  userId: number;
  primaryRole?: unknown;
}): Promise<string[]> {
  if (!Number.isInteger(userId) || userId <= 0) {
    return [];
  }

  const fallbackRole = normalizeRole(primaryRole);
  try {
    const rows = await all(
      `
        SELECT role
        FROM user_roles
        WHERE user_id = ?
        ORDER BY role ASC
      `,
      [userId],
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

  const user = await get("SELECT role FROM users WHERE id = ? LIMIT 1", [userId]);
  const roleFromUser = normalizeRole(user?.role);
  return roleFromUser ? [roleFromUser] : [];
}

async function mapUserRolesByUserId({
  all,
  userIds,
  fallbackRoleByUserId = new Map<number, unknown>(),
}: {
  all: DbAll;
  userIds: number[];
  fallbackRoleByUserId?: Map<number, unknown>;
}): Promise<Map<number, string[]>> {
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
        SELECT user_id, role
        FROM user_roles
        WHERE user_id IN (${placeholders})
        ORDER BY user_id ASC, role ASC
      `,
      normalizedIds,
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
  sameRoleList,
  ensureUserRolesTable,
  replaceUserRoles,
  getUserRolesForUser,
  mapUserRolesByUserId,
};
