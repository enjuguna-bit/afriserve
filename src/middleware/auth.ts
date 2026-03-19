import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { normalizeRoleInput } from "../config/roles.js";
import { getEffectivePermissionsForUser } from "../services/permissionService.js";
import { getUserRolesForUser, resolveAssignedRoles } from "../services/userRoleService.js";
import { resolveJwtSecretConfig } from "../utils/jwtSecrets.js";
import {
  cacheAuthSessionUser,
  getCachedAuthSessionUser,
  invalidateCachedAuthSessionUser,
} from "../services/authSessionCache.js";
import type {
  AuthenticatedRequest,
  AuthSessionUser,
  AuthTokenUser,
  CreateAuthMiddlewareOptions,
  JwtLikePayload,
} from "../types/auth.js";

function createAuthMiddleware({
  jwtSecret,
  jwtSecrets = [],
  tokenExpiry,
  get,
  all = async () => [],
  isTokenBlacklisted = async () => false,
}: CreateAuthMiddlewareOptions) {
  const { activeSecret, validSecrets } = resolveJwtSecretConfig(jwtSecret, jwtSecrets);

  function verifyTokenWithAnySecret(token: string): JwtLikePayload {
    let lastError: unknown = null;

    for (const secret of validSecrets) {
      try {
        const decoded = jwt.verify(token, secret);
        if (decoded && typeof decoded === "object") {
          return decoded as JwtLikePayload;
        }
        lastError = new Error("Invalid token payload");
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error("Invalid token secret configuration");
  }

  function verifyToken(token: string): JwtLikePayload {
    return verifyTokenWithAnySecret(token);
  }

  function createToken(user: AuthTokenUser): string {
    const roles = resolveAssignedRoles({ role: user.role, roles: user.roles });
    const primaryRole = roles[0] || normalizeRoleForAuthorize(user.role);
    // jwt.sign accepts string | number for expiresIn; cast through unknown avoids `any`
    const expiresIn = tokenExpiry as unknown as jwt.SignOptions["expiresIn"];
    return jwt.sign(
      {
        sub: user.id,
        jti: crypto.randomUUID(),
        typ: "access",
        email: user.email,
        role: primaryRole,
        roles,
        fullName: user.full_name,
        tokenVersion: Number(user.token_version || 0),
        branchId: user.branch_id || null,
        primaryRegionId: user.primary_region_id || null,
        scope: {
          branchId: user.branch_id || null,
          primaryRegionId: user.primary_region_id || null,
        },
      },
      activeSecret as jwt.Secret,
      { expiresIn },
    );
  }

  async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
    const authHeader = req.headers.authorization;
    const requestId = (req as AuthenticatedRequest).requestId ?? null;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ message: "Authorization token is required", requestId });
      return;
    }

    const token = authHeader.slice(7);
    try {
      const blacklisted = await isTokenBlacklisted(token);
      if (blacklisted) {
        res.status(401).json({ message: "Session has been revoked", requestId });
        return;
      }

      const decoded = verifyToken(token);
      const tokenType = typeof decoded.typ === "string" ? decoded.typ.trim().toLowerCase() : "";
      if (tokenType && tokenType !== "access") {
        res.status(401).json({ message: "Invalid or expired token", requestId });
        return;
      }

      const userId = Number(decoded.sub || 0);
      if (!Number.isInteger(userId) || userId <= 0) {
        res.status(401).json({ message: "Invalid or expired token", requestId });
        return;
      }

      let user = await getCachedAuthSessionUser(userId);
      if (!user) {
        user = await get(
          `
            SELECT id, full_name, email, role, is_active, token_version, branch_id, primary_region_id
            FROM users
            WHERE id = ?
          `,
          [userId],
        ) || null;
        if (user && Number(user.is_active || 0) === 1) {
          user.roles = await getUserRolesForUser({
            all,
            get,
            userId,
            primaryRole: user.role,
          });
          user.permissions = await getEffectivePermissionsForUser(userId, user.roles || user.role);
          await cacheAuthSessionUser(user);
        }
      } else {
        user.roles = resolveAssignedRoles({ role: user.role, roles: user.roles });
        user.permissions = Array.isArray(user.permissions)
          ? user.permissions
          : await getEffectivePermissionsForUser(userId, user.roles || user.role);
      }

      if (!user || user.is_active !== 1) {
        await invalidateCachedAuthSessionUser(userId);
        res.status(401).json({ message: "Invalid or inactive user session", requestId });
        return;
      }

      const tokenVersion = Number(decoded.tokenVersion || 0);
      const currentVersion = Number(user.token_version || 0);
      if (tokenVersion !== currentVersion) {
        await invalidateCachedAuthSessionUser(userId);
        res.status(401).json({ message: "Session has been revoked", requestId });
        return;
      }

      await cacheAuthSessionUser(user);

      const resolvedRoles = resolveAssignedRoles({ role: user.role, roles: user.roles });
      const primaryRole = resolvedRoles[0] || normalizeRoleForAuthorize(user.role);

      const sessionUser: AuthSessionUser = {
        ...decoded,
        sub: userId,
        email: String(user.email || ""),
        role: primaryRole,
        roles: resolvedRoles,
        permissions: Array.isArray(user.permissions) ? user.permissions : [],
        fullName: String(user.full_name || ""),
        tokenVersion: currentVersion,
        branchId: user.branch_id ?? null,
        primaryRegionId: user.primary_region_id ?? null,
        scope: {
          branchId: user.branch_id ?? null,
          primaryRegionId: user.primary_region_id ?? null,
        },
      };

      // Attach the typed session user to the request
      (req as AuthenticatedRequest).user = sessionUser;
      next();
    } catch (err) {
      const authError = err as { name?: string; message?: string };
      if (
        authError &&
        (authError.name === "TokenExpiredError" || authError.name === "JsonWebTokenError")
      ) {
        res.status(401).json({ message: "Invalid or expired token", requestId });
        return;
      }
      next(err);
    }
  }

  function authorize(...roles: string[]) {
    const allowedRoles = new Set(
      roles.map((r) => normalizeRoleForAuthorize(r)).filter(Boolean),
    );

    return (req: Request, res: Response, next: NextFunction): void => {
      const authReq = req as AuthenticatedRequest;
      const currentRoles = resolveAssignedRoles({
        role: authReq.user?.role,
        roles: authReq.user?.roles,
      });
      const currentRole = currentRoles[0] || "";
      const isAllowed = currentRoles.some((r) => allowedRoles.has(r));

      // Logger is attached by the bootstrap process, not typed on Request
      const logger = (req as unknown as Record<string, unknown>)?.app
        ? ((req as unknown as { app: { locals?: { logger?: { warn?: (...a: unknown[]) => void; debug?: (...a: unknown[]) => void } } } }).app?.locals?.logger)
        : undefined;

      const logPayload = {
        path: req.originalUrl || req.url,
        method: req.method,
        requestId: authReq.requestId ?? null,
        role: currentRole,
        roles: currentRoles,
        allowedRoles: [...allowedRoles],
      };

      if (!authReq.user || !isAllowed) {
        if (logger && typeof logger.warn === "function") {
          logger.warn("authz.role.decision", { ...logPayload, decision: "deny" });
        }
        res.status(403).json({ message: "Forbidden: insufficient role" });
        return;
      }

      if (logger && typeof logger.debug === "function") {
        logger.debug("authz.role.decision", { ...logPayload, decision: "allow" });
      }

      next();
    };
  }

  return {
    createToken,
    verifyToken,
    authenticate,
    authorize,
  };
}

function normalizeRoleForAuthorize(role: unknown): string {
  const normalized = normalizeRoleInput(role);
  if (typeof normalized === "string" && normalized.trim()) {
    return normalized.trim().toLowerCase();
  }
  return String(role || "").trim().toLowerCase();
}

export {
  createAuthMiddleware,
};
