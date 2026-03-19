import { all, get, run } from "../db.js";
import { createLogger } from "./logger.js";

const PERMISSION_DEFINITIONS = [
  { permissionId: "user.manage", description: "Create, update, activate, deactivate, and revoke user accounts" },
  { permissionId: "user.create", description: "Create platform user accounts" },
  { permissionId: "user.view", description: "View user profiles, role assignments, and security posture" },
  { permissionId: "user.profile.update", description: "Update user profile and hierarchy assignment" },
  { permissionId: "user.role.assign", description: "Assign or change user roles" },
  { permissionId: "user.permission.manage", description: "Grant or revoke custom user permissions" },
  { permissionId: "client.create", description: "Create and onboard client records" },
  { permissionId: "client.view", description: "View client profiles and history" },
  { permissionId: "client.update", description: "Update client profile fields" },
  { permissionId: "client.kyc.update", description: "Update client KYC status and verification" },
  { permissionId: "client.assign", description: "Reassign client portfolio between officers" },
  { permissionId: "loan.create", description: "Create loan applications" },
  { permissionId: "loan.view", description: "View loan portfolio data" },
  { permissionId: "loan.approve", description: "Approve high-risk and pending loans" },
  { permissionId: "loan.limit.allocate", description: "Allocate or override repeat loan limits" },
  { permissionId: "loan.write_off", description: "Write off delinquent or unrecoverable loans" },
  { permissionId: "loan.restructure", description: "Restructure active loans and reprice schedules" },
  { permissionId: "loan.top_up", description: "Top up active loans with additional principal" },
  { permissionId: "loan.refinance", description: "Refinance active loans into revised terms" },
  { permissionId: "loan.term_extension", description: "Extend the term of active loans" },
  { permissionId: "loan.disburse", description: "Disburse approved loans" },
  { permissionId: "loan.reject", description: "Reject pending loan applications" },
  { permissionId: "collection.record", description: "Record collections, repayments, and operational recovery actions" },
  { permissionId: "mobile_money.manage", description: "Operate mobile money disbursement and STK workflows" },
  { permissionId: "mobile_money.reconcile", description: "Review and reconcile mobile money collections" },
  { permissionId: "report.view", description: "View management and portfolio reports" },
  { permissionId: "report.export", description: "Export or deliver report outputs" },
  { permissionId: "audit.view", description: "View audit logs and compliance trails" },
  { permissionId: "hierarchy.manage", description: "Manage hierarchy assignments and organizational scope" },
  { permissionId: "branch.manage", description: "Manage branches and branch-level configuration" },
  { permissionId: "system.config", description: "Access system configuration and operational controls" },
] as const;

type PermissionCode = typeof PERMISSION_DEFINITIONS[number]["permissionId"];

const SUPPORTED_PERMISSION_CODES = PERMISSION_DEFINITIONS.map((item) => item.permissionId);
const logger = createLogger().child("permissionService");

const ROLE_PERMISSION_MATRIX: Record<string, PermissionCode[]> = {
  admin: [...SUPPORTED_PERMISSION_CODES],
  ceo: ["user.view", "client.view", "loan.view", "report.view", "report.export", "audit.view"],
  investor: ["report.view"],
  partner: ["report.view"],
  operations_manager: [
    "client.view",
    "client.update",
    "client.assign",
    "loan.view",
    "loan.approve",
    "loan.limit.allocate",
    "loan.restructure",
    "loan.top_up",
    "loan.refinance",
    "loan.term_extension",
    "loan.disburse",
    "loan.reject",
    "collection.record",
    "mobile_money.manage",
    "mobile_money.reconcile",
    "report.view",
    "audit.view",
  ],
  finance: [
    "client.view",
    "loan.view",
    "loan.approve",
    "loan.limit.allocate",
    "loan.write_off",
    "loan.restructure",
    "loan.top_up",
    "loan.refinance",
    "loan.term_extension",
    "loan.disburse",
    "loan.reject",
    "collection.record",
    "mobile_money.manage",
    "mobile_money.reconcile",
    "report.view",
    "report.export",
  ],
  cashier: ["client.view", "loan.view", "loan.disburse", "collection.record", "report.view"],
  area_manager: ["client.view", "client.update", "client.assign", "loan.view", "loan.approve", "loan.limit.allocate", "report.view"],
  loan_officer: [
    "client.create",
    "client.view",
    "client.update",
    "client.kyc.update",
    "loan.create",
    "loan.view",
    "collection.record",
    "mobile_money.manage",
  ],
  it: [
    "user.manage",
    "user.create",
    "user.view",
    "user.profile.update",
    "user.role.assign",
    "user.permission.manage",
    "audit.view",
    "hierarchy.manage",
    "branch.manage",
    "system.config",
  ],
  branch_manager: [
    "client.view",
    "loan.view",
    "loan.approve",
    "loan.limit.allocate",
    "loan.restructure",
    "loan.top_up",
    "loan.refinance",
    "loan.term_extension",
    "loan.disburse",
    "loan.reject",
    "collection.record",
    "mobile_money.manage",
    "mobile_money.reconcile",
    "report.view",
    "audit.view",
  ],
};

