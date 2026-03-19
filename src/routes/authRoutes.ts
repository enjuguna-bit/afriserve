import type { AuthRouteDeps, RouteRegistrar } from "../types/routeDeps.js";
import { invalidateCachedAuthSessionUser } from "../services/authSessionCache.js";
import { changePasswordLimiter, passwordResetLimiter } from "../middleware/userRateLimit.js";
import { getEffectivePermissionsForUser } from "../services/permissionService.js";
import { getUserRolesForUser, resolveAssignedRoles } from "../services/userRoleService.js";
import { validate } from "../middleware/validate.js";

/**
 * @openapi
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *   schemas:
 *     AuthLoginRequest:
 *       type: object
 *       required: [email, password]
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *         password:
 *           type: string
 *           format: password
 *     AuthRefreshRequest:
 *       type: object
 *       required: [token]
 *       properties:
 *         token:
 *           type: string
 *     AuthTokenResponse:
 *       type: object
 *       required: [token]
 *       properties:
 *         token:
 *           type: string
 */

/**
 * @param {RouteRegistrar} app
 * @param {AuthRouteDeps} deps
 */
function registerAuthRoutes(app: RouteRegistrar, deps: AuthRouteDeps) {
  const {
    run,
    get,
    all,
    executeTransaction,
    authenticate,
    createToken,
    verifyToken,
    issueRefreshToken,
    rotateRefreshToken,
    revokeRefreshToken,
    blacklistToken,
    authLimiter,
    writeAuditLog,
    issuePasswordResetToken,
    hierarchyService,
    getRoleCatalog,
    normalizeEmail,
    createHttpError,
    logger,
    loginSchema,
    refreshTokenSchema,
    changePasswordSchema,
    resetPasswordRequestSchema,
    resetPasswordConfirmSchema,
    bcrypt,
    crypto,
    loginMaxFailedAttempts,
    loginLockMinutes,
  } = deps;

  const assignmentRoles = new Set(["area_manager", "investor", "partner"]);
  const refreshTokenErrorMessages = new Set([
    "Invalid refresh token",
    "Refresh token expired or already used",
  ]);

  function isRefreshAuthError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    return error.name === "TokenExpiredError"
      || error.name === "JsonWebTokenError"
      || error.name === "NotBeforeError"
      || refreshTokenErrorMessages.has(error.message);
  }

  function isAccessTokenPayload(decoded: Record<string, any>): boolean {
    const tokenType = typeof decoded.typ === "string" ? decoded.typ.trim().toLowerCase() : "";
    return !tokenType || tokenType === "access";
  }

  /**
   * @openapi
   * /api/auth/login:
   *   post:
   *     tags: [Auth]
   *     summary: Login and get a JWT access token
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/AuthLoginRequest'
   *     responses:
   *       200:
   *         description: Authenticated
   *       401:
   *         description: Invalid credentials
   *       423:
   *         description: Account temporarily locked
   */
  app.post("/api/auth/login", authLimiter, validate(loginSchema), async (req, res, next) => {
    try {
      const payload = req.body;
      const normalizedEmail = normalizeEmail(payload.email);
      const user = await get(
        `
          SELECT
            id,
            full_name,
            email,
            password_hash,
            role,
            is_active,
            failed_login_attempts,
            locked_until,
            token_version,
            branch_id,
            primary_region_id
          FROM users
          WHERE LOWER(email) = ?
        `,
        [normalizedEmail],
      );

      if (!user || user.is_active !== 1) {
        res.status(401).json({ message: "Invalid credentials" });
        return;
      }

      if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
        await writeAuditLog({
          userId: user.id,
          action: "auth.login.blocked.locked",
          targetType: "user",
          targetId: user.id,
          ipAddress: req.ip,
        });
        res.status(423).json({ message: "Account is temporarily locked due to failed login attempts" });
        return;
      }

      const passwordMatch = await bcrypt.compare(payload.password, user.password_hash);
      if (!passwordMatch) {
        const attempts = (user.failed_login_attempts || 0) + 1;
        const shouldLock = attempts >= loginMaxFailedAttempts;
        const lockedUntil = shouldLock
          ? new Date(Date.now() + loginLockMinutes * 60 * 1000).toISOString()
          : null;

        await run(
          "UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?",
          [attempts, lockedUntil, user.id],
        );

        await writeAuditLog({
          userId: user.id,
          action: shouldLock ? "auth.login.failed.locked" : "auth.login.failed",
          targetType: "user",
          targetId: user.id,
          details: JSON.stringify({ failedAttempts: attempts }),
          ipAddress: req.ip,
        });

        res.status(401).json({ message: "Invalid credentials" });
        return;
      }

      await run(
        "UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?",
        [user.id],
      );

      const userRoles = await getUserRolesForUser({
        all,
        get,
        userId: Number(user.id),
        primaryRole: user.role,
      });
      const permissions = await getEffectivePermissionsForUser(Number(user.id), userRoles);
      const token = createToken({ ...user, roles: userRoles });
      const refreshToken = await issueRefreshToken(user.id, Number(user.token_version || 0));
      await writeAuditLog({
        userId: user.id,
        action: "auth.login.success",
        targetType: "user",
        targetId: user.id,
        ipAddress: req.ip,
      });

      res.status(200).json({
        token,
        refreshToken,
        user: {
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          role: user.role,
          roles: userRoles,
          permissions,
          branch_id: user.branch_id || null,
          primary_region_id: user.primary_region_id || null,
          scope: {
            branchId: user.branch_id || null,
            primaryRegionId: user.primary_region_id || null,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * @openapi
   * /api/auth/refresh:
   *   post:
   *     tags: [Auth]
   *     summary: Refresh a valid session token before expiry
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/AuthRefreshRequest'
   *     responses:
   *       200:
   *         description: New access token issued
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/AuthTokenResponse'
   *       401:
   *         description: Invalid, expired, or revoked token
   */
  const refreshSessionHandler = async (req: any, res: any, next: (error?: any) => void) => {
    try {
      const payload = refreshTokenSchema.parse(req.body);
      const normalizedToken = String(payload.token || "").trim();
      let userId: number | null = null;
      let presentedTokenVersion = 0;
      let nextRefreshToken: string | null = null;

      try {
        const rotated = await rotateRefreshToken(normalizedToken);
        userId = Number(rotated.userId);
        presentedTokenVersion = Number(rotated.tokenVersion || 0);
        nextRefreshToken = rotated.refreshToken;
      } catch (rotationError) {
        throw rotationError;
      }

      if (!Number.isInteger(userId) || userId <= 0) {
        res.status(401).json({ message: "Invalid or expired token" });
        return;
      }

      const user = await get(
        `
          SELECT
            id,
            full_name,
            email,
            role,
            is_active,
            token_version,
            branch_id,
            primary_region_id
          FROM users
          WHERE id = ?
        `,
        [userId],
      );

      if (!user || user.is_active !== 1) {
        await invalidateCachedAuthSessionUser(Number(userId));
        res.status(401).json({ message: "Invalid or inactive user session" });
        return;
      }

      const currentVersion = Number(user.token_version || 0);
      if (presentedTokenVersion !== currentVersion) {
        await invalidateCachedAuthSessionUser(Number(user.id));
        res.status(401).json({ message: "Session has been revoked" });
        return;
      }

      if (!nextRefreshToken) {
        nextRefreshToken = await issueRefreshToken(user.id, currentVersion);
      }

      const userRoles = await getUserRolesForUser({
        all,
        get,
        userId: Number(user.id),
        primaryRole: user.role,
      });
      const permissions = await getEffectivePermissionsForUser(Number(user.id), userRoles);
      const token = createToken({ ...user, roles: userRoles });
      await writeAuditLog({
        userId: user.id,
        action: "auth.token.refreshed",
        targetType: "user",
        targetId: user.id,
        ipAddress: req.ip,
      });

      res.status(200).json({ token, refreshToken: nextRefreshToken, permissions });
    } catch (error) {
      if (isRefreshAuthError(error)) {
        res.status(401).json({ message: "Invalid or expired token" });
        return;
      }

      next(error);
    }
  };

  app.post("/api/auth/refresh", authLimiter, validate(refreshTokenSchema), refreshSessionHandler);
  app.post("/api/auth/refresh-token", authLimiter, validate(refreshTokenSchema), refreshSessionHandler);

  /**
   * @openapi
   * /api/auth/me:
   *   get:
   *     tags: [Auth]
   *     summary: Get current authenticated user profile
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Authenticated user profile
   *       401:
   *         description: Missing or invalid token
   */
  app.get("/api/auth/me", authenticate, async (req, res, next) => {
    try {
      const user = await get(
        `
          SELECT
            u.id,
            u.full_name,
            u.email,
            u.role,
            u.is_active,
            u.branch_id,
            u.primary_region_id,
            u.created_at,
            b.name AS branch_name,
            r.name AS region_name
          FROM users u
          LEFT JOIN branches b ON b.id = u.branch_id
          LEFT JOIN regions r ON r.id = COALESCE(u.primary_region_id, b.region_id)
          WHERE u.id = ?
        `,
        [req.user.sub],
      );

      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      const assignedBranchIds: number[] = assignmentRoles.has(String(user.role || "").trim().toLowerCase())
        ? await hierarchyService.getAreaManagerBranchIds(user.id)
        : [];
      const roles = await getUserRolesForUser({
        all,
        get,
        userId: Number(user.id),
        primaryRole: user.role,
      });
      const normalizedRoles = resolveAssignedRoles({
        role: user.role,
        roles,
      });
      const permissions = await getEffectivePermissionsForUser(Number(user.id), normalizedRoles);

      const roleCatalog = typeof getRoleCatalog === "function" ? getRoleCatalog() : {};
      const roleMetadata = roleCatalog && typeof roleCatalog === "object"
        ? roleCatalog[user.role] || null
        : null;

      res.status(200).json({
        ...user,
        branch_name: user.branch_name || null,
        region_name: user.region_name || null,
        role_description: roleMetadata?.description || null,
        roles: normalizedRoles,
        permissions,
        scope: {
          branchId: user.branch_id || null,
          primaryRegionId: user.primary_region_id || null,
        },
        assigned_branch_ids: assignedBranchIds,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * @openapi
   * /api/auth/logout:
   *   post:
   *     tags: [Auth]
   *     summary: Revoke current token session
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Logged out
   *       401:
   *         description: Missing or invalid token
   */
  app.post("/api/auth/logout", authenticate, async (req, res, next) => {
    try {
      const authHeader = String(req.headers.authorization || "");
      if (authHeader.startsWith("Bearer ")) {
        await blacklistToken(authHeader.slice(7).trim());
      }

      const refreshTokenCandidate = typeof req.body?.refreshToken === "string"
        ? String(req.body.refreshToken).trim()
        : "";
      if (refreshTokenCandidate) {
        await revokeRefreshToken(refreshTokenCandidate);
      }

      await run("UPDATE users SET token_version = token_version + 1 WHERE id = ?", [req.user.sub]);
      await invalidateCachedAuthSessionUser(Number(req.user.sub));
      hierarchyService.invalidateHierarchyCaches({ userId: req.user.sub });

      await writeAuditLog({
        userId: req.user.sub,
        action: "auth.logout.success",
        targetType: "user",
        targetId: req.user.sub,
        ipAddress: req.ip,
      });

      res.status(200).json({ message: "Logged out successfully" });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/change-password", authenticate, changePasswordLimiter, validate(changePasswordSchema), async (req, res, next) => {
    try {
      const payload = req.body;
      const user = await get("SELECT id, password_hash FROM users WHERE id = ?", [req.user.sub]);

      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      const matches = await bcrypt.compare(payload.currentPassword, user.password_hash);
      if (!matches) {
        res.status(400).json({ message: "Current password is incorrect" });
        return;
      }

      const newPasswordHash = await bcrypt.hash(payload.newPassword, 10);
      await run(
        "UPDATE users SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL, token_version = token_version + 1 WHERE id = ?",
        [newPasswordHash, req.user.sub],
      );
      await invalidateCachedAuthSessionUser(Number(req.user.sub));

      await writeAuditLog({
        userId: req.user.sub,
        action: "auth.password.changed",
        targetType: "user",
        targetId: req.user.sub,
        ipAddress: req.ip,
      });

      res.status(200).json({ message: "Password updated successfully" });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/reset-password/request", authLimiter, passwordResetLimiter, validate(resetPasswordRequestSchema), async (req, res, next) => {
    try {
      const payload = req.body;
      const normalizedEmail = normalizeEmail(payload.email);
      const user = await get("SELECT id, email, is_active FROM users WHERE LOWER(email) = ?", [normalizedEmail]);

      if (user && user.is_active === 1) {
        try {
          await issuePasswordResetToken({
            userId: user.id,
            userEmail: user.email,
            ipAddress: req.ip,
            requestedBy: "self",
          });
        } catch (deliveryError) {
          if (logger && typeof logger.error === "function") {
            logger.error("auth.password_reset.delivery_failed", {
              userId: user.id,
              error: deliveryError,
            });
          }
        }
      }

      res.status(200).json({
        message: "If the account exists, reset instructions have been sent",
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/reset-password/confirm", authLimiter, validate(resetPasswordConfirmSchema), async (req, res, next) => {
    try {
      const payload = req.body;
      const tokenHash = crypto.createHash("sha256").update(payload.token).digest("hex");

      const resetRow = await get(
        `
          SELECT id, user_id, expires_at, used_at
          FROM password_resets
          WHERE token_hash = ?
        `,
        [tokenHash],
      );

      if (!resetRow || resetRow.used_at) {
        res.status(400).json({ message: "Invalid or already used reset token" });
        return;
      }

      if (new Date(resetRow.expires_at).getTime() < Date.now()) {
        res.status(400).json({ message: "Reset token has expired" });
        return;
      }

      const newPasswordHash = await bcrypt.hash(payload.newPassword, 10);
      await executeTransaction(async ({ run: txRun }) => {
        const updateUser = await txRun(
          "UPDATE users SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL, token_version = token_version + 1 WHERE id = ?",
          [newPasswordHash, resetRow.user_id],
        );
        if (updateUser.changes !== 1) {
          throw createHttpError(404, "User not found");
        }

        const markResetUsed = await txRun(
          "UPDATE password_resets SET used_at = datetime('now') WHERE id = ? AND used_at IS NULL",
          [resetRow.id],
        );
        if (markResetUsed.changes !== 1) {
          throw createHttpError(400, "Invalid or already used reset token");
        }
      });
      await invalidateCachedAuthSessionUser(Number(resetRow.user_id));

      await writeAuditLog({
        userId: resetRow.user_id,
        action: "auth.password.reset.completed",
        targetType: "user",
        targetId: resetRow.user_id,
        ipAddress: req.ip,
      });

      res.status(200).json({ message: "Password reset successful" });
    } catch (error) {
      next(error);
    }
  });
}

export {
  registerAuthRoutes,
};
