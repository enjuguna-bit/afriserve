/**
 * Prisma-backed transaction helpers shared across loan lifecycle operations.
 * These functions require a PrismaTransactionClient and operate inside
 * an existing Prisma transaction — they never open their own.
 */
import { Decimal } from "decimal.js";
import type { PrismaTransactionClient } from "../../../db/prismaClient.js";
import {
  DomainConflictError,
  DomainValidationError,
  ForbiddenActionError,
  LoanStateConflictError,
} from "../../../domain/errors.js";
import type { GeneralLedgerServiceLike, JournalLine } from "./types.js";
import {
  toMoneyDecimal,
  moneyToNumber,
  normalizeOptionalNumber,
  normalizeOptionalInteger,
  normalizeOptionalText,
  normalizeInterestAccrualMethod,
  buildInstallmentAmounts,
  nowIso,
} from "./helpers.js";
import { createApprovalWorkflowService } from "../../approvalWorkflowService.js";

// Single shared checker-roles config
export const HIGH_RISK_CHECKER_ROLES = ["admin", "finance", "operations_manager", "area_manager"] as const;
export const approvalWorkflowService = createApprovalWorkflowService({
  checkerRoles: HIGH_RISK_CHECKER_ROLES as unknown as string[],
});

// ---------------------------------------------------------------------------
// Approval-request helpers
// ---------------------------------------------------------------------------

export async function finalizeApprovedRequestTx({
  tx,
  requestId,
  checkerUserId,
  checkerRole,
  reviewNote,
}: {
  tx: PrismaTransactionClient;
  requestId: number;
  checkerUserId: number;
  checkerRole: string;
  reviewNote?: string | null;
}): Promise<void> {
  approvalWorkflowService.assertCheckerRole(checkerRole);

  const request = await tx.approval_requests.findUnique({
    where: { id: requestId },
    select: { id: true, status: true, requested_by_user_id: true },
  });
  if (!request) throw new DomainValidationError("Approval request not found");
  if (String(request.status || "") !== "pending") throw new DomainConflictError("Approval request is not pending");
  if (Number(request.requested_by_user_id || 0) === Number(checkerUserId || 0)) {
    throw new ForbiddenActionError("Maker-Checker violation: You cannot approve your own request");
  }

  const approvedAt = nowIso();
  const updateResult = await tx.approval_requests.updateMany({
    where: { id: requestId, status: "pending" },
    data: {
      status: "approved",
      checker_user_id: checkerUserId,
      review_note: reviewNote || null,
      reviewed_at: approvedAt,
      approved_at: approvedAt,
      updated_at: approvedAt,
    },
  });
  if (Number(updateResult.count || 0) !== 1) {
    throw new DomainConflictError("Approval request could not be approved. It may have been reviewed already");
  }
}

export async function markApprovedRequestExecutedTx(
  tx: PrismaTransactionClient,
  requestId: number,
): Promise<void> {
  const executedAt = nowIso();
  const updateResult = await tx.approval_requests.updateMany({
    where: { id: requestId, status: "approved", executed_at: null },
    data: { executed_at: executedAt, updated_at: executedAt },
  });
  if (Number(updateResult.count || 0) !== 1) {
    throw new DomainConflictError("Approval request execution state could not be updated");
  }
}

// ---------------------------------------------------------------------------
// Loan snapshot / integrity check
// ---------------------------------------------------------------------------

export function assertLoanSnapshotMatchesCurrent(
  loan: {
    status: string;
    balance: number;
    expected_total: number;
    repaid_total: number;
    term_weeks: number | null;
    interest_rate: number;
  },
  snapshot: Record<string, any> | null,
): void {
  if (!snapshot || typeof snapshot !== "object") return;

  const expectedStatus = String(snapshot.status || "").trim().toLowerCase();
  if (expectedStatus && expectedStatus !== String(loan.status || "").trim().toLowerCase()) {
    throw new LoanStateConflictError("Loan status changed after request creation. Submit a new request.", {
      expectedStatus, currentStatus: loan.status,
    });
  }

  const checks: Array<[string, number, number]> = [
    ["balance",       Number(snapshot.balance),       Number(loan.balance || 0)],
    ["expectedTotal", Number(snapshot.expectedTotal), Number(loan.expected_total || 0)],
    ["repaidTotal",   Number(snapshot.repaidTotal),   Number(loan.repaid_total || 0)],
  ];
  for (const [field, expected, current] of checks) {
    if (Number.isFinite(expected) && Math.abs(expected - current) > 0.01) {
      throw new LoanStateConflictError(`Loan ${field} changed after request creation. Submit a new request.`, {
        [`expected${field.charAt(0).toUpperCase()}${field.slice(1)}`]: expected,
        [`current${field.charAt(0).toUpperCase()}${field.slice(1)}`]: current,
      });
    }
  }

  const expectedTermWeeks = Number(snapshot.termWeeks);
  if (Number.isFinite(expectedTermWeeks) && expectedTermWeeks > 0 && Number(loan.term_weeks || 0) !== expectedTermWeeks) {
    throw new LoanStateConflictError("Loan term changed after request creation. Submit a new request.", {
      expectedTermWeeks, currentTermWeeks: Number(loan.term_weeks || 0),
    });
  }

  const expectedRate = Number(snapshot.interestRate);
  if (Number.isFinite(expectedRate) && Math.abs(expectedRate - Number(loan.interest_rate || 0)) > 0.0001) {
    throw new LoanStateConflictError("Loan pricing changed after request creation. Submit a new request.", {
      expectedInterestRate: expectedRate, currentInterestRate: Number(loan.interest_rate || 0),
    });
  }
}