function normalizeRoles(role: string | string[]): string[] {
  return Array.isArray(role)
    ? role.map((entry) => String(entry || "").trim().toLowerCase()).filter(Boolean)
    : [String(role || "").trim().toLowerCase()].filter(Boolean);
}

function hasRolePermissionFallback(role: string | string[], permissionCode: PermissionCode): boolean {
  const normalizedRoles = normalizeRoles(role);

  return normalizedRoles.some((normalizedRole) => {
    const rolePermissions = ROLE_PERMISSION_MATRIX[normalizedRole] || [];
    return rolePermissions.includes(permissionCode);
  });
}

async function checkUserPermission(userId: number, role: string | string[], permissionCode: PermissionCode): Promise<boolean> {
  const normalizedRoles = normalizeRoles(role);

  try {
    const customPermission = await get(
      `
        SELECT permission_id
        FROM user_custom_permissions
        WHERE user_id = ? AND permission_id = ?
        LIMIT 1
      `,
      [userId, permissionCode],
    );
    if (customPermission) {
      return true;
    }

    if (normalizedRoles.length > 0) {
      const placeholders = normalizedRoles.map(() => "?").join(", ");
      const rolePermission = await get(
        `
          SELECT permission_id
          FROM role_permissions
          WHERE role IN (${placeholders}) AND permission_id = ?
          LIMIT 1
        `,
        [...normalizedRoles, permissionCode],
      );
      if (rolePermission) {
        return true;
        }
    }
  } catch (error) {
    logger.error("permissions.db_lookup_failed", {
      userId,
      roles: normalizedRoles,
      permissionCode,
      error,
    });
  }

  return hasRolePermissionFallback(role, permissionCode);
}

async function getEffectivePermissionsForUser(userId: number, role: string | string[]): Promise<string[]> {
  const normalizedRoles = normalizeRoles(role);
  const fallbackPermissions = [...new Set(
    normalizedRoles.flatMap((roleId) => ROLE_PERMISSION_MATRIX[roleId] || []),
  )].sort((left, right) => left.localeCompare(right));

  if (!Number.isInteger(Number(userId)) || Number(userId) <= 0) {
    return fallbackPermissions;
  }

  try {
    const rolePermissions = normalizedRoles.length > 0
      ? await all(
        `
          SELECT DISTINCT permission_id
          FROM role_permissions
          WHERE role IN (${normalizedRoles.map(() => "?").join(", ")})
        `,
        normalizedRoles,
      )
      : [];
    const customPermissions = await all(
      `
        SELECT DISTINCT permission_id
        FROM user_custom_permissions
        WHERE user_id = ?
      `,
      [userId],
    );

    return [...new Set([
      ...rolePermissions.map((entry) => String(entry.permission_id || "").trim()).filter(Boolean),
      ...customPermissions.map((entry) => String(entry.permission_id || "").trim()).filter(Boolean),
    ])].sort((left, right) => left.localeCompare(right));
  } catch (error) {
    console.error(
      "[permissionService] Failed to load custom permissions from database, falling back to static matrix:",
      error,
    );
    logger.error("permissions.effective_permissions_lookup_failed", {
      userId,
      roles: normalizedRoles,
      error,
    });
    return fallbackPermissions;
  }
}

function getPermissionCatalog(): Array<{ permissionId: PermissionCode; description: string }> {
  return PERMISSION_DEFINITIONS.map((item) => ({ ...item }));
}

function getRolePermissionMatrix(): Record<string, PermissionCode[]> {
  return Object.fromEntries(
    Object.entries(ROLE_PERMISSION_MATRIX).map(([role, permissions]) => [role, [...permissions]]),
  );
}

async function seedDefaultRolePermissions(): Promise<void> {
  const nowIso = new Date().toISOString();
  const permissionPlaceholders = PERMISSION_DEFINITIONS.map(() => "(?, ?, ?)").join(", ");
  const permissionParams = PERMISSION_DEFINITIONS.flatMap((permission) => [
    permission.permissionId,
    permission.description,
    nowIso,
  ]);
  await run(
    `
      INSERT INTO permissions (permission_id, description, created_at)
      VALUES ${permissionPlaceholders}
      ON CONFLICT(permission_id) DO NOTHING
    `,
    permissionParams,
  );

  const rolePermissionRows = Object.entries(ROLE_PERMISSION_MATRIX)
    .flatMap(([role, permissions]) => permissions.map((permissionId) => ({ role, permissionId })));
  if (rolePermissionRows.length === 0) {
    return;
  }

  const rolePermissionPlaceholders = rolePermissionRows.map(() => "(?, ?, ?)").join(", ");
  const rolePermissionParams = rolePermissionRows.flatMap((entry) => [
    entry.role,
    entry.permissionId,
    nowIso,
  ]);
  await run(
    `
      INSERT INTO role_permissions (role, permission_id, created_at)
      VALUES ${rolePermissionPlaceholders}
      ON CONFLICT(role, permission_id) DO NOTHING
    `,
    rolePermissionParams,
  );
}

export type {
  PermissionCode,
};

export {
  checkUserPermission,
  getEffectivePermissionsForUser,
  getPermissionCatalog,
  getRolePermissionMatrix,
  hasRolePermissionFallback,
  seedDefaultRolePermissions,
  SUPPORTED_PERMISSION_CODES,
};

