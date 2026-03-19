import { prisma } from "../../../db/prismaClient.js";
import {
  ClientNotFoundError,
  ForbiddenActionError,
  ForbiddenScopeError,
  InvalidLoanStatusError,
  LoanNotFoundError,
  LoanStateConflictError,
} from "../../../domain/errors.js";
import { getLoanWorkflowSnapshot } from "../../loanWorkflowSnapshotService.js";
import { nowIso, normalizeRole } from "../shared/helpers.js";
import type { LoanLifecycleDeps } from "../shared/types.js";

export async function approveLoan(
  deps: Pick<LoanLifecycleDeps,
    | "get" | "hierarchyService" | "requireVerifiedClientKycForLoanApproval"
    | "writeAuditLog" | "invalidateReportCaches" | "publishDomainEvent">,
  args: {
    loanId: number;
    payload: { notes?: string };
    user: { sub: number; role?: string };
    ipAddress: string | null | undefined;
  },
): Promise<Record<string, any> | null> {
  const { hierarchyService, writeAuditLog, invalidateReportCaches, requireVerifiedClientKycForLoanApproval } = deps;
  const publishDomainEvent = deps.publishDomainEvent ?? (async () => 0);
  const { loanId, payload, user, ipAddress } = args;

  const scope = await hierarchyService.resolveHierarchyScope(user);
  const loan = await prisma.loans.findUnique({ where: { id: loanId } });
  if (!loan) throw new LoanNotFoundError();
  if (!hierarchyService.isBranchInScope(scope, loan.branch_id)) throw new ForbiddenScopeError();
  if (loan.status !== "pending_approval") {
    throw new InvalidLoanStatusError("Loan is not pending approval", {
      currentStatus: loan.status, action: "approve",
    });
  }

  // Maker-checker: admins are exempt; all others cannot approve their own loan
  const isAdminApprover = normalizeRole(user.role) === "admin";
  if (!isAdminApprover) {
    if (Number(loan.created_by_user_id || 0) === Number(user.sub || 0)) {
      throw new ForbiddenActionError("Maker-Checker violation: You cannot approve a loan you created");
    }
    if (Number(loan.officer_id || 0) > 0 && Number(loan.officer_id || 0) === Number(user.sub || 0)) {
      throw new ForbiddenActionError("Maker-Checker violation: You cannot approve a loan you are assigned to as officer");
    }
  }

  if (requireVerifiedClientKycForLoanApproval) {
    const client = await prisma.clients.findUnique({
      where: { id: Number(loan.client_id || 0) },
      select: { id: true, kyc_status: true },
    });
    if (!client) throw new ClientNotFoundError();
    const kycStatus = String(client.kyc_status || "pending").toLowerCase();
    if (kycStatus !== "verified") {
      throw new LoanStateConflictError(
        "Cannot approve loan: client KYC status is not verified",
        { kycStatus, action: "approve" },
      );
    }
  }

  const workflow = await getLoanWorkflowSnapshot({ get: deps.get, loanId });
  if (!workflow) throw new LoanNotFoundError();
  if (workflow.approval_blockers.length > 0) {
    throw new LoanStateConflictError("Cannot approve loan: application is not ready for approval", {
      blockers: workflow.approval_blockers, action: "approve",
    });
  }

  await prisma.loans.update({
    where: { id: loanId },
    data: {
      status: "approved",
      approved_by_user_id: user.sub,
      approved_at: nowIso(),
      rejected_by_user_id: null,
      rejected_at: null,
      rejection_reason: null,
    },
  });

  try {
    await publishDomainEvent({
      eventType: "loan.approved",
      aggregateType: "loan",
      aggregateId: loanId,
      payload: { loanId, approvedByUserId: user.sub, notes: payload.notes ?? null },
      occurredAt: nowIso(),
    });
  } catch {
    // Non-fatal — approval already persisted
  }

  await writeAuditLog({
    userId: user.sub,
    action: "loan.approved",
    targetType: "loan",
    targetId: loanId,
    details: JSON.stringify({ approvedBy: user.sub, notes: payload.notes }),
    ipAddress: ipAddress || null,
  });

  const updatedLoan = await prisma.loans.findUnique({ where: { id: loanId } });
  await invalidateReportCaches();
  return updatedLoan as Record<string, any> | null;
}
