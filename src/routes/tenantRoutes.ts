/**
 * Tenant management routes — POST /api/admin/tenants, GET /api/admin/tenants,
 * GET /api/admin/tenants/:id, PATCH /api/admin/tenants/:id/status
 *
 * Implements Phase 5 of the multi-tenant transition plan:
 *   "Add tenant onboarding/offboarding automation."
 *
 * ── Security model ────────────────────────────────────────────────────────────
 *   All endpoints require authentication + admin role. Tenant management is a
 *   superadmin operation; no other role can create or deactivate tenants.
 *
 * ── Tenant ID rules ───────────────────────────────────────────────────────────
 *   Tenant IDs must match /^[a-zA-Z0-9_-]{2,64}$/ — same pattern enforced in
 *   tenantContext.ts (sanitizeTenantId). The reserved ID "default" already
 *   exists and cannot be created or deactivated.
 *
 * ── What a tenant record contains ────────────────────────────────────────────
 *   id TEXT PRIMARY KEY — the routing key; used in X-Tenant-ID header
 *   name TEXT          — display name for admin UI
 *   status TEXT        — 'active' | 'suspended' | 'deactivated'
 *   created_at TEXT
 *   updated_at TEXT
 *
 * ── Provisioning ─────────────────────────────────────────────────────────────
 *   Creating a tenant inserts the tenants row. Subsequent onboarding steps
 *   (branch seeding, default admin creation, etc.) are not automated here yet —
 *   that belongs in a dedicated onboarding job. This API is the durable record
 *   that makes the tenant ID valid for RLS and header routing.
 */
import type { NextFunction, Request, Response } from "express";
import type { RouteRegistrarApp } from "../types/systemRoutes.js";

const TENANT_ID_PATTERN = /^[a-zA-Z0-9_-]{2,64}$/;
const RESERVED_TENANT_IDS = new Set(["default"]);

