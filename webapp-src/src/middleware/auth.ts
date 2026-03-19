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

  /**
   * @param {string} token
   * @returns {JwtLikePayload}
   */
  function verifyTokenWithAnySecret(token: string): JwtLikePayload {
    let lastError: unknown = null;

    for (const secret of validSecrets) {
      try {
        const decoded = jwt.verify(token, secret);
        if (decoded && typeof decoded === "object") {
          return /** @type {JwtLikePayload} */ (decoded);
        }
        lastError = new Error("Invalid token payload");
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error("Invalid token secret configuration");
  }

  /**
   * @param {string} token
   * @returns {JwtLikePayload}
   */
  function verifyToken(token: string): JwtLikePayload {
    return verifyTokenWithAnySecret(token);
  }

  /**
   * @param {AuthTokenUser} user
   * @returns {string}
   */
  function createToken(user: AuthTokenUser): string {
    const roles = resolveAssignedRoles({ role: user.role, roles: user.roles });
    const primaryRole = roles[0] || normalizeRoleForAuthorize(user.role);
    const expiresIn = tokenExpiry as any;
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

  /**
   * @param {any} req
   * @param {any} res
   * @param {(error?: any) => void} next
   * @returns {Promise<void>}
   */
  async function authenticate(req: any, res: any, next: (error?: any) => void): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ message: "Authorization token is required", requestId: req.requestId || null });
      return;
    }

    const token = authHeader.slice(7);
    try {
      const blacklisted = await isTokenBlacklisted(token);
      if (blacklisted) {
        res.status(401).json({ message: "Session has been revoked", requestId: req.requestId || null });
        return;
      }

      const decoded = verifyToken(token);
      const tokenType = typeof decoded.typ === "string" ? decoded.typ.trim().toLowerCase() : "";
      if (tokenType && tokenType !== "access") {
        res.status(401).json({ message: "Invalid or expired token", requestId: req.requestId || null });
        return;
      }
      const userId = Number(decoded.sub || 0);
      if (!Number.isInteger(userId) || userId <= 0) {
        res.status(401).json({ message: "Invalid or expired token", requestId: req.requestId || null });
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
        user.roles = resolveAssignedRoles({
          role: user.role,
          roles: user.roles,
        });
        user.permissions = Array.isArray(user.permissions)
          ? user.permissions
          : await getEffectivePermissionsForUser(userId, user.roles || user.role);
      }

      if (!user || user.is_active !== 1) {
        await invalidateCachedAuthSessionUser(userId);
        res.status(401).json({ message: "Invalid or inactive user session", requestId: req.requestId || null });
        return;
      }

      const tokenVersion = Number(decoded.tokenVersion || 0);
      const currentVersion = Number(user.token_version || 0);
      if (tokenVersion !== currentVersion) {
        await invalidateCachedAuthSessionUser(userId);
        res.status(401).json({ message: "Session has been revoked", requestId: req.requestId || null });
        return;
      }

      await cacheAuthSessionUser(user);
      const resolvedRoles = resolveAssignedRoles({
        role: user.role,
        roles: user.roles,
      });
      const primaryRole = resolvedRoles[0] || normalizeRoleForAuthorize(user.role);

      /** @type {AuthSessionUser} */
      req.user = {
        ...decoded,
        email: user.email,
        role: primaryRole,
        roles: resolvedRoles,
        permissions: Array.isArray(user.permissions) ? user.permissions : [],
        fullName: user.full_name,
        tokenVersion: currentVersion,
        branchId: user.branch_id || null,
        primaryRegionId: user.primary_region_id || null,
        scope: {
          branchId: user.branch_id || null,
          primaryRegionId: user.primary_region_id || null,
        },
      };
      next();
    } catch (error) {
      const authError = error as { name?: string; message?: string };
      if (authError && (authError.name === "TokenExpiredError" || authError.name === "JsonWebTokenError")) {
        res.status(401).json({ message: "Invalid or expired token", requestId: req.requestId || null });
        return;
      }

      next(authError);
    }
  }

  /**
   * @param {...string} roles
   * @returns {(req: any, res: any, next: (error?: any) => void) => void}
   */
  function authorize(...roles: string[]) {
    const allowedRoles = new Set(roles.map((role) => normalizeRoleForAuthorize(role)).filter(Boolean));
    return (req: any, res: any, next: (error?: any) => void) => {
      const currentRoles = resolveAssignedRoles({
        role: req?.user?.role,
        roles: req?.user?.roles,
      });
      const currentRole = currentRoles[0] || "";
      const isAllowed = currentRoles.some((role) => allowedRoles.has(role));
      const logger = req?.app?.locals?.logger;
      const logPayload = {
        path: req?.originalUrl || req?.url,
        method: req?.method,
        requestId: req?.requestId || null,
        role: currentRole,
        roles: currentRoles,
        allowedRoles: [...allowedRoles],
      };
      if (!req.user || !isAllowed) {
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
