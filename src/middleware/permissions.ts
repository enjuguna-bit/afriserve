import type { NextFunction, Request, Response } from "express";
import { checkUserPermission, hasRolePermissionFallback } from "../services/permissionService.js";
import type { PermissionCode } from "../services/permissionService.js";
import { resolveAssignedRoles } from "../services/userRoleService.js";

type RequestWithUser = Request & {
  user?: {
    sub?: unknown;
    role?: unknown;
    roles?: unknown;
    permissions?: unknown;
  };
  requestId?: unknown;
};

function logPermissionDecision(req: RequestWithUser, level: "debug" | "warn", payload: Record<string, unknown>): void {
  const logger = (req as any)?.app?.locals?.logger;
  if (!logger || typeof logger[level] !== "function") {
    return;
  }

  logger[level]("authz.permission.decision", {
    path: req.originalUrl || req.url,
    method: req.method,
    requestId: req.requestId || null,
    ...payload,
  });
}

function hasPermission(role: string | string[], permissionCode: PermissionCode): boolean {
  return hasRolePermissionFallback(role, permissionCode);
}

function normalizePermissionList(value: unknown): PermissionCode[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => String(entry || "").trim())
    .filter(Boolean) as PermissionCode[];
}

function requireAnyPermission(...permissionCodes: PermissionCode[]) {
  const requestedPermissions = [...new Set(
    permissionCodes.map((permission) => String(permission || "").trim()).filter(Boolean),
  )] as PermissionCode[];

  return async (req: RequestWithUser, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ message: "Not authenticated" });
      return;
    }

    const userId = Number(user.sub);
    const roles = resolveAssignedRoles({
      role: user.role,
      roles: user.roles,
    });
    const role = roles[0] || String(user.role || "");
    if (!Number.isInteger(userId) || userId <= 0) {
      res.status(401).json({ message: "Invalid user session" });
      return;
    }

    if (requestedPermissions.length === 0) {
      next();
      return;
    }

    const effectivePermissions = normalizePermissionList(user.permissions);
    let permitted = effectivePermissions.some((permission) => requestedPermissions.includes(permission));

    if (!permitted) {
      for (const permission of requestedPermissions) {
        if (await checkUserPermission(userId, roles, permission)) {
          permitted = true;
          break;
        }
      }
    }

    if (!permitted) {
      const denialPayload: Record<string, unknown> = {
        decision: "deny",
        userId,
        role,
        roles,
      };
      const responsePayload: Record<string, unknown> = {
        message: "Insufficient permissions",
      };
      if (requestedPermissions.length === 1) {
        denialPayload.permission = requestedPermissions[0];
        responsePayload.permission = requestedPermissions[0];
      } else {
        denialPayload.permissions = requestedPermissions;
        responsePayload.permissions = requestedPermissions;
      }

      logPermissionDecision(req, "warn", denialPayload);
      res.status(403).json(responsePayload);
      return;
    }

    const allowPayload: Record<string, unknown> = {
      decision: "allow",
      userId,
      role,
      roles,
    };
    if (requestedPermissions.length === 1) {
      allowPayload.permission = requestedPermissions[0];
    } else {
      allowPayload.permissions = requestedPermissions;
    }
    logPermissionDecision(req, "debug", allowPayload);

    next();
  };
}

function authorizeCapability(...permissionCodes: PermissionCode[]) {
  return requireAnyPermission(...permissionCodes);
}

function requirePermission(permissionCode: PermissionCode) {
  return requireAnyPermission(permissionCode);
}

export {
  authorizeCapability,
  hasPermission,
  requireAnyPermission,
  requirePermission,
};
