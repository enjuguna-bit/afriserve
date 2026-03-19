/**
 * writeOffLoan, restructureLoan, topUpLoan, refinanceLoan, extendLoanTerm
 *
 * These operations all follow the same pattern:
 *   1. Scope + status guard
 *   2. Create a pending approval request via approvalWorkflowService
 *   3. Audit-log the request + publish domain event
 *
 * The actual execution of the approved request happens in reviewHighRisk.ts
 * via executeWriteOffLoanFromApprovedRequest etc. (which remain in the
 * original loanLifecycleService.ts as internal helpers until Phase 2 of
 * the decomposition extracts them too).
 */
import { prisma } from "../../../db/prismaClient.js";
import {
  ForbiddenScopeError,
  LoanNotFoundError,
  LoanStateConflictError,
} from "../../../domain/errors.js";
import { normalizeRole } from "../shared/helpers.js";
import { approvalWorkflowService } from "../shared/contextHelpers.js";
import type { LoanLifecycleDeps } from "../shared/types.js";

// ---------------------------------------------------------------------------
// Shared publishApprovalRequestCreatedEvent helper
// ---------------------------------------------------------------------------
async function publishApprovalRequestCreatedEvent(
  publishDomainEvent: NonNullable<LoanLifecycleDeps["publishDomainEvent"]>,
  args: {
    requestId: number;
    requestType: string;
    loanId: number;
    branchId: number | null | undefined;
    requestedByUserId: number;
    note?: string | null;
    approvalRequest?: Record<string, any> | null;
    source: string;
  },
): Promise<void> {
  try {
    await publishDomainEvent({
      eventType: "approval_request.created",
      aggregateType: "approval_request",
      aggregateId: args.requestId,
      payload: {
        requestId: args.requestId, requestType: args.requestType,
        loanId: args.loanId, branchId: args.branchId ?? null,
        requestedByUserId: args.requestedByUserId, note: args.note ?? null,
        source: args.source,
      },
      occurredAt: new Date().toISOString(),
    });
  } catch {
    // Best-effort — must not roll back the already-persisted approval request
  }
}

const NON_DISBURSED = ["pending_approval", "approved", "rejected"] as const;
const TERMINAL = ["closed", "written_off"] as const;

// ---------------------------------------------------------------------------
// writeOffLoan
// ---------------------------------------------------------------------------
export async function writeOffLoan(
  deps: Pick<LoanLifecycleDeps, "hierarchyService" | "writeAuditLog" | "publishDomainEvent">,
  args: {
    loanId: number;
    payload: { note?: string };
    user: { sub: number; role?: string };
    ipAddress: string | null | undefined;
  },
): Promise<Record<string, any>> {
  const { hierarchyService, writeAuditLog } = deps;
  const publishDomainEvent = deps.publishDomainEvent ?? (async () => 0);
  const { loanId, payload, user, ipAddress } = args;

  const scope = await hierarchyService.resolveHierarchyScope(user);
  const loan = await prisma.loans.findUnique({
    where: { id: loanId },
    select: { id: true, client_id: true, branch_id: true, status: true, balance: true, repaid_total: true, expected_total: true, term_weeks: true, interest_rate: true },
  });
  if (!loan) throw new LoanNotFoundError();
  if (!hierarchyService.isBranchInScope(scope, loan.branch_id)) throw new ForbiddenScopeError();
  if (loan.status === "written_off") return { message: "Loan is already written off", loan };
  if (loan.status === "closed") throw new LoanStateConflictError("Cannot write off a closed loan", { currentStatus: loan.status, action: "write_off" });
  if ((NON_DISBURSED as readonly string[]).includes(String(loan.status || ""))) {
    throw new LoanStateConflictError("Cannot write off a loan that has not been disbursed", { currentStatus: loan.status, action: "write_off" });
  }
  if (Number(loan.balance || 0) <= 0) {
    throw new LoanStateConflictError("Cannot write off a loan with zero outstanding balance", { currentStatus: loan.status, action: "write_off" });
  }

  const requestId = await approvalWorkflowService.createPendingRequest({
    requestType: "loan_write_off", targetType: "loan", targetId: loanId, loanId,
    branchId: loan.branch_id, requestedByUserId: user.sub,
    requestPayload: { loanId, note: payload.note || null, snapshot: { status: String(loan.status || ""), balance: Number(loan.balance || 0), expectedTotal: Number(loan.expected_total || 0), repaidTotal: Number(loan.repaid_total || 0), termWeeks: Number(loan.term_weeks || 0), interestRate: Number(loan.interest_rate || 0) } },
    requestNote: payload.note || null,
  });
  const approvalRequest = await approvalWorkflowService.getApprovalRequestById(requestId);

  await writeAuditLog({ userId: user.sub, action: "loan.write_off.requested", targetType: "loan", targetId: loanId, details: JSON.stringify({ requestId, requestedByRole: normalizeRole(user.role), currentStatus: String(loan.status || "").toLowerCase(), outstandingBalance: Number(loan.balance || 0), note: payload.note || null }), ipAddress: ipAddress || null });
  await publishApprovalRequestCreatedEvent(publishDomainEvent, { requestId, requestType: "loan_write_off", loanId, branchId: loan.branch_id, requestedByUserId: user.sub, note: payload.note || null, approvalRequest, source: "writeOffLoan" });

  return { message: "Loan write-off request submitted for approval", approvalRequest };
}

