import { dbClient, run } from "../db/connection.js";
import type { PrismaClientLike } from "../db/prismaClient.js";
import { getCurrentTenantId } from "../utils/tenantStore.js";

interface CreateAuditServiceOptions {
  prisma: PrismaClientLike;
}

interface WriteAuditLogPayload {
  userId?: number | null;
  action: string;
  targetType?: string | null;
  targetId?: number | null;
  details?: string | null;
  ipAddress?: string | null;
}

function createAuditService({ prisma }: CreateAuditServiceOptions) {
  async function writeAuditLog({
    userId = null,
    action,
    targetType = null,
    targetId = null,
    details = null,
    ipAddress = null,
  }: WriteAuditLogPayload): Promise<void> {
    const createdAt = new Date();
    const tenantId = getCurrentTenantId();

    if (dbClient === "sqlite") {
      await run(
        `
          INSERT INTO audit_logs (tenant_id, user_id, action, target_type, target_id, details, ip_address, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [tenantId, userId, action, targetType, targetId, details, ipAddress, createdAt.toISOString()],
      );
      return;
    }

    await prisma.audit_logs.create({
      data: {
        tenant_id: tenantId,
        user_id: userId,
        action,
        target_type: targetType,
        target_id: targetId,
        details,
        ip_address: ipAddress,
        created_at: createdAt,
      },
    });
  }

  return {
    writeAuditLog,
  };
}

export {
  createAuditService,
};
