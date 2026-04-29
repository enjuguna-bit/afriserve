import { run } from "../db/connection.js";
import { getCurrentTenantId } from "../utils/tenantStore.js";

interface WriteAuditLogPayload {
  userId?: number | null;
  action: string;
  targetType?: string | null;
  targetId?: number | null;
  details?: string | null;
  ipAddress?: string | null;
}

/**
 * Audit service — raw SQL for both SQLite and Postgres.
 * The audit_logs table is append-only (enforced by a database trigger that
 * blocks UPDATE and DELETE), so we only ever INSERT here.
 */
function createAuditService() {
  async function writeAuditLog({
    userId = null,
    action,
    targetType = null,
    targetId = null,
    details = null,
    ipAddress = null,
  }: WriteAuditLogPayload): Promise<void> {
    const createdAt = new Date().toISOString();
    const tenantId = getCurrentTenantId();
    await run(
      `
        INSERT INTO audit_logs (tenant_id, user_id, action, target_type, target_id, details, ip_address, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [tenantId, userId, action, targetType, targetId, details, ipAddress, createdAt],
    );
  }

  return {
    writeAuditLog,
  };
}

export {
  createAuditService,
};