// ---------------------------------------------------------------------------
// restructureLoan
// ---------------------------------------------------------------------------
export async function restructureLoan(
  deps: Pick<LoanLifecycleDeps, "hierarchyService" | "writeAuditLog" | "publishDomainEvent">,
  args: {
    loanId: number;
    payload: { newTermWeeks: number; waiveInterest?: boolean; note?: string };
    user: { sub: number; role?: string };
    ipAddress: string | null | undefined;
  },
): Promise<Record<string, any>> {
  const { hierarchyService, writeAuditLog } = deps;
  const publishDomainEvent = deps.publishDomainEvent ?? (async () => 0);
  const { loanId, payload, user, ipAddress } = args;

  const scope = await hierarchyService.resolveHierarchyScope(user);
  const loan = await prisma.loans.findUnique({
    where: { id: loanId },
    select: { id: true, client_id: true, branch_id: true, status: true, principal: true, interest_rate: true, term_weeks: true, expected_total: true, repaid_total: true, balance: true },
  });
  if (!loan) throw new LoanNotFoundError();
  if (!hierarchyService.isBranchInScope(scope, loan.branch_id)) throw new ForbiddenScopeError();
  if (loan.status === "closed") throw new LoanStateConflictError("Cannot restructure a closed loan", { currentStatus: loan.status, action: "restructure" });
  if (loan.status === "written_off") throw new LoanStateConflictError("Cannot restructure a written-off loan", { currentStatus: loan.status, action: "restructure" });
  if ((NON_DISBURSED as readonly string[]).includes(String(loan.status || ""))) {
    throw new LoanStateConflictError("Cannot restructure a loan that has not been disbursed", { currentStatus: loan.status, action: "restructure" });
  }
  if (Number(loan.balance || 0) <= 0) throw new LoanStateConflictError("Cannot restructure a loan with zero outstanding balance", { currentStatus: loan.status, action: "restructure" });

  const requestId = await approvalWorkflowService.createPendingRequest({
    requestType: "loan_restructure", targetType: "loan", targetId: loanId, loanId,
    branchId: loan.branch_id, requestedByUserId: user.sub,
    requestPayload: { loanId, newTermWeeks: payload.newTermWeeks, waiveInterest: payload.waiveInterest === true, note: payload.note || null, snapshot: { status: String(loan.status || ""), balance: Number(loan.balance || 0), expectedTotal: Number(loan.expected_total || 0), repaidTotal: Number(loan.repaid_total || 0), termWeeks: Number(loan.term_weeks || 0), interestRate: Number(loan.interest_rate || 0) } },
    requestNote: payload.note || null,
  });
  const approvalRequest = await approvalWorkflowService.getApprovalRequestById(requestId);

  await writeAuditLog({ userId: user.sub, action: "loan.restructure.requested", targetType: "loan", targetId: loanId, details: JSON.stringify({ requestId, requestedByRole: normalizeRole(user.role), currentStatus: String(loan.status || "").toLowerCase(), newTermWeeks: payload.newTermWeeks, waiveInterest: payload.waiveInterest === true, outstandingBalance: Number(loan.balance || 0), note: payload.note || null }), ipAddress: ipAddress || null });
  await publishApprovalRequestCreatedEvent(publishDomainEvent, { requestId, requestType: "loan_restructure", loanId, branchId: loan.branch_id, requestedByUserId: user.sub, note: payload.note || null, approvalRequest, source: "restructureLoan" });

  return { message: "Loan restructure request submitted for approval", approvalRequest };
}