// ---------------------------------------------------------------------------
// Installment schedule generation
// ---------------------------------------------------------------------------

export async function regeneratePendingInstallmentsTx(
  tx: PrismaTransactionClient,
  addWeeksIso: (isoDate: string, weeks: number) => string,
  options: {
    loanId: number;
    expectedTotal: number;
    termWeeks: number;
    scheduleStartDateIso?: string;
    repaidTotal?: number;
    penaltyConfig?: Record<string, any>;
  },
): Promise<void> {
  const scheduleStartDate = options.scheduleStartDateIso || nowIso();
  const termWeeks = Number(options.termWeeks || 0);
  if (!Number.isInteger(termWeeks) || termWeeks <= 0) {
    throw new DomainValidationError("Loan term must be a positive integer");
  }

  const normalizedRepaidTotal = toMoneyDecimal(options.repaidTotal || 0);
  const penaltyConfig = options.penaltyConfig || {};

  const existingInstallments = await tx.loan_installments.findMany({
    where: { loan_id: options.loanId },
    select: {
      id: true, installment_number: true, amount_due: true,
      amount_paid: true, penalty_amount_accrued: true, status: true,
    },
    orderBy: { installment_number: "asc" },
  });

  const hasAccruedPenalties = existingInstallments.some(
    (i: any) => toMoneyDecimal(i.penalty_amount_accrued || 0).gt(0),
  );
  const shouldPreserve = normalizedRepaidTotal.gt(0) || hasAccruedPenalties;
  const preserved = shouldPreserve
    ? existingInstallments.filter((i: any) => (
      toMoneyDecimal(i.amount_paid || 0).gt(0)
      || toMoneyDecimal(i.penalty_amount_accrued || 0).gt(0)
      || String(i.status || "").toLowerCase() === "paid"
    ))
    : [];

  const preservedIds = preserved.map((i: any) => Number(i.id));
  const preservedCount = preserved.length;
  const preservedAmountDue = preserved.reduce(
    (s: any, i: any) => s.plus(i.amount_due || 0), new Decimal(0),
  ).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  const remainingTermWeeks = termWeeks - preservedCount;
  if (remainingTermWeeks < 0) {
    throw new LoanStateConflictError("Existing repayment history exceeds target schedule length", {
      action: "schedule_regeneration",
      existingPaidInstallments: preservedCount,
      targetTermWeeks: termWeeks,
    });
  }

  const remainingExpectedTotal = toMoneyDecimal(options.expectedTotal || 0)
    .minus(preservedAmountDue)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (remainingExpectedTotal.lt(-0.01)) {
    throw new LoanStateConflictError("Existing paid installments exceed regenerated contract total", {
      action: "schedule_regeneration",
      expectedTotal: moneyToNumber(options.expectedTotal || 0),
      preservedAmountDue: preservedAmountDue.toNumber(),
    });
  }

  if (preservedIds.length > 0) {
    await tx.loan_installments.deleteMany({
      where: { loan_id: options.loanId, id: { notIn: preservedIds } },
    });
  } else {
    await tx.loan_installments.deleteMany({ where: { loan_id: options.loanId } });
  }

  const lastPreservedNum = preserved.reduce(
    (max: any, i: any) => Math.max(max, Number(i.installment_number || 0)), 0,
  );
  const nextNum = lastPreservedNum + 1;
  const scheduleAmounts = remainingTermWeeks > 0
    ? buildInstallmentAmounts(Decimal.max(0, remainingExpectedTotal).toNumber(), remainingTermWeeks)
    : [];

  if (scheduleAmounts.length > 0) {
    await tx.loan_installments.createMany({
      data: scheduleAmounts.map((amountDue, i) => ({
        loan_id: options.loanId,
        installment_number: nextNum + i,
        due_date: addWeeksIso(scheduleStartDate, i + 1),
        amount_due: amountDue,
        amount_paid: 0,
        penalty_rate_daily: normalizeOptionalNumber(penaltyConfig.penalty_rate_daily),
        penalty_flat_amount: normalizeOptionalNumber(penaltyConfig.penalty_flat_amount),
        penalty_grace_days: normalizeOptionalInteger(penaltyConfig.penalty_grace_days),
        penalty_cap_amount: normalizeOptionalNumber(penaltyConfig.penalty_cap_amount),
        penalty_compounding_method: normalizeOptionalText(penaltyConfig.penalty_compounding_method),
        penalty_base_amount: normalizeOptionalText(penaltyConfig.penalty_base_amount),
        penalty_cap_percent_of_outstanding: normalizeOptionalNumber(penaltyConfig.penalty_cap_percent_of_outstanding),
        status: "pending",
        created_at: nowIso(),
      })),
    });
  }
}

