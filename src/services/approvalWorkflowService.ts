import {
  DomainConflictError,
  DomainValidationError,
  ForbiddenActionError,
} from "../domain/errors.js";
import { Prisma, prisma, type PrismaTransactionClient } from "../db/prismaClient.js";

type ApprovalRequestStatus = "pending" | "approved" | "rejected" | "cancelled" | "expired";

type ApprovalWorkflowServiceDeps = {
  checkerRoles: string[];
  pendingRequestTtlDays?: number;
};

type CreateApprovalRequestPayload = {
  requestType: "loan_restructure" | "loan_write_off" | "loan_top_up" | "loan_refinance" | "loan_term_extension";
  targetType: "loan";
  targetId: number;
  loanId: number;
  branchId: number | null | undefined;
  requestedByUserId: number;
  requestPayload: Record<string, unknown>;
  requestNote?: string | null;
};

type FinalizeApprovalRequestPayload = {
  requestId: number;
  checkerUserId: number;
  checkerRole: string;
  reviewNote?: string | null;
};

type RejectApprovalRequestPayload = FinalizeApprovalRequestPayload;

type ApprovalRequestClient = PrismaTransactionClient | typeof prisma;

const DEFAULT_PENDING_REQUEST_TTL_DAYS = 7;

function normalizeRole(role: unknown): string {
  return String(role || "").trim().toLowerCase();
}

function nowIso(): string {
  return new Date().toISOString();
}

function addDaysIso(baseIso: string, days: number): string {
  const parsed = new Date(baseIso);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString();
}

function isUniqueConstraintError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && (error as any).code === "P2002") {
    return true;
  }

  const message = String((error as { message?: unknown })?.message || "").toLowerCase();
  return message.includes("unique constraint") || message.includes("already exists");
}

