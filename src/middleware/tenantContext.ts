/**
 * Tenant context middleware.
 *
 * Reads the `X-Tenant-ID` request header (defaults to `"default"`) and:
 *   1. Attaches it to `req.tenantId` so downstream route handlers and service
 *      layers can access it directly via the request object.
 *   2. Wraps the rest of the request lifecycle in an AsyncLocalStorage context
 *      (via tenantStore.run) so that Prisma's per-query RLS hook — which runs
 *      outside the Express request object — can read the tenant ID and set the
 *      `app.tenant_id` Postgres session variable for Row-Level Security.
 *
 * On SQLite (local / CI) the AsyncLocalStorage context is still set but the
 * Prisma RLS hook is a no-op, so there is no overhead.
 */

import { tenantStore } from "../utils/tenantStore.js";
import type { NextFunctionLike, RequestLike, ResponseLike } from "../types/runtime.js";

/** Fallback tenant used in single-tenant and local/CI environments. */
const DEFAULT_TENANT = "default";

/**
 * Validates that a tenant ID header value is safe to use.
 * Accepts only alphanumeric characters, hyphens, and underscores (max 64 chars).
 */
function sanitizeTenantId(raw: string | string[] | undefined): string {
  if (!raw || Array.isArray(raw)) {
    return DEFAULT_TENANT;
  }
  const trimmed = raw.trim();
  if (!trimmed || !/^[a-zA-Z0-9_-]{1,64}$/.test(trimmed)) {
    return DEFAULT_TENANT;
  }
  return trimmed;
}

/**
 * Express-compatible middleware that:
 *   - Attaches `req.tenantId` for the lifetime of the request
 *   - Runs the remaining middleware chain inside an AsyncLocalStorage tenant
 *     context so that Prisma can read tenant ID for RLS without the request obj
 */
function tenantContext(req: RequestLike, res: ResponseLike, next: NextFunctionLike): void {
  const raw = req.headers?.["x-tenant-id"];
  const tenantId = sanitizeTenantId(raw);
  req.tenantId = tenantId;

  // Wrap the rest of the call chain in the tenant context store so the Prisma
  // RLS hook (prismaClient.ts $use middleware) can call getCurrentTenantId().
  tenantStore.run({ tenantId }, () => next());
}

export { tenantContext, sanitizeTenantId, DEFAULT_TENANT };