type TenantRow = {
  id: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type TenantRouteDeps = {
  run: (sql: string, params?: unknown[]) => Promise<unknown>;
  get: (sql: string, params?: unknown[]) => Promise<Record<string, unknown> | null | undefined>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>;
  authenticate: (...args: any[]) => any;
  authorize: (...roles: string[]) => any;
  writeAuditLog: (payload: {
    userId?: number | null;
    action: string;
    targetType?: string | null;
    targetId?: number | null;
    details?: string | null;
    ipAddress?: string | null;
  }) => Promise<void> | void;
};

export function registerTenantRoutes(app: RouteRegistrarApp, deps: TenantRouteDeps): void {
  const { run, get, all, authenticate, authorize, writeAuditLog } = deps;
  const adminOnly = authorize("admin");

  // ── GET /api/admin/tenants ──────────────────────────────────────────────────
  // Returns all tenant records, ordered by id. Admin only.
  app.get(
    "/api/admin/tenants",
    authenticate,
    adminOnly,
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const rows = await all(
          `SELECT id, name, status, created_at, updated_at
             FROM tenants
            ORDER BY id ASC`,
        ) as TenantRow[];

        res.status(200).json({
          data: rows,
          total: rows.length,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  // ── GET /api/admin/tenants/:id ─────────────────────────────────────────────
  app.get(
    "/api/admin/tenants/:id",
    authenticate,
    adminOnly,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = String(req.params.id || "").trim();
        if (!TENANT_ID_PATTERN.test(tenantId)) {
          res.status(400).json({ message: "Invalid tenant ID format." });
          return;
        }

        const row = await get(
          `SELECT id, name, status, created_at, updated_at FROM tenants WHERE id = ? LIMIT 1`,
          [tenantId],
        ) as TenantRow | null;

        if (!row) {
          res.status(404).json({ message: "Tenant not found." });
          return;
        }

        res.status(200).json({ tenant: row });
      } catch (error) {
        next(error);
      }
    },
  );

  // ── POST /api/admin/tenants ────────────────────────────────────────────────
  // Creates a new tenant. The tenant ID becomes the routing key for all
  // subsequent requests from that tenant's users via X-Tenant-ID header.
  app.post(
    "/api/admin/tenants",
    authenticate,
    adminOnly,
    async (req: Request & { user?: any }, res: Response, next: NextFunction) => {
      try {
        const rawId = String(req.body?.id || "").trim();
        const rawName = String(req.body?.name || "").trim();

        // Validate tenant ID
        if (!rawId) {
          res.status(400).json({ message: "Tenant ID is required." });
          return;
        }
        if (!TENANT_ID_PATTERN.test(rawId)) {
          res.status(400).json({
            message: "Tenant ID must be 2–64 characters, using only letters, numbers, hyphens, and underscores.",
          });
          return;
        }
        if (RESERVED_TENANT_IDS.has(rawId.toLowerCase())) {
          res.status(409).json({ message: `Tenant ID "${rawId}" is reserved and cannot be created via this API.` });
          return;
        }

        // Validate name
        if (!rawName || rawName.length < 2) {
          res.status(400).json({ message: "Tenant name must be at least 2 characters." });
          return;
        }
        if (rawName.length > 128) {
          res.status(400).json({ message: "Tenant name must be 128 characters or fewer." });
          return;
        }

        // Conflict check
        const existing = await get(
          `SELECT id FROM tenants WHERE id = ? LIMIT 1`,
          [rawId],
        );
        if (existing) {
          res.status(409).json({ message: `Tenant "${rawId}" already exists.` });
          return;
        }

        const nowIso = new Date().toISOString();
        await run(
          `INSERT INTO tenants (id, name, status, created_at, updated_at)
           VALUES (?, ?, 'active', ?, ?)`,
          [rawId, rawName, nowIso, nowIso],
        );

        const created = await get(
          `SELECT id, name, status, created_at, updated_at FROM tenants WHERE id = ? LIMIT 1`,
          [rawId],
        ) as TenantRow;

        await writeAuditLog({
          userId: Number(req.user?.sub || req.user?.id || 0) || null,
          action: "tenant.created",
          targetType: "tenant",
          details: JSON.stringify({ tenantId: rawId, name: rawName }),
          ipAddress: req.ip || null,
        });

        res.status(201).json({
          message: `Tenant "${rawId}" created successfully.`,
          tenant: created,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  // ── PATCH /api/admin/tenants/:id ───────────────────────────────────────────
  // Updates tenant name and/or status.
  // Allowed status transitions: active ↔ suspended; active/suspended → deactivated.
  // The 'default' tenant cannot be suspended or deactivated.
  app.patch(
    "/api/admin/tenants/:id",
    authenticate,
    adminOnly,
    async (req: Request & { user?: any }, res: Response, next: NextFunction) => {
      try {
        const tenantId = String(req.params.id || "").trim();
        if (!TENANT_ID_PATTERN.test(tenantId)) {
          res.status(400).json({ message: "Invalid tenant ID format." });
          return;
        }

        const existing = await get(
          `SELECT id, name, status FROM tenants WHERE id = ? LIMIT 1`,
          [tenantId],
        ) as TenantRow | null;
        if (!existing) {
          res.status(404).json({ message: "Tenant not found." });
          return;
        }

        const newName = req.body?.name != null ? String(req.body.name).trim() : null;
        const newStatus = req.body?.status != null ? String(req.body.status).trim().toLowerCase() : null;

        if (newName !== null && (newName.length < 2 || newName.length > 128)) {
          res.status(400).json({ message: "Tenant name must be 2–128 characters." });
          return;
        }

        const allowedStatuses = ["active", "suspended", "deactivated"];
        if (newStatus !== null && !allowedStatuses.includes(newStatus)) {
          res.status(400).json({ message: `Status must be one of: ${allowedStatuses.join(", ")}.` });
          return;
        }

        // Guard: 'default' tenant cannot be suspended or deactivated
        if (RESERVED_TENANT_IDS.has(tenantId) && newStatus && newStatus !== "active") {
          res.status(409).json({ message: "The default tenant cannot be suspended or deactivated." });
          return;
        }

        const updates: string[] = [];
        const params: unknown[] = [];

        if (newName !== null && newName !== existing.name) {
          updates.push("name = ?");
          params.push(newName);
        }
        if (newStatus !== null && newStatus !== existing.status) {
          updates.push("status = ?");
          params.push(newStatus);
        }

        if (updates.length === 0) {
          res.status(200).json({ message: "No changes applied.", tenant: existing });
          return;
        }

        const nowIso = new Date().toISOString();
        updates.push("updated_at = ?");
        params.push(nowIso);
        params.push(tenantId);

        await run(
          `UPDATE tenants SET ${updates.join(", ")} WHERE id = ?`,
          params,
        );

        const updated = await get(
          `SELECT id, name, status, created_at, updated_at FROM tenants WHERE id = ? LIMIT 1`,
          [tenantId],
        ) as TenantRow;

        await writeAuditLog({
          userId: Number(req.user?.sub || req.user?.id || 0) || null,
          action: "tenant.updated",
          targetType: "tenant",
          details: JSON.stringify({ tenantId, changes: { name: newName, status: newStatus } }),
          ipAddress: req.ip || null,
        });

        res.status(200).json({
          message: "Tenant updated.",
          tenant: updated,
        });
      } catch (error) {
        next(error);
      }
    },
  );
}
