import type { Request, Response, NextFunction } from "express";
import type { LoggerLike } from "../types/runtime.js";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { normalizeRoleInput } from "../config/roles.js";
import { getEffectivePermissionsForUser } from "../services/permissionService.js";
import { loadUserWithPrivilegedTenantFallback } from "../services/authTenantLookupService.js";
import { resolveAssignedRoles } from "../services/userRoleService.js";
import { resolveJwtSecretConfig } from "../utils/jwtSecrets.js";
import { getDefaultTenantId } from "../utils/env.js";
import {
  cacheAuthSessionUser,
  getCachedAuthSessionUser,
  invalidateCachedAuthSessionUser,
} from "../services/authSessionCache.js";
import type {
  AuthenticatedRequest,
  AuthSessionUser,
  AuthTokenUser,
  AuthUserRow,
  CreateAuthMiddlewareOptions,
  JwtLikePayload,
} from "../types/auth.js";

const AUTHORIZATION_REFRESH_ROLES = new Set(["admin", "it"]);
const DEFAULT_TENANT_ID = getDefaultTenantId();
const configuredSessionRevalidateSeconds = Number(process.env.AUTH_SESSION_CACHE_REVALIDATE_AFTER_SECONDS);
const sessionRevalidateAfterMs = (
  Number.isFinite(configuredSessionRevalidateSeconds) && configuredSessionRevalidateSeconds > 0
    ? Math.floor(configuredSessionRevalidateSeconds)
    : 15
) * 1000;

function createAuthMiddleware({
  jwtSecret,
  jwtSecrets = [],
  tokenExpiry,
  get,
  all = async () => [],
  isTokenBlacklisted = async () => false,
}: CreateAuthMiddlewareOptions) {
  const { activeSecret, validSecrets } = resolveJwtSecretConfig(jwtSecret, jwtSecrets);

  async function loadAuthSessionLookup(userId: number): Promise<{
    user: AuthUserRow | null;
    privilegedTenantFallback: boolean;
    lookupTenantId: string;
  }> {
    const lookupResult = await loadUserWithPrivilegedTenantFallback<AuthUserRow>({
      get,
      all,
      lookupByTenant: async (tenantId) => (
        await get(
          `
            SELECT id, full_name, email, role, is_active, token_version, branch_id, primary_region_id
            FROM users
            WHERE id = ? AND tenant_id = ?
          `,
          [userId, tenantId],
        )
      ) || null,
    });
    const user = lookupResult.user;

    if (!user) {
      return {
        user: null,
        privilegedTenantFallback: lookupResult.privilegedTenantFallback,
        lookupTenantId: lookupResult.lookupTenantId,
      };
    }

    if (Number(user.is_active || 0) === 1) {
      user.roles = lookupResult.roles;
      user.permissions = await getEffectivePermissionsForUser(userId, lookupResult.roles || user.role, {
        tenantId: lookupResult.lookupTenantId,
      });
    }

    return {
      user,
      privilegedTenantFallback: lookupResult.privilegedTenantFallback,
      lookupTenantId: lookupResult.lookupTenantId,
    };
  }

  async function loadAuthSessionUser(userId: number): Promise<AuthUserRow | null> {
    const lookup = await loadAuthSessionLookup(userId);
    return lookup.user;
  }

  function shouldRefreshCachedAuthorizationState(user: AuthUserRow): boolean {
    const resolvedRoles = resolveAssignedRoles({ role: user.role, roles: user.roles });
    if (resolvedRoles.some((role) => AUTHORIZATION_REFRESH_ROLES.has(role))) {
      return true;
    }

    const cachedAtMs = Number(user.cached_at_ms || 0);
    if (!Number.isFinite(cachedAtMs) || cachedAtMs <= 0) {
      return true;
    }

    return Date.now() - cachedAtMs >= sessionRevalidateAfterMs;
  }

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
    const tenantId = String(user.tenantId ?? user.tenant_id ?? "").trim() || null;
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
        tenantId,
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
      const requestTenantId = String((req as AuthenticatedRequest).tenantId || "").trim();
      const tokenTenantId = typeof decoded.tenantId === "string" ? decoded.tenantId.trim() : "";

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

      let lookedUpUser: AuthUserRow | null = null;
      if (tokenTenantId && requestTenantId && tokenTenantId !== requestTenantId) {
        const lookup = await loadAuthSessionLookup(userId);
        lookedUpUser = lookup.user;
        const allowPrivilegedTenantSwitch = (
          tokenTenantId === DEFAULT_TENANT_ID
          && requestTenantId !== DEFAULT_TENANT_ID
          && lookup.privilegedTenantFallback
          && Number(lookup.user?.is_active || 0) === 1
        );

        if (!allowPrivilegedTenantSwitch) {
          res.status(401).json({ message: "Invalid or expired token", requestId });
          return;
        }
      }

      let user = await getCachedAuthSessionUser(userId);
      if (lookedUpUser) {
        user = lookedUpUser;
      } else if (!user) {
        user = await loadAuthSessionUser(userId);
        if (user && Number(user.is_active || 0) === 1) {
          await cacheAuthSessionUser(user);
        }
      } else if (shouldRefreshCachedAuthorizationState(user)) {
        user = await loadAuthSessionUser(userId);
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
        tenantId: requestTenantId || tokenTenantId || null,
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

      // Logger is attached to app.locals by the bootstrap process, not typed on Request
      const appLocals = (req as unknown as { app?: { locals?: { logger?: LoggerLike } } }).app?.locals;
      const logger = appLocals?.logger;

      const logPayload = {
        path: req.originalUrl || req.url,
        method: req.method,
        requestId: authReq.requestId ?? null,
        role: currentRole,
        roles: currentRoles,
        allowedRoles: [...allowedRoles],
      };

      if (!authReq.user || !isAllowed) {
        logger?.warn?.("authz.role.decision", { ...logPayload, decision: "deny" });
        res.status(403).json({ message: "Forbidden: insufficient role" });
        return;
      }

      logger?.debug?.("authz.role.decision", { ...logPayload, decision: "allow" });

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
