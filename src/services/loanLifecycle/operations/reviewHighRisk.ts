/**
 * reviewHighRiskApprovalRequest
 *
 * Checker reviews a pending approval request (write-off, restructure, top-up,
 * refinance, term extension).  On approve: runs the corresponding execute*
 * helper inside a Prisma transaction.  On reject: delegates to
 * approvalWorkflowService.rejectPendingRequest.
 *
 * The execute* helpers (executeWriteOffLoanFromApprovedRequest, etc.) still
 * live in loanLifecycleService.ts — they will be extracted in a later pass
 * without any public-API change.
 */
import { prisma, type PrismaTransactionClient } from "../../../db/prismaClient.js";
import {
  DomainConflictError,
  DomainValidationError,
  ForbiddenActionError,
  ForbiddenScopeError,
} from "../../../domain/errors.js";
import { parseApprovalRequestPayload } from "../shared/helpers.js";
import {
  approvalWorkflowService,
  finalizeApprovedRequestTx,
  markApprovedRequestExecutedTx,
} from "../shared/contextHelpers.js";
import type { LoanLifecycleDeps } from "../shared/types.js";

type ExecuteHelpers = {
  executeWriteOffLoanFromApprovedRequest: (args: Record<string, any>) => Promise<Record<string, any>>;
  executeRestructureLoanFromApprovedRequest: (args: Record<string, any>) => Promise<Record<string, any>>;
  executeTopUpLoanFromApprovedRequest: (args: Record<string, any>) => Promise<Record<string, any>>;
  executeRefinanceLoanFromApprovedRequest: (args: Record<string, any>) => Promise<Record<string, any>>;
  executeTermExtensionFromApprovedRequest: (args: Record<string, any>) => Promise<Record<string, any>>;
};