// ---------------------------------------------------------------------------
// topUpLoan
// ---------------------------------------------------------------------------
export async function topUpLoan(
  deps: Pick<LoanLifecycleDeps, "hierarchyService" | "writeAuditLog" | "publishDomainEvent">,
  args: {
    loanId: number;
    payload: { additionalPrincipal: number; newTermWeeks?: number; note?: string };
    user: { sub: number; role?: string };
    ipAddress: string | null | undefined;
  },
): Promise<Record<string, any>> {
  const { hierarchyService, writeAuditLog } = deps;
  const publishDomainEvent = deps.publishDomainEvent ?? (async () => 0);
  const { loanId, payload, user, ipAddress } = args;

  const scope = await hierarchyService.resolveHierarchyScope(user);
  const loan = await prisma.loans.findUnique({
    where: { id: loanId },
    select: { id: true, branch_id: true, status: true, balance: true, expected_total: true, repaid_total: true, term_weeks: true, interest_rate: true },
  });
  if (!loan) throw new LoanNotFoundError();
  if (!hierarchyService.isBranchInScope(scope, loan.branch_id)) throw new ForbiddenScopeError();
  if ([...TERMINAL, ...NON_DISBURSED].includes(String(loan.status || "") as any)) {
    throw new LoanStateConflictError("Cannot top-up a non-active loan", { currentStatus: loan.status, action: "top_up" });
  }

  const requestId = await approvalWorkflowService.createPendingRequest({
    requestType: "loan_top_up", targetType: "loan", targetId: loanId, loanId,
    branchId: loan.branch_id, requestedByUserId: user.sub,
    requestPayload: { loanId, additionalPrincipal: payload.additionalPrincipal, newTermWeeks: payload.newTermWeeks || null, note: payload.note || null, snapshot: { status: String(loan.status || ""), balance: Number(loan.balance || 0), expectedTotal: Number(loan.expected_total || 0), repaidTotal: Number(loan.repaid_total || 0), termWeeks: Number(loan.term_weeks || 0), interestRate: Number(loan.interest_rate || 0) } },
    requestNote: payload.note || null,
  });
  const approvalRequest = await approvalWorkflowService.getApprovalRequestById(requestId);

  await writeAuditLog({ userId: user.sub, action: "loan.top_up.requested", targetType: "loan", targetId: loanId, details: JSON.stringify({ requestId, requestedByRole: normalizeRole(user.role), additionalPrincipal: payload.additionalPrincipal, newTermWeeks: payload.newTermWeeks || null, note: payload.note || null }), ipAddress: ipAddress || null });
  await publishApprovalRequestCreatedEvent(publishDomainEvent, { requestId, requestType: "loan_top_up", loanId, branchId: loan.branch_id, requestedByUserId: user.sub, note: payload.note || null, approvalRequest, source: "topUpLoan" });

  return { message: "Loan top-up request submitted for approval", approvalRequest };
}

