/**
 * tenantStore.ts
 *
 * AsyncLocalStorage-based tenant context store.
 *
 * Why AsyncLocalStorage?
 *   Prisma's $use middleware and $extends hooks run outside of the Express
 *   request object, so they cannot read req.tenantId directly. AsyncLocalStorage
 *   propagates the tenant ID through the entire async call chain that originates
 *   from a single HTTP request — including Prisma queries, service calls, and
 *   background work spawned within that request.
 *
 * Usage:
 *   - tenantContext middleware calls tenantStore.run({ tenantId }, next)
 *   - Any code deeper in the call chain calls getCurrentTenantId() to read it
 *   - The Prisma RLS hook in prismaClient.ts calls getCurrentTenantId() before
 *     each Postgres query to set app.tenant_id on the connection
 *
 * Background jobs / workers that run outside an HTTP request should call
 * runWithTenant(tenantId, fn) explicitly to establish a tenant context.
 */

import { AsyncLocalStorage } from "node:async_hooks";

interface TenantContext {
  tenantId: string;
}

/** Default tenant used in single-tenant and local/CI environments. */
const DEFAULT_TENANT = "default";

const tenantStore = new AsyncLocalStorage<TenantContext>();

/**
 * Returns the tenant ID for the current async context.
 * Falls back to DEFAULT_TENANT if called outside a tenant context
 * (e.g. background jobs that haven't set one up, health-check routes).
 */
function getCurrentTenantId(): string {
  return tenantStore.getStore()?.tenantId ?? DEFAULT_TENANT;
}

/**
 * Runs `fn` inside a tenant context. Useful for background jobs,
 * scheduled tasks, and test setup that run outside an HTTP request.
 *
 * @example
 *   await runWithTenant("acme_corp", () => loanService.disbursePending());
 */
function runWithTenant<T>(tenantId: string, fn: () => T): T {
  return tenantStore.run({ tenantId }, fn);
}

export { tenantStore, getCurrentTenantId, runWithTenant, DEFAULT_TENANT };
export type { TenantContext };