export async function reviewHighRiskApprovalRequest(
  deps: Pick<LoanLifecycleDeps,
    "hierarchyService" | "writeAuditLog" | "invalidateReportCaches">,
  executeHelpers: ExecuteHelpers,
  args: {
    requestId: number;
    payload: { decision: "approve" | "reject"; note?: string };
    user: { sub: number; role?: string };
    ipAddress: string | null | undefined;
  },
): Promise<Record<string, any>> {
  const { hierarchyService, writeAuditLog, invalidateReportCaches } = deps;
  const { requestId, payload, user, ipAddress } = args;

  const parsedRequestId = Number(requestId || 0);
  if (!parsedRequestId) throw new DomainValidationError("Invalid approval request id");

  const decision = String(payload?.decision || "").trim().toLowerCase();
  if (decision !== "approve" && decision !== "reject") {
    throw new DomainValidationError("decision must be either approve or reject");
  }

  const request = await approvalWorkflowService.getApprovalRequestById(parsedRequestId);
  if (!request) throw new DomainValidationError("Approval request not found");
  if (String(request.status || "") !== "pending") throw new DomainConflictError("Approval request is not pending");

  const scope = await hierarchyService.resolveHierarchyScope(user);
  if (!hierarchyService.isBranchInScope(scope, request.branch_id)) {
    throw new ForbiddenScopeError("Forbidden: approval request is outside your scope");
  }
  approvalWorkflowService.assertCheckerRole(user.role);
  if (Number(request.requested_by_user_id || 0) === Number(user.sub || 0)) {
    throw new ForbiddenActionError("Maker-Checker violation: You cannot review your own request");
  }

  if (decision === "reject") {
    await approvalWorkflowService.rejectPendingRequest({
      requestId: parsedRequestId,
      checkerUserId: user.sub,
      checkerRole: String(user.role || ""),
      reviewNote: payload.note || null,
    });
    await writeAuditLog({ userId: user.sub, action: "approval_request.rejected", targetType: "approval_request", targetId: parsedRequestId, details: JSON.stringify({ requestType: request.request_type, loanId: Number(request.loan_id || 0), note: payload.note || null }), ipAddress: ipAddress || null });
    return { message: "Approval request rejected", approvalRequest: await approvalWorkflowService.getApprovalRequestById(parsedRequestId) };
  }

  const requestPayload = parseApprovalRequestPayload(request.request_payload);

  const executionResult = await prisma.$transaction(async (tx: PrismaTransactionClient) => {
    await finalizeApprovedRequestTx({
      tx: tx as any,
      requestId: parsedRequestId,
      checkerUserId: user.sub,
      checkerRole: String(user.role || ""),
      reviewNote: payload.note || null,
    });

    const requestType = String(request.request_type || "");
    let txResult: Record<string, any> = {};

    if (requestType === "loan_write_off") {
      txResult = await executeHelpers.executeWriteOffLoanFromApprovedRequest({
        loanId: Number(request.loan_id || 0),
        note: String(requestPayload.note || payload.note || "").trim() || undefined,
        checkerUserId: user.sub,
        requestSnapshot: requestPayload.snapshot || null,
        transactionClient: tx,
      });
    } else if (requestType === "loan_restructure") {
      const newTermWeeks = Number(requestPayload.newTermWeeks || 0);
      if (!Number.isInteger(newTermWeeks) || newTermWeeks <= 0) {
        throw new DomainValidationError("Invalid restructure payload in approval request");
      }
      txResult = await executeHelpers.executeRestructureLoanFromApprovedRequest({
        loanId: Number(request.loan_id || 0),
        newTermWeeks,
        waiveInterest: Boolean(requestPayload.waiveInterest),
        note: String(requestPayload.note || payload.note || "").trim() || undefined,
        executedByUserId: user.sub,
        requestSnapshot: requestPayload.snapshot || null,
        transactionClient: tx,
      });
    } else if (requestType === "loan_top_up") {
      const additionalPrincipal = Number(requestPayload.additionalPrincipal || 0);
      if (!Number.isFinite(additionalPrincipal) || additionalPrincipal <= 0) {
        throw new DomainValidationError("Invalid top-up payload in approval request");
      }
      const newTermWeeks = Number(requestPayload.newTermWeeks || 0);
      txResult = await executeHelpers.executeTopUpLoanFromApprovedRequest({
        loanId: Number(request.loan_id || 0),
        additionalPrincipal,
        newTermWeeks: Number.isInteger(newTermWeeks) && newTermWeeks > 0 ? newTermWeeks : undefined,
        note: String(requestPayload.note || payload.note || "").trim() || undefined,
        executedByUserId: user.sub,
        requestSnapshot: requestPayload.snapshot || null,
        transactionClient: tx,
      });
    } else if (requestType === "loan_refinance") {
      const newTermWeeks = Number(requestPayload.newTermWeeks || 0);
      const newInterestRate = Number(requestPayload.newInterestRate);
      if (!Number.isInteger(newTermWeeks) || newTermWeeks <= 0) throw new DomainValidationError("Invalid refinance payload term in approval request");
      if (!Number.isFinite(newInterestRate) || newInterestRate < 0) throw new DomainValidationError("Invalid refinance payload interest rate in approval request");
      txResult = await executeHelpers.executeRefinanceLoanFromApprovedRequest({
        loanId: Number(request.loan_id || 0),
        newTermWeeks, newInterestRate,
        additionalPrincipal: Number(requestPayload.additionalPrincipal || 0),
        note: String(requestPayload.note || payload.note || "").trim() || undefined,
        executedByUserId: user.sub,
        requestSnapshot: requestPayload.snapshot || null,
        transactionClient: tx,
      });
    } else if (requestType === "loan_term_extension") {
      const newTermWeeks = Number(requestPayload.newTermWeeks || 0);
      if (!Number.isInteger(newTermWeeks) || newTermWeeks <= 0) throw new DomainValidationError("Invalid term extension payload in approval request");
      txResult = await executeHelpers.executeTermExtensionFromApprovedRequest({
        loanId: Number(request.loan_id || 0),
        newTermWeeks,
        note: String(requestPayload.note || payload.note || "").trim() || undefined,
        executedByUserId: user.sub,
        requestSnapshot: requestPayload.snapshot || null,
        transactionClient: tx,
      });
    } else {
      throw new DomainValidationError("Unsupported approval request type");
    }

    await markApprovedRequestExecutedTx(tx as any, parsedRequestId);
    return txResult;
  }, { maxWait: 10000, timeout: 20000 });

  await writeAuditLog({ userId: user.sub, action: "approval_request.approved", targetType: "approval_request", targetId: parsedRequestId, details: JSON.stringify({ requestType: request.request_type, loanId: Number(request.loan_id || 0), note: payload.note || null }), ipAddress: ipAddress || null });
  await invalidateReportCaches();

  return {
    message: "Approval request approved and executed",
    approvalRequest: await approvalWorkflowService.getApprovalRequestById(parsedRequestId),
    loan: executionResult.updatedLoan || null,
    execution: executionResult,
  };
}