// ---------------------------------------------------------------------------
// Interest profile
// ---------------------------------------------------------------------------

export async function upsertInterestProfileTx(
  tx: PrismaTransactionClient,
  options: {
    loanId: number;
    accrualMethod: "upfront" | "daily_eod";
    accrualBasis?: "flat" | "reducing";
    accrualStartAt?: string | null;
    maturityAt?: string | null;
    totalContractualInterest: number;
    accruedInterest?: number;
  },
): Promise<void> {
  const accrualMethod = normalizeInterestAccrualMethod(options.accrualMethod);
  const accrualBasis = options.accrualBasis === "reducing" ? "reducing" : "flat";
  const now = nowIso();
  const total = moneyToNumber(options.totalContractualInterest || 0);
  const accrued = moneyToNumber(options.accruedInterest || 0);

  await tx.loan_interest_profiles.upsert({
    where: { loan_id: options.loanId },
    create: {
      loan_id: options.loanId, accrual_method: accrualMethod, accrual_basis: accrualBasis,
      accrual_start_at: options.accrualStartAt || null, maturity_at: options.maturityAt || null,
      total_contractual_interest: total, accrued_interest: accrued,
      last_accrual_at: null, created_at: now, updated_at: now,
    },
    update: {
      accrual_method: accrualMethod, accrual_basis: accrualBasis,
      accrual_start_at: options.accrualStartAt || null, maturity_at: options.maturityAt || null,
      total_contractual_interest: total, accrued_interest: accrued, updated_at: now,
    },
  });
}

// ---------------------------------------------------------------------------
// Disbursement tranche helpers
// ---------------------------------------------------------------------------

export async function sumDisbursedPrincipalTx(
  tx: PrismaTransactionClient,
  loanId: number,
): Promise<number> {
  const rows = await (tx as any).$queryRawUnsafe(
    "SELECT COALESCE(SUM(amount), 0) AS total_amount FROM loan_disbursement_tranches WHERE loan_id = ?",
    loanId,
  );
  return moneyToNumber(rows?.[0]?.total_amount || 0);
}

// ---------------------------------------------------------------------------
// GL receivable interest adjustment
// ---------------------------------------------------------------------------

export async function postReceivableInterestAdjustmentTx(
  tx: PrismaTransactionClient,
  glService: GeneralLedgerServiceLike,
  options: {
    referenceType: string;
    referenceId: number | null | undefined;
    loanId: number;
    clientId: number | null | undefined;
    branchId: number | null | undefined;
    amount: number;
    interestAccountCode: string;
    description: string;
    note?: string | null;
    postedByUserId?: number | null;
  },
): Promise<void> {
  const delta = toMoneyDecimal(options.amount || 0);
  if (delta.abs().lt(0.01)) return;

  const amount = delta.abs().toNumber();
  const lines: JournalLine[] = delta.greaterThan(0)
    ? [
      { accountCode: glService.ACCOUNT_CODES.LOAN_RECEIVABLE ?? "", side: "debit", amount, memo: "Increase receivable from pricing/term adjustment" },
      { accountCode: options.interestAccountCode ?? "", side: "credit", amount, memo: "Recognize additional contractual interest" },
    ]
    : [
      { accountCode: options.interestAccountCode ?? "", side: "debit", amount, memo: "Reverse over-recognized contractual interest" },
      { accountCode: glService.ACCOUNT_CODES.LOAN_RECEIVABLE ?? "", side: "credit", amount, memo: "Reduce receivable from pricing/term adjustment" },
    ];

  await glService.postJournal({
    tx,
    referenceType: options.referenceType,
    referenceId: options.referenceId ?? null,
    loanId: options.loanId,
    clientId: options.clientId ?? null,
    branchId: options.branchId ?? null,
    description: options.description,
    note: options.note || null,
    postedByUserId: options.postedByUserId || null,
    lines,
  });
}

// ---------------------------------------------------------------------------
// Loan product config (penalty params for schedule generation)
// ---------------------------------------------------------------------------

export async function getLoanProductConfigTx(
  tx: PrismaTransactionClient,
  productId: number | null | undefined,
): Promise<Record<string, any>> {
  if (!Number(productId)) return {};
  const rows = await (tx as any).$queryRawUnsafe(
    `SELECT id, name, interest_accrual_method,
      penalty_rate_daily, penalty_flat_amount, penalty_grace_days,
      penalty_cap_amount, penalty_compounding_method, penalty_base_amount,
      penalty_cap_percent_of_outstanding
     FROM loan_products WHERE id = ? LIMIT 1`,
    Number(productId),
  );
  return rows?.[0] || {};
}
