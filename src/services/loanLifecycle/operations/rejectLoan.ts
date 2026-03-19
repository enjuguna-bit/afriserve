import { prisma } from "../../../db/prismaClient.js";
import {
  ForbiddenScopeError,
  InvalidLoanStatusError,
  LoanNotFoundError,
} from "../../../domain/errors.js";
import { nowIso } from "../shared/helpers.js";
import type { LoanLifecycleDeps } from "../shared/types.js";

export async function rejectLoan(
  deps: Pick<LoanLifecycleDeps, "hierarchyService" | "writeAuditLog" | "invalidateReportCaches" | "publishDomainEvent">,
  args: {
    loanId: number;
    payload: { reason: string };
    user: { sub: number };
    ipAddress: string | null | undefined;
  },
): Promise<Record<string, any> | null> {
  const { hierarchyService, writeAuditLog, invalidateReportCaches } = deps;
  const publishDomainEvent = deps.publishDomainEvent ?? (async () => 0);
  const { loanId, payload, user, ipAddress } = args;

  const scope = await hierarchyService.resolveHierarchyScope(user);
  const loan = await prisma.loans.findUnique({ where: { id: loanId } });
  if (!loan) throw new LoanNotFoundError();
  if (!hierarchyService.isBranchInScope(scope, loan.branch_id)) throw new ForbiddenScopeError();
  if (loan.status !== "pending_approval") {
    throw new InvalidLoanStatusError("Loan is not pending approval", {
      currentStatus: loan.status, action: "reject",
    });
  }

  await prisma.loans.update({
    where: { id: loanId },
    data: {
      status: "rejected",
      rejected_by_user_id: user.sub,
      rejected_at: nowIso(),
      rejection_reason: payload.reason,
    },
  });

  try {
    await publishDomainEvent({
      eventType: "loan.rejected",
      aggregateType: "loan",
      aggregateId: loanId,
      payload: { loanId, rejectedByUserId: user.sub, reason: payload.reason },
      occurredAt: nowIso(),
    });
  } catch {
    // Non-fatal
  }

  await writeAuditLog({
    userId: user.sub,
    action: "loan.rejected",
    targetType: "loan",
    targetId: loanId,
    details: JSON.stringify({ rejectedBy: user.sub, reason: payload.reason }),
    ipAddress: ipAddress || null,
  });

  const updatedLoan = await prisma.loans.findUnique({ where: { id: loanId } });
  await invalidateReportCaches();
  return updatedLoan as Record<string, any> | null;
}
