import { dbClient, run } from "../db/connection.js";
import type { PrismaClientLike } from "../db/prismaClient.js";

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
    const createdAt = new Date().toISOString();
    if (dbClient === "sqlite") {
      await run(
        `
          INSERT INTO audit_logs (user_id, action, target_type, target_id, details, ip_address, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [userId, action, targetType, targetId, details, ipAddress, createdAt],
      );
      return;
    }

    await prisma.audit_logs.create({
      data: {
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