function mapApprovalRequest(row: Record<string, any> | null | undefined): Record<string, any> | null {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id || 0),
    request_type: row.request_type,
    target_type: row.target_type,
    target_id: Number(row.target_id || 0),
    loan_id: Number(row.loan_id || 0),
    branch_id: Number(row.branch_id || 0) || null,
    requested_by_user_id: Number(row.requested_by_user_id || 0),
    checker_user_id: Number(row.checker_user_id || 0) || null,
    status: row.status,
    request_payload: row.request_payload,
    request_note: row.request_note || null,
    review_note: row.review_note || null,
    requested_at: row.requested_at,
    reviewed_at: row.reviewed_at || null,
    approved_at: row.approved_at || null,
    rejected_at: row.rejected_at || null,
    executed_at: row.executed_at || null,
    expires_at: row.expires_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function createApprovalWorkflowService(deps: ApprovalWorkflowServiceDeps) {
  const {
    checkerRoles,
    pendingRequestTtlDays = DEFAULT_PENDING_REQUEST_TTL_DAYS,
  } = deps;

  const checkerRoleSet = new Set(checkerRoles.map((role) => normalizeRole(role)).filter(Boolean));
  const normalizedPendingRequestTtlDays = Math.max(1, Math.floor(Number(pendingRequestTtlDays || DEFAULT_PENDING_REQUEST_TTL_DAYS)));

  function assertCheckerRole(role: unknown) {
    const normalizedRole = normalizeRole(role);
    if (!checkerRoleSet.has(normalizedRole)) {
      throw new ForbiddenActionError("Only authorized managers can review high-risk approval requests");
    }
  }

  async function expireStalePendingRequests(client: ApprovalRequestClient = prisma): Promise<number> {
    const expiredAt = nowIso();
    const result = await client.approval_requests.updateMany({
      where: {
        status: "pending",
        expires_at: {
          not: null,
          lt: expiredAt,
        },
      },
      data: {
        status: "expired",
        updated_at: expiredAt,
      },
    });

    return Number(result.count || 0);
  }

  async function getApprovalRequestById(requestId: number): Promise<Record<string, any> | null> {
    await expireStalePendingRequests();

    const row = await prisma.approval_requests.findUnique({
      where: { id: Number(requestId || 0) },
    });

    return mapApprovalRequest(row);
  }

  async function listPendingRequestsForLoan(loanId: number): Promise<Array<Record<string, any>>> {
    await expireStalePendingRequests();

    const rows = await prisma.approval_requests.findMany({
      where: {
        loan_id: Number(loanId || 0),
        status: "pending",
      },
      orderBy: {
        id: "desc",
      },
    });

    return rows.map((row: Record<string, any>) => mapApprovalRequest(row)).filter(Boolean) as Array<Record<string, any>>;
  }

  async function createPendingRequest(payload: CreateApprovalRequestPayload): Promise<number> {
    const requestType = String(payload.requestType || "").trim().toLowerCase();
    const targetType = String(payload.targetType || "").trim().toLowerCase();
    const targetId = Number(payload.targetId || 0);
    const loanId = Number(payload.loanId || 0);
    const requestedByUserId = Number(payload.requestedByUserId || 0);

    if (!requestType || !targetType || !targetId || !loanId || !requestedByUserId) {
      throw new DomainValidationError("Invalid approval request payload");
    }

    await expireStalePendingRequests();

    const createdAt = nowIso();
    const expiresAt = addDaysIso(createdAt, normalizedPendingRequestTtlDays);

    try {
      const created = await prisma.$transaction(async (tx: PrismaTransactionClient) => {
        await expireStalePendingRequests(tx);

        const duplicate = await tx.approval_requests.findFirst({
          where: {
            request_type: requestType,
            target_type: targetType,
            target_id: targetId,
            status: "pending",
          },
          select: { id: true },
        });

        if (duplicate) {
          throw new DomainConflictError("A pending approval request already exists for this operation");
        }

        return tx.approval_requests.create({
          data: {
            request_type: requestType,
            target_type: targetType,
            target_id: targetId,
            loan_id: loanId,
            branch_id: payload.branchId ?? null,
            requested_by_user_id: requestedByUserId,
            checker_user_id: null,
            status: "pending",
            request_payload: JSON.stringify(payload.requestPayload || {}),
            request_note: payload.requestNote || null,
            review_note: null,
            requested_at: createdAt,
            reviewed_at: null,
            approved_at: null,
            rejected_at: null,
            executed_at: null,
            expires_at: expiresAt,
            created_at: createdAt,
            updated_at: createdAt,
          },
          select: { id: true },
        });
      }, { maxWait: 10000, timeout: 20000 });

      const insertedId = Number(created.id || 0);
      if (!insertedId) {
        throw new DomainValidationError("Failed to create approval request");
      }

      return insertedId;
    } catch (error) {
      if (error instanceof DomainConflictError || error instanceof DomainValidationError) {
        throw error;
      }
      if (isUniqueConstraintError(error)) {
        throw new DomainConflictError("A pending approval request already exists for this operation");
      }
      throw error;
    }
  }

  async function finalizeApprovedRequest(payload: FinalizeApprovalRequestPayload): Promise<void> {
    assertCheckerRole(payload.checkerRole);
    await expireStalePendingRequests();

    const request = await getApprovalRequestById(payload.requestId);
    if (!request) {
      throw new DomainValidationError("Approval request not found");
    }
    if (String(request.status || "") !== "pending") {
      throw new DomainConflictError("Approval request is not pending");
    }
    const isAdminOverride = normalizeRole(payload.checkerRole) === "admin";
    if (!isAdminOverride && Number(request.requested_by_user_id || 0) === Number(payload.checkerUserId || 0)) {
      throw new ForbiddenActionError("Maker-Checker violation: You cannot approve your own request");
    }

    const reviewedAt = nowIso();
    const updateResult = await prisma.approval_requests.updateMany({
      where: {
        id: payload.requestId,
        status: "pending",
        OR: [
          { expires_at: null },
          { expires_at: { gt: reviewedAt } },
        ],
      },
      data: {
        status: "approved",
        checker_user_id: payload.checkerUserId,
        review_note: payload.reviewNote || null,
        reviewed_at: reviewedAt,
        approved_at: reviewedAt,
        updated_at: reviewedAt,
      },
    });

    if (!Number(updateResult.count || 0)) {
      throw new DomainConflictError("Approval request could not be approved. It may have been reviewed already");
    }
  }

  async function markRequestExecuted(requestId: number): Promise<void> {
    const executedAt = nowIso();
    const updateResult = await prisma.approval_requests.updateMany({
      where: {
        id: requestId,
        status: "approved",
        executed_at: null,
      },
      data: {
        executed_at: executedAt,
        updated_at: executedAt,
      },
    });

    if (!Number(updateResult.count || 0)) {
      throw new DomainConflictError("Approval request execution state could not be updated");
    }
  }

  async function rejectPendingRequest(payload: RejectApprovalRequestPayload): Promise<void> {
    assertCheckerRole(payload.checkerRole);
    await expireStalePendingRequests();

    const request = await getApprovalRequestById(payload.requestId);
    if (!request) {
      throw new DomainValidationError("Approval request not found");
    }
    if (String(request.status || "") !== "pending") {
      throw new DomainConflictError("Approval request is not pending");
    }
    const isAdminOverride = normalizeRole(payload.checkerRole) === "admin";
    if (!isAdminOverride && Number(request.requested_by_user_id || 0) === Number(payload.checkerUserId || 0)) {
      throw new ForbiddenActionError("Maker-Checker violation: You cannot reject your own request");
    }

    const reviewedAt = nowIso();
    const updateResult = await prisma.approval_requests.updateMany({
      where: {
        id: payload.requestId,
        status: "pending",
        OR: [
          { expires_at: null },
          { expires_at: { gt: reviewedAt } },
        ],
      },
      data: {
        status: "rejected",
        checker_user_id: payload.checkerUserId,
        review_note: payload.reviewNote || null,
        reviewed_at: reviewedAt,
        rejected_at: reviewedAt,
        updated_at: reviewedAt,
      },
    });

    if (!Number(updateResult.count || 0)) {
      throw new DomainConflictError("Approval request could not be rejected. It may have been reviewed already");
    }
  }

  return {
    getApprovalRequestById,
    listPendingRequestsForLoan,
    createPendingRequest,
    finalizeApprovedRequest,
    markRequestExecuted,
    rejectPendingRequest,
    assertCheckerRole,
  };
}

export type {
  ApprovalRequestStatus,
};

export {
  createApprovalWorkflowService,
};