// ---------------------------------------------------------------------------
// refinanceLoan
// ---------------------------------------------------------------------------
export async function refinanceLoan(
  deps: Pick<LoanLifecycleDeps, "hierarchyService" | "writeAuditLog" | "publishDomainEvent">,
  args: {
    loanId: number;
    payload: { newInterestRate: number; newTermWeeks: number; additionalPrincipal?: number; note?: string };
    user: { sub: number; role?: string };
    ipAddress: string | null | undefined;
  },
): Promise<Record<string, any>> {
  const { hierarchyService, writeAuditLog } = deps;
  const publishDomainEvent = deps.publishDomainEvent ?? (async () => 0);
  const { loanId, payload, user, ipAddress } = args;

  const scope = await hierarchyService.resolveHierarchyScope(user);
  const loan = await prisma.loans.findUnique({
    where: { id: loanId },
    select: { id: true, branch_id: true, status: true, balance: true, expected_total: true, repaid_total: true, term_weeks: true, interest_rate: true },
  });
  if (!loan) throw new LoanNotFoundError();
  if (!hierarchyService.isBranchInScope(scope, loan.branch_id)) throw new ForbiddenScopeError();
  if ([...TERMINAL, ...NON_DISBURSED].includes(String(loan.status || "") as any)) {
    throw new LoanStateConflictError("Cannot refinance a non-active loan", { currentStatus: loan.status, action: "refinance" });
  }

  const requestId = await approvalWorkflowService.createPendingRequest({
    requestType: "loan_refinance", targetType: "loan", targetId: loanId, loanId,
    branchId: loan.branch_id, requestedByUserId: user.sub,
    requestPayload: { loanId, newInterestRate: payload.newInterestRate, newTermWeeks: payload.newTermWeeks, additionalPrincipal: payload.additionalPrincipal || 0, note: payload.note || null, snapshot: { status: String(loan.status || ""), balance: Number(loan.balance || 0), expectedTotal: Number(loan.expected_total || 0), repaidTotal: Number(loan.repaid_total || 0), termWeeks: Number(loan.term_weeks || 0), interestRate: Number(loan.interest_rate || 0) } },
    requestNote: payload.note || null,
  });
  const approvalRequest = await approvalWorkflowService.getApprovalRequestById(requestId);

  await writeAuditLog({ userId: user.sub, action: "loan.refinance.requested", targetType: "loan", targetId: loanId, details: JSON.stringify({ requestId, requestedByRole: normalizeRole(user.role), newInterestRate: payload.newInterestRate, newTermWeeks: payload.newTermWeeks, additionalPrincipal: payload.additionalPrincipal || 0, note: payload.note || null }), ipAddress: ipAddress || null });
  await publishApprovalRequestCreatedEvent(publishDomainEvent, { requestId, requestType: "loan_refinance", loanId, branchId: loan.branch_id, requestedByUserId: user.sub, note: payload.note || null, approvalRequest, source: "refinanceLoan" });

  return { message: "Loan refinance request submitted for approval", approvalRequest };
}

// ---------------------------------------------------------------------------
// extendLoanTerm
// ---------------------------------------------------------------------------
export async function extendLoanTerm(
  deps: Pick<LoanLifecycleDeps, "hierarchyService" | "writeAuditLog" | "publishDomainEvent">,
  args: {
    loanId: number;
    payload: { newTermWeeks: number; note?: string };
    user: { sub: number; role?: string };
    ipAddress: string | null | undefined;
  },
): Promise<Record<string, any>> {
  const { hierarchyService, writeAuditLog } = deps;
  const publishDomainEvent = deps.publishDomainEvent ?? (async () => 0);
  const { loanId, payload, user, ipAddress } = args;

  const scope = await hierarchyService.resolveHierarchyScope(user);
  const loan = await prisma.loans.findUnique({
    where: { id: loanId },
    select: { id: true, branch_id: true, status: true, balance: true, expected_total: true, repaid_total: true, term_weeks: true, interest_rate: true },
  });
  if (!loan) throw new LoanNotFoundError();
  if (!hierarchyService.isBranchInScope(scope, loan.branch_id)) throw new ForbiddenScopeError();
  if ([...TERMINAL, ...NON_DISBURSED].includes(String(loan.status || "") as any)) {
    throw new LoanStateConflictError("Cannot extend term for a non-active loan", { currentStatus: loan.status, action: "term_extension" });
  }

  const requestId = await approvalWorkflowService.createPendingRequest({
    requestType: "loan_term_extension", targetType: "loan", targetId: loanId, loanId,
    branchId: loan.branch_id, requestedByUserId: user.sub,
    requestPayload: { loanId, newTermWeeks: payload.newTermWeeks, note: payload.note || null, snapshot: { status: String(loan.status || ""), balance: Number(loan.balance || 0), expectedTotal: Number(loan.expected_total || 0), repaidTotal: Number(loan.repaid_total || 0), termWeeks: Number(loan.term_weeks || 0), interestRate: Number(loan.interest_rate || 0) } },
    requestNote: payload.note || null,
  });
  const approvalRequest = await approvalWorkflowService.getApprovalRequestById(requestId);

  await writeAuditLog({ userId: user.sub, action: "loan.term_extension.requested", targetType: "loan", targetId: loanId, details: JSON.stringify({ requestId, requestedByRole: normalizeRole(user.role), newTermWeeks: payload.newTermWeeks, note: payload.note || null }), ipAddress: ipAddress || null });
  await publishApprovalRequestCreatedEvent(publishDomainEvent, { requestId, requestType: "loan_term_extension", loanId, branchId: loan.branch_id, requestedByUserId: user.sub, note: payload.note || null, approvalRequest, source: "extendLoanTerm" });

  return { message: "Loan term extension request submitted for approval", approvalRequest };
}
