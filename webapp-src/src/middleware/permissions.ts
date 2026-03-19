import type { NextFunction, Request, Response } from "express";
import { checkUserPermission, hasRolePermissionFallback } from "../services/permissionService.js";
import type { PermissionCode } from "../services/permissionService.js";
import { resolveAssignedRoles } from "../services/userRoleService.js";

type RequestWithUser = Request & {
  user?: {
    sub?: unknown;
    role?: unknown;
    roles?: unknown;
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

function requirePermission(permissionCode: PermissionCode) {
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

    const permitted = await checkUserPermission(userId, roles, permissionCode);
    if (!permitted) {
      logPermissionDecision(req, "warn", {
        decision: "deny",
        userId,
        role,
        roles,
        permission: permissionCode,
      });
      res.status(403).json({
        message: "Insufficient permissions",
        permission: permissionCode,
      });
      return;
    }

    logPermissionDecision(req, "debug", {
      decision: "allow",
      userId,
      role,
      roles,
      permission: permissionCode,
    });

    next();
  };
}

export {
  hasPermission,
  requirePermission,
};
