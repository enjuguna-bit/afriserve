import type { DbRunResult } from "../types/dataLayer.js";
import { Prisma, prisma, type PrismaTransactionClient } from "../db/prismaClient.js";
import { Decimal } from "decimal.js";
import {
  ClientNotFoundError,
  DomainConflictError,
  DomainValidationError,
  ForbiddenActionError,
  ForbiddenScopeError,
  InvalidLoanStatusError,
  LoanNotFoundError,
  LoanStateConflictError,
} from "../domain/errors.js";
import { createApprovalWorkflowService } from "./approvalWorkflowService.js";
import { buildLoanContractSnapshotTx, recordLoanContractVersionTx } from "./loanContractVersioning.js";
import { getLoanWorkflowSnapshot } from "./loanWorkflowSnapshotService.js";
import {
  appendDisbursementTrancheTx,
  resolveDisbursementRequest,
} from "./loanLifecycleDisbursementSupport.js";

interface JournalLine {
  accountCode: string;
  side: "debit" | "credit";
  amount: number;
  memo?: string | null | undefined;
}

interface GeneralLedgerServiceLike {
  ACCOUNT_CODES: Record<string, string>;
  postJournal: (options: {
    run?: (sql: string, params?: unknown[]) => Promise<DbRunResult>;
    get?: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
    tx?: PrismaTransactionClient;
    referenceType: string;
    referenceId: number | null | undefined;
    loanId: number | null | undefined;
    clientId: number | null | undefined;
    branchId: number | null | undefined;
    description: string;
    note: string | null | undefined;
    postedByUserId: number | null | undefined;
    lines: JournalLine[];
  }) => Promise<number>;
}

interface LoanLifecycleServiceDeps {
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all?: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  run: (sql: string, params?: unknown[]) => Promise<DbRunResult>;
  executeTransaction: (callback: (tx: {
    run: (sql: string, params?: unknown[]) => Promise<DbRunResult>;
    get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  }) => Promise<unknown> | unknown) => Promise<unknown>;
  hierarchyService: any;
  calculateExpectedTotal: (principal: number, interestRate: number, termWeeks: number) => number;
  addWeeksIso: (isoDate: string, weeksToAdd: number) => string;
  writeAuditLog: (payload: {
    userId?: number | null;
    action: string;
    targetType?: string | null;
    targetId?: number | null;
    details?: string | null;
    ipAddress?: string | null;
  }) => Promise<void> | void;
  invalidateReportCaches: () => Promise<void>;
  requireVerifiedClientKycForLoanApproval: boolean;
  generalLedgerService: GeneralLedgerServiceLike;
  publishDomainEvent?: (payload: {
    eventType: string;
    aggregateType: string;
    aggregateId: number | null | undefined;
    tenantId?: string | null | undefined;
    payload?: Record<string, unknown> | null | undefined;
    metadata?: Record<string, unknown> | null | undefined;
    occurredAt?: string | null | undefined;
  }, tx?: any) => Promise<number>;
}

function createLoanLifecycleService(deps: LoanLifecycleServiceDeps) {
  const {
    get,
    all,
    run,
    executeTransaction,
    hierarchyService,
    calculateExpectedTotal,
    addWeeksIso,
    writeAuditLog,
    invalidateReportCaches,
    requireVerifiedClientKycForLoanApproval,
    generalLedgerService,
    publishDomainEvent = async () => 0,
  } = deps;

  const highRiskCheckerRoles = ["admin", "finance", "operations_manager", "area_manager"];
  const approvalWorkflowService = createApprovalWorkflowService({
    checkerRoles: highRiskCheckerRoles,
  });

  function toMoneyDecimal(value: Decimal.Value): Decimal {
    return new Decimal(value || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }

  function moneyToNumber(value: Decimal.Value): number {
    return toMoneyDecimal(value).toNumber();
  }

  function normalizeOptionalNumber(value: unknown): number | null {
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : null;
  }

  function normalizeOptionalInteger(value: unknown): number | null {
    const normalized = Number(value);
    if (!Number.isFinite(normalized)) {
      return null;
    }
    return Math.max(0, Math.floor(normalized));
  }

  function normalizeOptionalText(value: unknown): string | null {
    const normalized = String(value || "").trim();
    return normalized ? normalized : null;
  }

  function buildInstallmentAmounts(expectedTotal: number, termWeeks: number): number[] {
    const total = toMoneyDecimal(expectedTotal);
    const baseAmount = total.dividedBy(termWeeks).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const amounts = Array.from({ length: termWeeks }, () => baseAmount.toNumber());
    const assigned = baseAmount.mul(termWeeks).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const delta = total.minus(assigned).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    amounts[termWeeks - 1] = baseAmount.plus(delta).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
    return amounts;
  }

  function nowIso(): string {
    return new Date().toISOString();
  }

  function parseApprovalRequestPayload(rawPayload: unknown): Record<string, any> {
    if (rawPayload && typeof rawPayload === "object") {
      return rawPayload as Record<string, any>;
    }

    const serialized = String(rawPayload || "").trim();
    if (!serialized) {
      return {};
    }

    try {
      const parsed = JSON.parse(serialized);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_error) {
      throw new DomainValidationError("Approval request payload is invalid or corrupted");
    }
  }

  function normalizeRole(role: unknown): string {
    return String(role || "").trim().toLowerCase();
  }

  async function publishApprovalRequestCreatedEvent(args: {
    requestId: number;
    requestType: string;
    loanId: number;
    branchId: number | null | undefined;
    requestedByUserId: number;
    note?: string | null;
    approvalRequest?: Record<string, any> | null;
    source: string;
  }): Promise<void> {
  }

  async function finalizeApprovedRequestTx({
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
      select: {
        id: true,
        status: true,
        requested_by_user_id: true,
      },
    });
    if (!request) {
      throw new DomainValidationError("Approval request not found");
    }
    if (String(request.status || "") !== "pending") {
      throw new DomainConflictError("Approval request is not pending");
    }

    if (Number(request.requested_by_user_id || 0) === Number(checkerUserId || 0)) {
      throw new ForbiddenActionError("Maker-Checker violation: You cannot approve your own request");
    }

    const approvedAt = nowIso();
    const updateResult = await tx.approval_requests.updateMany({
      where: {
        id: requestId,
        status: "pending",
      },
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

  async function markApprovedRequestExecutedTx(tx: PrismaTransactionClient, requestId: number): Promise<void> {
    const executedAt = nowIso();
    const updateResult = await tx.approval_requests.updateMany({
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

    if (Number(updateResult.count || 0) !== 1) {
      throw new DomainConflictError("Approval request execution state could not be updated");
    }
  }

  function assertLoanSnapshotMatchesCurrent(
    loan: {
      status: string;
      balance: number;
      expected_total: number;
      repaid_total: number;
      term_weeks: number | null;
      interest_rate: number;
    },
    snapshot: Record<string, any> | null,
  ) {
    if (!snapshot || typeof snapshot !== "object") {
      return;
    }

    const expectedStatus = String(snapshot.status || "").trim().toLowerCase();
    if (expectedStatus && expectedStatus !== String(loan.status || "").trim().toLowerCase()) {
      throw new LoanStateConflictError("Loan status changed after request creation. Submit a new request.", {
        expectedStatus,
        currentStatus: loan.status,
      });
    }

    const expectedBalance = Number(snapshot.balance);
    if (Number.isFinite(expectedBalance) && Math.abs(expectedBalance - Number(loan.balance || 0)) > 0.01) {
      throw new LoanStateConflictError("Loan balance changed after request creation. Submit a new request.", {
        expectedBalance,
        currentBalance: Number(loan.balance || 0),
      });
    }

    const expectedTotal = Number(snapshot.expectedTotal);
    if (Number.isFinite(expectedTotal) && Math.abs(expectedTotal - Number(loan.expected_total || 0)) > 0.01) {
      throw new LoanStateConflictError("Loan totals changed after request creation. Submit a new request.", {
        expectedTotal,
        currentExpectedTotal: Number(loan.expected_total || 0),
      });
    }

    const expectedRepaid = Number(snapshot.repaidTotal);
    if (Number.isFinite(expectedRepaid) && Math.abs(expectedRepaid - Number(loan.repaid_total || 0)) > 0.01) {
      throw new LoanStateConflictError("Loan repayment state changed after request creation. Submit a new request.", {
        expectedRepaid,
        currentRepaidTotal: Number(loan.repaid_total || 0),
      });
    }

    const expectedTermWeeks = Number(snapshot.termWeeks);
    if (Number.isFinite(expectedTermWeeks) && expectedTermWeeks > 0 && Number(loan.term_weeks || 0) !== expectedTermWeeks) {
      throw new LoanStateConflictError("Loan term changed after request creation. Submit a new request.", {
        expectedTermWeeks,
        currentTermWeeks: Number(loan.term_weeks || 0),
      });
    }

    const expectedInterestRate = Number(snapshot.interestRate);
    if (Number.isFinite(expectedInterestRate) && Math.abs(expectedInterestRate - Number(loan.interest_rate || 0)) > 0.0001) {
      throw new LoanStateConflictError("Loan pricing changed after request creation. Submit a new request.", {
        expectedInterestRate,
        currentInterestRate: Number(loan.interest_rate || 0),
      });
    }
  }

  function normalizeInterestAccrualMethod(value: unknown): "upfront" | "daily_eod" {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized === "daily_eod" ? "daily_eod" : "upfront";
  }

  function estimateOutstandingPrincipalForRepricing(loan: {
    principal: number;
    expectedTotal: number;
    balance: number;
  }): number {
    const principal = toMoneyDecimal(loan.principal || 0);
    const expectedTotal = toMoneyDecimal(loan.expectedTotal || 0);
    const balance = toMoneyDecimal(loan.balance || 0);

    if (balance.lte(0) || principal.lte(0)) {
      return 0;
    }

    if (expectedTotal.lte(0)) {
      return Decimal.min(balance, principal).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
    }

    const estimatedPrincipal = balance.mul(principal).div(expectedTotal).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    return Decimal.max(0, Decimal.min(balance, principal, estimatedPrincipal))
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toNumber();
  }

  async function getLoanProductConfigTx(
    tx: PrismaTransactionClient,
    productId: number | null | undefined,
  ): Promise<Record<string, any>> {
    if (!Number(productId)) {
      return {};
    }
    const rows = await tx.$queryRawUnsafe<Array<Record<string, any>>>(
      `
        SELECT
          id,
          name,
          interest_accrual_method,
          penalty_rate_daily,
          penalty_flat_amount,
          penalty_grace_days,
          penalty_cap_amount,
          penalty_compounding_method,
          penalty_base_amount,
          penalty_cap_percent_of_outstanding
        FROM loan_products
        WHERE id = ?
        LIMIT 1
      `,
      Number(productId),
    );

    return rows?.[0] || {};
  }

  async function regeneratePendingInstallmentsTx(
    tx: PrismaTransactionClient,
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
    const repaymentReference = normalizedRepaidTotal.gt(0)
      ? await tx.repayments.findFirst({
        where: { loan_id: options.loanId },
        orderBy: [
          { paid_at: "desc" },
          { id: "desc" },
        ],
        select: { paid_at: true },
      })
      : null;

    const existingInstallments = await tx.loan_installments.findMany({
      where: {
        loan_id: options.loanId,
      },
      select: {
        id: true,
        installment_number: true,
        amount_due: true,
        amount_paid: true,
        penalty_amount_accrued: true,
        status: true,
      },
      orderBy: {
        installment_number: "asc",
      },
    });

    const hasAccruedPenalties = existingInstallments.some(
      (installment) => toMoneyDecimal(installment.penalty_amount_accrued || 0).gt(0),
    );
    const shouldPreserveHistoricalInstallments = normalizedRepaidTotal.gt(0) || hasAccruedPenalties;
    const preservedInstallments = shouldPreserveHistoricalInstallments
      ? existingInstallments.filter((installment) => (
        toMoneyDecimal(installment.amount_paid || 0).gt(0)
        || toMoneyDecimal(installment.penalty_amount_accrued || 0).gt(0)
        || String(installment.status || "").toLowerCase() === "paid"
      ))
      : [];
    const preservedInstallmentIds = preservedInstallments.map((installment) => Number(installment.id));
    const preservedInstallmentCount = preservedInstallments.length;
    const preservedAmountDue = preservedInstallments.reduce(
      (sum, installment) => sum.plus(installment.amount_due || 0),
      new Decimal(0),
    ).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const preservedAmountPaid = preservedInstallments.reduce(
      (sum, installment) => sum.plus(installment.amount_paid || 0),
      new Decimal(0),
    ).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    const remainingTermWeeks = termWeeks - preservedInstallmentCount;
    if (remainingTermWeeks < 0) {
      throw new LoanStateConflictError("Existing repayment history exceeds target schedule length", {
        action: "schedule_regeneration",
        existingPaidInstallments: preservedInstallmentCount,
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

    if (preservedInstallmentIds.length > 0) {
      await tx.loan_installments.deleteMany({
        where: {
          loan_id: options.loanId,
          id: { notIn: preservedInstallmentIds },
        },
      });
    } else {
      await tx.loan_installments.deleteMany({
        where: {
          loan_id: options.loanId,
        },
      });
    }

    const lastPreservedInstallmentNumber = preservedInstallments.reduce(
      (maxInstallmentNumber, installment) => Math.max(maxInstallmentNumber, Number(installment.installment_number || 0)),
      0,
    );
    const nextInstallmentNumber = lastPreservedInstallmentNumber + 1;
    const scheduleAmounts = remainingTermWeeks > 0
      ? buildInstallmentAmounts(Decimal.max(0, remainingExpectedTotal).toNumber(), remainingTermWeeks)
      : [];

    if (scheduleAmounts.length > 0) {
      await tx.loan_installments.createMany({
        data: scheduleAmounts.map((amountDue, index) => ({
          loan_id: options.loanId,
          installment_number: nextInstallmentNumber + index,
          due_date: addWeeksIso(scheduleStartDate, index + 1),
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

    if (normalizedRepaidTotal.lte(0)) {
      return;
    }

    let remaining = Decimal.max(0, normalizedRepaidTotal.minus(preservedAmountPaid))
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    if (remaining.lte(0)) {
      return;
    }

    const installments = await tx.loan_installments.findMany({
      where: {
        loan_id: options.loanId,
        installment_number: {
          gte: nextInstallmentNumber,
        },
      },
      select: {
        id: true,
        amount_due: true,
        due_date: true,
        paid_at: true,
      },
      orderBy: {
        installment_number: "asc",
      },
    });

    const nowMs = Date.now();
    const paidAtFallback = repaymentReference?.paid_at || nowIso();

    for (const installment of installments) {
      const amountDue = toMoneyDecimal(installment.amount_due || 0);
      const amountPaid = Decimal.min(remaining, amountDue).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const isPaid = amountPaid.greaterThanOrEqualTo(amountDue);
      const dueDateMs = new Date(String(installment.due_date || "")).getTime();
      const shouldBeOverdue = !isPaid && Number.isFinite(dueDateMs) && dueDateMs < nowMs;

      await tx.loan_installments.update({
        where: { id: installment.id },
        data: {
          amount_paid: amountPaid.toNumber(),
          status: isPaid ? "paid" : (shouldBeOverdue ? "overdue" : "pending"),
          paid_at: isPaid ? (installment.paid_at || paidAtFallback) : null,
        },
      });

      remaining = Decimal.max(0, remaining.minus(amountDue)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    }

    if (remaining.gt(0.01)) {
      throw new LoanStateConflictError("Loan repayment progress exceeds regenerated installment schedule", {
        action: "schedule_regeneration",
        remainingRepaidTotal: remaining.toNumber(),
      });
    }
  }

  async function upsertInterestProfileTx(
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
    const startAt = options.accrualStartAt || null;
    const maturityAt = options.maturityAt || null;
    const totalContractualInterest = moneyToNumber(options.totalContractualInterest || 0);
    const accruedInterest = moneyToNumber(options.accruedInterest || 0);

    const now = nowIso();
    await tx.loan_interest_profiles.upsert({
      where: {
        loan_id: options.loanId,
      },
      create: {
        loan_id: options.loanId,
        accrual_method: accrualMethod,
        accrual_basis: accrualBasis,
        accrual_start_at: startAt,
        maturity_at: maturityAt,
        total_contractual_interest: totalContractualInterest,
        accrued_interest: accruedInterest,
        last_accrual_at: null,
        created_at: now,
        updated_at: now,
      },
      update: {
        accrual_method: accrualMethod,
        accrual_basis: accrualBasis,
        accrual_start_at: startAt,
        maturity_at: maturityAt,
        total_contractual_interest: totalContractualInterest,
        accrued_interest: accruedInterest,
        updated_at: now,
      },
    });
  }

  async function sumDisbursedPrincipalTx(tx: PrismaTransactionClient, loanId: number): Promise<number> {
    const rows = await tx.$queryRawUnsafe<Array<{ total_amount: number | null }>>(
      "SELECT COALESCE(SUM(amount), 0) AS total_amount FROM loan_disbursement_tranches WHERE loan_id = ?",
      loanId,
    );
    return moneyToNumber(rows?.[0]?.total_amount || 0);
  }

  async function postReceivableInterestAdjustmentTx(
    tx: PrismaTransactionClient,
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
    if (delta.abs().lt(0.01)) {
      return;
    }

    const amount = delta.abs().toNumber();
    const lines: JournalLine[] = delta.greaterThan(0)
      ? [
        {
          accountCode: generalLedgerService.ACCOUNT_CODES.LOAN_RECEIVABLE,
          side: "debit",
          amount,
          memo: "Increase receivable from pricing/term adjustment",
        },
        {
          accountCode: options.interestAccountCode,
          side: "credit",
          amount,
          memo: "Recognize additional contractual interest",
        },
      ]
      : [
        {
          accountCode: options.interestAccountCode,
          side: "debit",
          amount,
          memo: "Reverse over-recognized contractual interest",
        },
        {
          accountCode: generalLedgerService.ACCOUNT_CODES.LOAN_RECEIVABLE,
          side: "credit",
          amount,
          memo: "Reduce receivable from pricing/term adjustment",
        },
      ];

    await generalLedgerService.postJournal({
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

  async function executeWriteOffLoanFromApprovedRequest({
    loanId,
    note,
    checkerUserId,
    requestSnapshot,
    transactionClient,
  }: {
    loanId: number;
    note?: string;
    checkerUserId: number;
    requestSnapshot?: Record<string, any> | null;
    transactionClient?: PrismaTransactionClient;
  }) {
    const snapshotClient = transactionClient || prisma;
    const loan = await snapshotClient.loans.findUnique({
      where: { id: loanId },
      select: {
        id: true,
        client_id: true,
        branch_id: true,
        status: true,
        principal: true,
        balance: true,
        repaid_total: true,
        expected_total: true,
        term_weeks: true,
        interest_rate: true,
      },
    });
    if (!loan) {
      throw new LoanNotFoundError();
    }

    assertLoanSnapshotMatchesCurrent(
      {
        status: String(loan.status || ""),
        balance: Number(loan.balance || 0),
        expected_total: Number(loan.expected_total || 0),
        repaid_total: Number(loan.repaid_total || 0),
        term_weeks: Number(loan.term_weeks || 0),
        interest_rate: Number(loan.interest_rate || 0),
      },
      requestSnapshot || null,
    );

    const runWriteOffMutation = async (tx: PrismaTransactionClient) => {
      const loanForWriteOff = await tx.loans.findUnique({
        where: { id: loanId },
        select: {
          id: true,
          client_id: true,
          branch_id: true,
          status: true,
          principal: true,
          balance: true,
          repaid_total: true,
          expected_total: true,
          term_weeks: true,
          interest_rate: true,
        },
      });
      if (!loanForWriteOff) {
        throw new LoanNotFoundError();
      }

      assertLoanSnapshotMatchesCurrent(
        {
          status: String(loanForWriteOff.status || ""),
          balance: Number(loanForWriteOff.balance || 0),
          expected_total: Number(loanForWriteOff.expected_total || 0),
          repaid_total: Number(loanForWriteOff.repaid_total || 0),
          term_weeks: Number(loanForWriteOff.term_weeks || 0),
          interest_rate: Number(loanForWriteOff.interest_rate || 0),
        },
        requestSnapshot || null,
      );

      if (loanForWriteOff.status === "written_off") {
        throw new LoanStateConflictError("Loan has already been written off", {
          currentStatus: loanForWriteOff.status,
          action: "write_off",
        });
      }
      if (loanForWriteOff.status === "closed") {
        throw new LoanStateConflictError("Cannot write off a closed loan", { currentStatus: loanForWriteOff.status, action: "write_off" });
      }
      if (loanForWriteOff.status === "pending_approval" || loanForWriteOff.status === "approved" || loanForWriteOff.status === "rejected") {
        throw new LoanStateConflictError("Cannot write off a loan that has not been disbursed", {
          currentStatus: loanForWriteOff.status,
          action: "write_off",
        });
      }
      if (Number(loanForWriteOff.balance || 0) <= 0) {
        throw new LoanStateConflictError("Cannot write off a loan with zero outstanding balance", {
          currentStatus: loanForWriteOff.status,
          action: "write_off",
        });
      }

      const writeOffUpdate = await tx.loans.updateMany({
        where: {
          id: loanId,
          status: loanForWriteOff.status,
          balance: Number(loanForWriteOff.balance || 0),
        },
        data: {
          status: "written_off",
        },
      });
      if (Number(writeOffUpdate.count || 0) !== 1) {
        throw new LoanStateConflictError("Loan state changed during write-off. Retry operation.", {
          currentStatus: loanForWriteOff.status,
          action: "write_off",
        });
      }

      await tx.transactions.create({
        data: {
          loan_id: loanForWriteOff.id,
          client_id: loanForWriteOff.client_id,
          branch_id: loanForWriteOff.branch_id,
          tx_type: "write_off",
          amount: Number(loanForWriteOff.balance || 0),
          note: note || "Loan written off",
          occurred_at: nowIso(),
        },
      });

      const journalId = await generalLedgerService.postJournal({
        tx,
        referenceType: "loan_write_off",
        referenceId: loanForWriteOff.id,
        loanId: loanForWriteOff.id,
        clientId: loanForWriteOff.client_id,
        branchId: loanForWriteOff.branch_id,
        description: "Loan balance written off",
        note: note || null,
        postedByUserId: checkerUserId,
        lines: [
          {
            accountCode: generalLedgerService.ACCOUNT_CODES.WRITE_OFF_EXPENSE,
            side: "debit",
            amount: Number(loanForWriteOff.balance || 0),
            memo: "Recognize loan write-off expense",
          },
          {
            accountCode: generalLedgerService.ACCOUNT_CODES.LOAN_RECEIVABLE,
            side: "credit",
            amount: Number(loanForWriteOff.balance || 0),
            memo: "Remove uncollectible receivable",
          },
        ],
      });

      const updatedLoan = await tx.loans.findUnique({ where: { id: loanId } });
      const contractSnapshot = await buildLoanContractSnapshotTx(tx, loanId, {
        previousLoan: loanForWriteOff,
        writeOffAmount: Number(loanForWriteOff.balance || 0),
        journalId,
      });

      await recordLoanContractVersionTx(tx, {
        loanId,
        eventType: "write_off",
        note: note || "Loan written off",
        createdByUserId: checkerUserId,
        snapshotJson: contractSnapshot,
        principal: Number(updatedLoan?.principal || loanForWriteOff.principal || 0),
        interestRate: Number(updatedLoan?.interest_rate || loanForWriteOff.interest_rate || 0),
        termWeeks: Number(updatedLoan?.term_weeks || loanForWriteOff.term_weeks || 0),
        expectedTotal: Number(updatedLoan?.expected_total || loanForWriteOff.expected_total || 0),
        repaidTotal: Number(updatedLoan?.repaid_total || loanForWriteOff.repaid_total || 0),
        balance: Number(updatedLoan?.balance || 0),
      });

      return {
        previousLoan: loanForWriteOff,
        updatedLoan,
        journalId,
      };
    };

    const writeOffResult = transactionClient
      ? await runWriteOffMutation(transactionClient)
      : await prisma.$transaction(async (tx) => runWriteOffMutation(tx), { maxWait: 10000, timeout: 20000 });

    return {
      previousLoan: writeOffResult.previousLoan,
      updatedLoan: writeOffResult.updatedLoan,
      journalId: writeOffResult.journalId,
    };
  }

  async function executeRestructureLoanFromApprovedRequest({
    loanId,
    newTermWeeks,
    waiveInterest,
    note,
    executedByUserId,
    requestSnapshot,
    transactionClient,
  }: {
    loanId: number;
    newTermWeeks: number;
    waiveInterest?: boolean;
    note?: string;
    executedByUserId?: number;
    requestSnapshot?: Record<string, any> | null;
    transactionClient?: PrismaTransactionClient;
  }) {
    const snapshotClient = transactionClient || prisma;
    const loan = await snapshotClient.loans.findUnique({
      where: { id: loanId },
      select: {
        id: true,
        client_id: true,
        branch_id: true,
        product_id: true,
        status: true,
        principal: true,
        interest_rate: true,
        term_weeks: true,
        expected_total: true,
        repaid_total: true,
        balance: true,
      },
    });
    if (!loan) {
      throw new LoanNotFoundError();
    }

    assertLoanSnapshotMatchesCurrent(
      {
        status: String(loan.status || ""),
        balance: Number(loan.balance || 0),
        expected_total: Number(loan.expected_total || 0),
        repaid_total: Number(loan.repaid_total || 0),
        term_weeks: Number(loan.term_weeks || 0),
        interest_rate: Number(loan.interest_rate || 0),
      },
      requestSnapshot || null,
    );

    const runRestructureMutation = async (tx: PrismaTransactionClient) => {
      const loanForRestructure = await tx.loans.findUnique({
        where: { id: loanId },
        select: {
          id: true,
          client_id: true,
          branch_id: true,
          product_id: true,
          status: true,
          principal: true,
          interest_rate: true,
          term_weeks: true,
          expected_total: true,
          repaid_total: true,
          balance: true,
        },
      });
      if (!loanForRestructure) {
        throw new LoanNotFoundError();
      }

      assertLoanSnapshotMatchesCurrent(
        {
          status: String(loanForRestructure.status || ""),
          balance: Number(loanForRestructure.balance || 0),
          expected_total: Number(loanForRestructure.expected_total || 0),
          repaid_total: Number(loanForRestructure.repaid_total || 0),
          term_weeks: Number(loanForRestructure.term_weeks || 0),
          interest_rate: Number(loanForRestructure.interest_rate || 0),
        },
        requestSnapshot || null,
      );

      if (loanForRestructure.status === "closed") {
        throw new LoanStateConflictError("Cannot restructure a closed loan", { currentStatus: loanForRestructure.status, action: "restructure" });
      }
      if (loanForRestructure.status === "written_off") {
        throw new LoanStateConflictError("Cannot restructure a written-off loan", {
          currentStatus: loanForRestructure.status,
          action: "restructure",
        });
      }
      if (
        loanForRestructure.status === "pending_approval"
        || loanForRestructure.status === "approved"
        || loanForRestructure.status === "rejected"
      ) {
        throw new LoanStateConflictError("Cannot restructure a loan that has not been disbursed", {
          currentStatus: loanForRestructure.status,
          action: "restructure",
        });
      }

      const outstandingBalance = Number(loanForRestructure.balance || 0);
      if (outstandingBalance <= 0) {
        throw new LoanStateConflictError("Cannot restructure a loan with zero outstanding balance", {
          currentStatus: loanForRestructure.status,
          action: "restructure",
        });
      }
      const repricingPrincipal = estimateOutstandingPrincipalForRepricing({
        principal: Number(loanForRestructure.principal || 0),
        expectedTotal: Number(loanForRestructure.expected_total || 0),
        balance: outstandingBalance,
      });
      if (repricingPrincipal <= 0) {
        throw new LoanStateConflictError("Cannot restructure a loan with no outstanding principal", {
          currentStatus: loanForRestructure.status,
          action: "restructure",
        });
      }

      const shouldWaiveInterest = waiveInterest === true;
      const nextInterestRate = shouldWaiveInterest ? 0 : Number(loanForRestructure.interest_rate || 0);
      const newOutstandingTotal = moneyToNumber(calculateExpectedTotal(repricingPrincipal, nextInterestRate, newTermWeeks));
      const nextExpectedTotal = newOutstandingTotal;
      const nextTermMonths = Math.max(1, Math.ceil(newTermWeeks / 4));
      const scheduleStartDate = new Date().toISOString();
      const productConfig = await getLoanProductConfigTx(tx, Number(loanForRestructure.product_id || 0));

      await regeneratePendingInstallmentsTx(tx, {
        loanId,
        expectedTotal: newOutstandingTotal,
        termWeeks: newTermWeeks,
        scheduleStartDateIso: scheduleStartDate,
        repaidTotal: 0,
        penaltyConfig: productConfig,
      });

      const restructureUpdate = await tx.loans.updateMany({
        where: {
          id: loanId,
          status: loanForRestructure.status,
          balance: outstandingBalance,
          expected_total: Number(loanForRestructure.expected_total || 0),
          repaid_total: Number(loanForRestructure.repaid_total || 0),
        },
        data: {
          status: "restructured",
          principal: repricingPrincipal,
          interest_rate: nextInterestRate,
          term_months: nextTermMonths,
          term_weeks: newTermWeeks,
          expected_total: nextExpectedTotal,
          repaid_total: 0,
          balance: newOutstandingTotal,
        },
      });
      if (Number(restructureUpdate.count || 0) !== 1) {
        throw new LoanStateConflictError("Loan state changed during restructure. Retry operation.", {
          currentStatus: loanForRestructure.status,
          action: "restructure",
        });
      }

      const restructureTx = await tx.transactions.create({
        data: {
          loan_id: loanId,
          client_id: loanForRestructure.client_id,
          branch_id: loanForRestructure.branch_id,
          tx_type: "restructure",
          amount: newOutstandingTotal,
          note: note || (shouldWaiveInterest
            ? `Loan restructured to ${newTermWeeks} weeks with waived interest`
            : `Loan restructured to ${newTermWeeks} weeks`),
          occurred_at: nowIso(),
        },
      });

      const contractualInterest = moneyToNumber(new Decimal(nextExpectedTotal).minus(repricingPrincipal));
      const accrualMethod = normalizeInterestAccrualMethod(productConfig.interest_accrual_method);
      await upsertInterestProfileTx(tx, {
        loanId,
        accrualMethod,
        accrualBasis: "flat",
        accrualStartAt: scheduleStartDate,
        maturityAt: addWeeksIso(scheduleStartDate, newTermWeeks),
        totalContractualInterest: contractualInterest,
        accruedInterest: accrualMethod === "daily_eod" ? 0 : contractualInterest,
      });

      const updatedLoan = await tx.loans.findUnique({ where: { id: loanId } });
      const contractSnapshot = await buildLoanContractSnapshotTx(tx, loanId, {
        previousLoan: loanForRestructure,
        newTermWeeks,
        waiveInterest: shouldWaiveInterest,
        repricingPrincipal,
        transactionId: Number(restructureTx.id || 0),
      });

      await recordLoanContractVersionTx(tx, {
        loanId,
        eventType: "restructure",
        note: note || null,
        createdByUserId: executedByUserId || null,
        snapshotJson: contractSnapshot,
        principal: Number(updatedLoan?.principal || repricingPrincipal),
        interestRate: nextInterestRate,
        termWeeks: newTermWeeks,
        expectedTotal: Number(updatedLoan?.expected_total || nextExpectedTotal),
        repaidTotal: Number(updatedLoan?.repaid_total || 0),
        balance: Number(updatedLoan?.balance || newOutstandingTotal),
      });

      return {
        updatedLoan,
        transaction: await tx.transactions.findUnique({ where: { id: restructureTx.id } }),
        previousLoan: loanForRestructure,
        newOutstandingTotal,
        nextExpectedTotal,
        shouldWaiveInterest,
        nextInterestRate,
      };
    };

    const restructureResult = transactionClient
      ? await runRestructureMutation(transactionClient)
      : await prisma.$transaction(async (tx) => runRestructureMutation(tx), { maxWait: 10000, timeout: 20000 });

    return restructureResult;
  }

  async function executeTopUpLoanFromApprovedRequest({
    loanId,
    additionalPrincipal,
    newTermWeeks,
    note,
    executedByUserId,
    requestSnapshot,
    transactionClient,
  }: {
    loanId: number;
    additionalPrincipal: number;
    newTermWeeks?: number;
    note?: string;
    executedByUserId?: number;
    requestSnapshot?: Record<string, any> | null;
    transactionClient?: PrismaTransactionClient;
  }) {
    const snapshotClient = transactionClient || prisma;
    const loan = await snapshotClient.loans.findUnique({
      where: { id: loanId },
      select: {
        id: true,
        client_id: true,
        branch_id: true,
        product_id: true,
        status: true,
        principal: true,
        interest_rate: true,
        term_weeks: true,
        expected_total: true,
        repaid_total: true,
        balance: true,
      },
    });
    if (!loan) {
      throw new LoanNotFoundError();
    }

    assertLoanSnapshotMatchesCurrent(
      {
        status: String(loan.status || ""),
        balance: Number(loan.balance || 0),
        expected_total: Number(loan.expected_total || 0),
        repaid_total: Number(loan.repaid_total || 0),
        term_weeks: Number(loan.term_weeks || 0),
        interest_rate: Number(loan.interest_rate || 0),
      },
      requestSnapshot || null,
    );

    const runTopUpMutation = async (tx: PrismaTransactionClient) => {
      const loanForTopUp = await tx.loans.findUnique({
        where: { id: loanId },
        select: {
          id: true,
          client_id: true,
          branch_id: true,
          product_id: true,
          status: true,
          principal: true,
          interest_rate: true,
          term_weeks: true,
          expected_total: true,
          repaid_total: true,
          balance: true,
        },
      });
      if (!loanForTopUp) {
        throw new LoanNotFoundError();
      }

      if (["closed", "written_off", "pending_approval", "approved", "rejected"].includes(String(loanForTopUp.status || ""))) {
        throw new LoanStateConflictError("Cannot top-up a non-active loan", {
          currentStatus: loanForTopUp.status,
          action: "top_up",
        });
      }

      const normalizedAdditionalPrincipal = moneyToNumber(additionalPrincipal || 0);
      if (normalizedAdditionalPrincipal <= 0) {
        throw new DomainValidationError("additionalPrincipal must be greater than zero");
      }

      const targetTermWeeks = Number(newTermWeeks || loanForTopUp.term_weeks || 0);
      if (!Number.isInteger(targetTermWeeks) || targetTermWeeks <= 0) {
        throw new DomainValidationError("newTermWeeks must be a positive integer");
      }

      const additionalExpectedTotal = moneyToNumber(
        calculateExpectedTotal(normalizedAdditionalPrincipal, Number(loanForTopUp.interest_rate || 0), targetTermWeeks),
      );
      const additionalInterest = moneyToNumber(new Decimal(additionalExpectedTotal).minus(normalizedAdditionalPrincipal));
      const nextExpectedTotal = moneyToNumber(new Decimal(loanForTopUp.expected_total || 0).plus(additionalExpectedTotal));
      const nextBalance = moneyToNumber(new Decimal(loanForTopUp.balance || 0).plus(additionalExpectedTotal));
      const nextPrincipal = moneyToNumber(new Decimal(loanForTopUp.principal || 0).plus(normalizedAdditionalPrincipal));
      const nextTermMonths = Math.max(1, Math.ceil(targetTermWeeks / 4));
      const productConfig = await getLoanProductConfigTx(tx, Number(loanForTopUp.product_id || 0));
      const accrualMethod = normalizeInterestAccrualMethod(productConfig.interest_accrual_method);
      const interestAccountCode = accrualMethod === "daily_eod"
        ? generalLedgerService.ACCOUNT_CODES.UNEARNED_INTEREST
        : generalLedgerService.ACCOUNT_CODES.INTEREST_INCOME;

      const updateLoanResult = await tx.loans.updateMany({
        where: {
          id: loanId,
          status: String(loanForTopUp.status || ""),
          balance: Number(loanForTopUp.balance || 0),
          expected_total: Number(loanForTopUp.expected_total || 0),
        },
        data: {
          principal: nextPrincipal,
          term_weeks: targetTermWeeks,
          term_months: nextTermMonths,
          expected_total: nextExpectedTotal,
          balance: nextBalance,
          status: String(loanForTopUp.status || "") === "restructured" ? "restructured" : "active",
        },
      });
      if (Number(updateLoanResult.count || 0) !== 1) {
        throw new LoanStateConflictError("Loan state changed during top-up. Retry operation.", {
          currentStatus: loanForTopUp.status,
          action: "top_up",
        });
      }

      const topUpTx = await tx.transactions.create({
        data: {
          loan_id: loanId,
          client_id: loanForTopUp.client_id,
          branch_id: loanForTopUp.branch_id,
          tx_type: "top_up",
          amount: normalizedAdditionalPrincipal,
          note: note || `Loan top-up principal ${normalizedAdditionalPrincipal}`,
          occurred_at: nowIso(),
        },
      });

      const topUpDisbursementAt = nowIso();
      await appendDisbursementTrancheTx({
        tx,
        loanId,
        amount: normalizedAdditionalPrincipal,
        disbursedAt: topUpDisbursementAt,
        disbursedByUserId: Number(executedByUserId || 0) || null,
        note: note || "Top-up disbursement",
        isFinal: true,
      });

      await generalLedgerService.postJournal({
        tx,
        referenceType: "loan_top_up",
        referenceId: Number(topUpTx.id || 0),
        loanId,
        clientId: loanForTopUp.client_id,
        branchId: loanForTopUp.branch_id,
        description: "Loan top-up disbursement posted",
        note: note || null,
        postedByUserId: executedByUserId || null,
        lines: [
          {
            accountCode: generalLedgerService.ACCOUNT_CODES.LOAN_RECEIVABLE,
            side: "debit",
            amount: additionalExpectedTotal,
            memo: "Increase receivable for top-up contract",
          },
          {
            accountCode: generalLedgerService.ACCOUNT_CODES.CASH,
            side: "credit",
            amount: normalizedAdditionalPrincipal,
            memo: "Cash disbursed for top-up",
          },
          ...(additionalInterest > 0
            ? [{
              accountCode: interestAccountCode,
              side: "credit" as const,
              amount: additionalInterest,
              memo: accrualMethod === "daily_eod"
                ? "Defer top-up interest for daily accrual recognition"
                : "Recognize top-up contractual interest",
            }]
            : []),
        ],
      });

      const profileRows = await tx.$queryRawUnsafe<Array<{ total_contractual_interest: number | null; accrued_interest: number | null }>>(
        "SELECT total_contractual_interest, accrued_interest FROM loan_interest_profiles WHERE loan_id = ? LIMIT 1",
        loanId,
      );
      const currentTotalContractInterest = moneyToNumber(profileRows?.[0]?.total_contractual_interest || 0);
      const currentAccruedInterest = moneyToNumber(profileRows?.[0]?.accrued_interest || 0);
      const nextTotalContractInterest = moneyToNumber(new Decimal(currentTotalContractInterest).plus(additionalInterest));

      await upsertInterestProfileTx(tx, {
        loanId,
        accrualMethod,
        accrualBasis: "flat",
        accrualStartAt: nowIso(),
        maturityAt: addWeeksIso(nowIso(), targetTermWeeks),
        totalContractualInterest: nextTotalContractInterest,
        accruedInterest: accrualMethod === "daily_eod" ? currentAccruedInterest : nextTotalContractInterest,
      });

      await regeneratePendingInstallmentsTx(tx, {
        loanId,
        expectedTotal: nextExpectedTotal,
        termWeeks: targetTermWeeks,
        scheduleStartDateIso: nowIso(),
        repaidTotal: Number(loanForTopUp.repaid_total || 0),
        penaltyConfig: productConfig,
      });

      const updatedLoan = await tx.loans.findUnique({ where: { id: loanId } });
      const contractSnapshot = await buildLoanContractSnapshotTx(tx, loanId, {
        previousLoan: loanForTopUp,
        additionalPrincipal: normalizedAdditionalPrincipal,
        additionalInterest,
        transactionId: Number(topUpTx.id || 0),
      });

      await recordLoanContractVersionTx(tx, {
        loanId,
        eventType: "top_up",
        note: note || null,
        createdByUserId: executedByUserId || null,
        snapshotJson: contractSnapshot,
        principal: Number(updatedLoan?.principal || nextPrincipal),
        interestRate: Number(loanForTopUp.interest_rate || 0),
        termWeeks: targetTermWeeks,
        expectedTotal: Number(updatedLoan?.expected_total || nextExpectedTotal),
        repaidTotal: Number(updatedLoan?.repaid_total || loanForTopUp.repaid_total || 0),
        balance: Number(updatedLoan?.balance || nextBalance),
      });

      return {
        updatedLoan,
        transaction: await tx.transactions.findUnique({ where: { id: topUpTx.id } }),
      };
    };

    const topUpResult = transactionClient
      ? await runTopUpMutation(transactionClient)
      : await prisma.$transaction(async (tx) => runTopUpMutation(tx), { maxWait: 10000, timeout: 20000 });

    return topUpResult;
  }

  async function executeRefinanceLoanFromApprovedRequest({
    loanId,
    newTermWeeks,
    newInterestRate,
    additionalPrincipal,
    note,
    executedByUserId,
    requestSnapshot,
    transactionClient,
  }: {
    loanId: number;
    newTermWeeks: number;
    newInterestRate: number;
    additionalPrincipal?: number;
    note?: string;
    executedByUserId?: number;
    requestSnapshot?: Record<string, any> | null;
    transactionClient?: PrismaTransactionClient;
  }) {
    const snapshotClient = transactionClient || prisma;
    const loan = await snapshotClient.loans.findUnique({
      where: { id: loanId },
      select: {
        id: true,
        client_id: true,
        branch_id: true,
        product_id: true,
        status: true,
        principal: true,
        interest_rate: true,
        term_weeks: true,
        expected_total: true,
        repaid_total: true,
        balance: true,
      },
    });
    if (!loan) {
      throw new LoanNotFoundError();
    }

    assertLoanSnapshotMatchesCurrent(
      {
        status: String(loan.status || ""),
        balance: Number(loan.balance || 0),
        expected_total: Number(loan.expected_total || 0),
        repaid_total: Number(loan.repaid_total || 0),
        term_weeks: Number(loan.term_weeks || 0),
        interest_rate: Number(loan.interest_rate || 0),
      },
      requestSnapshot || null,
    );

    const runRefinanceMutation = async (tx: PrismaTransactionClient) => {
      const loanForRefinance = await tx.loans.findUnique({
        where: { id: loanId },
        select: {
          id: true,
          client_id: true,
          branch_id: true,
          product_id: true,
          status: true,
          principal: true,
          interest_rate: true,
          term_weeks: true,
          expected_total: true,
          repaid_total: true,
          balance: true,
        },
      });
      if (!loanForRefinance) {
        throw new LoanNotFoundError();
      }

      if (["closed", "written_off", "pending_approval", "approved", "rejected"].includes(String(loanForRefinance.status || ""))) {
        throw new LoanStateConflictError("Cannot refinance a non-active loan", {
          currentStatus: loanForRefinance.status,
          action: "refinance",
        });
      }

      const normalizedAdditionalPrincipal = moneyToNumber(additionalPrincipal || 0);
      const outstandingPrincipal = estimateOutstandingPrincipalForRepricing({
        principal: Number(loanForRefinance.principal || 0),
        expectedTotal: Number(loanForRefinance.expected_total || 0),
        balance: Number(loanForRefinance.balance || 0),
      });
      const basePrincipal = moneyToNumber(new Decimal(outstandingPrincipal).plus(normalizedAdditionalPrincipal));
      if (basePrincipal <= 0) {
        throw new LoanStateConflictError("Cannot refinance a loan with no outstanding principal", {
          currentStatus: loanForRefinance.status,
          action: "refinance",
        });
      }
      const nextExpectedTotal = moneyToNumber(calculateExpectedTotal(basePrincipal, newInterestRate, newTermWeeks));
      const nextBalance = nextExpectedTotal;
      const interestAdjustment = moneyToNumber(new Decimal(nextExpectedTotal).minus(loanForRefinance.balance || 0).minus(normalizedAdditionalPrincipal));
      const nextTermMonths = Math.max(1, Math.ceil(newTermWeeks / 4));
      const productConfig = await getLoanProductConfigTx(tx, Number(loanForRefinance.product_id || 0));
      const accrualMethod = normalizeInterestAccrualMethod(productConfig.interest_accrual_method);
      const interestAccountCode = accrualMethod === "daily_eod"
        ? generalLedgerService.ACCOUNT_CODES.UNEARNED_INTEREST
        : generalLedgerService.ACCOUNT_CODES.INTEREST_INCOME;

      const updateLoanResult = await tx.loans.updateMany({
        where: {
          id: loanId,
          status: String(loanForRefinance.status || ""),
          balance: Number(loanForRefinance.balance || 0),
          expected_total: Number(loanForRefinance.expected_total || 0),
        },
        data: {
          status: "restructured",
          principal: basePrincipal,
          interest_rate: newInterestRate,
          term_weeks: newTermWeeks,
          term_months: nextTermMonths,
          expected_total: nextExpectedTotal,
          repaid_total: 0,
          balance: nextBalance,
        },
      });
      if (Number(updateLoanResult.count || 0) !== 1) {
        throw new LoanStateConflictError("Loan state changed during refinance. Retry operation.", {
          currentStatus: loanForRefinance.status,
          action: "refinance",
        });
      }

      const refinanceTx = await tx.transactions.create({
        data: {
          loan_id: loanId,
          client_id: loanForRefinance.client_id,
          branch_id: loanForRefinance.branch_id,
          tx_type: "refinance",
          amount: nextExpectedTotal,
          note: note || `Loan refinanced to ${newTermWeeks} weeks`,
          occurred_at: nowIso(),
        },
      });

      if (normalizedAdditionalPrincipal > 0) {
        await generalLedgerService.postJournal({
          tx,
          referenceType: "loan_refinance_cash",
          referenceId: Number(refinanceTx.id || 0),
          loanId,
          clientId: loanForRefinance.client_id,
          branchId: loanForRefinance.branch_id,
          description: "Refinance top-up disbursement posted",
          note: note || null,
          postedByUserId: executedByUserId || null,
          lines: [
            {
              accountCode: generalLedgerService.ACCOUNT_CODES.LOAN_RECEIVABLE,
              side: "debit",
              amount: normalizedAdditionalPrincipal,
              memo: "Increase receivable from refinance top-up principal",
            },
            {
              accountCode: generalLedgerService.ACCOUNT_CODES.CASH,
              side: "credit",
              amount: normalizedAdditionalPrincipal,
              memo: "Cash disbursed under refinance top-up",
            },
          ],
        });

        const refinanceDisbursementAt = nowIso();
        await appendDisbursementTrancheTx({
          tx,
          loanId,
          amount: normalizedAdditionalPrincipal,
          disbursedAt: refinanceDisbursementAt,
          disbursedByUserId: Number(executedByUserId || 0) || null,
          note: note || "Refinance top-up disbursement",
          isFinal: true,
        });
      }

      await postReceivableInterestAdjustmentTx(tx, {
        referenceType: "loan_refinance_interest_adjustment",
        referenceId: Number(refinanceTx.id || 0),
        loanId,
        clientId: loanForRefinance.client_id,
        branchId: loanForRefinance.branch_id,
        amount: interestAdjustment,
        interestAccountCode,
        description: "Refinance interest adjustment posted",
        note: note || null,
        postedByUserId: executedByUserId || null,
      });

      const contractualInterest = moneyToNumber(new Decimal(nextExpectedTotal).minus(basePrincipal));
      await upsertInterestProfileTx(tx, {
        loanId,
        accrualMethod,
        accrualBasis: "flat",
        accrualStartAt: nowIso(),
        maturityAt: addWeeksIso(nowIso(), newTermWeeks),
        totalContractualInterest: contractualInterest,
        accruedInterest: accrualMethod === "daily_eod" ? 0 : contractualInterest,
      });

      await regeneratePendingInstallmentsTx(tx, {
        loanId,
        expectedTotal: nextExpectedTotal,
        termWeeks: newTermWeeks,
        scheduleStartDateIso: nowIso(),
        repaidTotal: 0,
        penaltyConfig: productConfig,
      });

      const updatedLoan = await tx.loans.findUnique({ where: { id: loanId } });
      const contractSnapshot = await buildLoanContractSnapshotTx(tx, loanId, {
        previousLoan: loanForRefinance,
        outstandingPrincipal,
        newInterestRate,
        additionalPrincipal: normalizedAdditionalPrincipal,
        transactionId: Number(refinanceTx.id || 0),
      });

      await recordLoanContractVersionTx(tx, {
        loanId,
        eventType: "refinance",
        note: note || null,
        createdByUserId: executedByUserId || null,
        snapshotJson: contractSnapshot,
        principal: Number(updatedLoan?.principal || basePrincipal),
        interestRate: newInterestRate,
        termWeeks: newTermWeeks,
        expectedTotal: Number(updatedLoan?.expected_total || nextExpectedTotal),
        repaidTotal: Number(updatedLoan?.repaid_total || 0),
        balance: Number(updatedLoan?.balance || nextBalance),
      });

      return {
        updatedLoan,
        transaction: await tx.transactions.findUnique({ where: { id: refinanceTx.id } }),
      };
    };

    const refinanceResult = transactionClient
      ? await runRefinanceMutation(transactionClient)
      : await prisma.$transaction(async (tx) => runRefinanceMutation(tx), { maxWait: 10000, timeout: 20000 });

    return refinanceResult;
  }

  async function executeTermExtensionFromApprovedRequest({
    loanId,
    newTermWeeks,
    note,
    executedByUserId,
    requestSnapshot,
    transactionClient,
  }: {
    loanId: number;
    newTermWeeks: number;
    note?: string;
    executedByUserId?: number;
    requestSnapshot?: Record<string, any> | null;
    transactionClient?: PrismaTransactionClient;
  }) {
    const snapshotClient = transactionClient || prisma;
    const loan = await snapshotClient.loans.findUnique({
      where: { id: loanId },
      select: {
        id: true,
        client_id: true,
        branch_id: true,
        product_id: true,
        status: true,
        principal: true,
        interest_rate: true,
        term_weeks: true,
        expected_total: true,
        repaid_total: true,
        balance: true,
      },
    });
    if (!loan) {
      throw new LoanNotFoundError();
    }

    assertLoanSnapshotMatchesCurrent(
      {
        status: String(loan.status || ""),
        balance: Number(loan.balance || 0),
        expected_total: Number(loan.expected_total || 0),
        repaid_total: Number(loan.repaid_total || 0),
        term_weeks: Number(loan.term_weeks || 0),
        interest_rate: Number(loan.interest_rate || 0),
      },
      requestSnapshot || null,
    );

    const runTermExtensionMutation = async (tx: PrismaTransactionClient) => {
      const loanForExtension = await tx.loans.findUnique({
        where: { id: loanId },
        select: {
          id: true,
          client_id: true,
          branch_id: true,
          product_id: true,
          status: true,
          principal: true,
          interest_rate: true,
          term_weeks: true,
          expected_total: true,
          repaid_total: true,
          balance: true,
        },
      });
      if (!loanForExtension) {
        throw new LoanNotFoundError();
      }

      if (["closed", "written_off", "pending_approval", "approved", "rejected"].includes(String(loanForExtension.status || ""))) {
        throw new LoanStateConflictError("Cannot extend term for a non-active loan", {
          currentStatus: loanForExtension.status,
          action: "term_extension",
        });
      }

      const outstandingBalance = Number(loanForExtension.balance || 0);
      const outstandingPrincipal = estimateOutstandingPrincipalForRepricing({
        principal: Number(loanForExtension.principal || 0),
        expectedTotal: Number(loanForExtension.expected_total || 0),
        balance: outstandingBalance,
      });
      if (outstandingPrincipal <= 0) {
        throw new LoanStateConflictError("Cannot extend term for a loan with no outstanding principal", {
          currentStatus: loanForExtension.status,
          action: "term_extension",
        });
      }

      const nextExpectedTotal = moneyToNumber(calculateExpectedTotal(outstandingPrincipal, Number(loanForExtension.interest_rate || 0), newTermWeeks));
      const nextBalance = nextExpectedTotal;
      const interestAdjustment = moneyToNumber(new Decimal(nextExpectedTotal).minus(outstandingBalance));
      const nextTermMonths = Math.max(1, Math.ceil(newTermWeeks / 4));
      const productConfig = await getLoanProductConfigTx(tx, Number(loanForExtension.product_id || 0));
      const accrualMethod = normalizeInterestAccrualMethod(productConfig.interest_accrual_method);
      const interestAccountCode = accrualMethod === "daily_eod"
        ? generalLedgerService.ACCOUNT_CODES.UNEARNED_INTEREST
        : generalLedgerService.ACCOUNT_CODES.INTEREST_INCOME;

      const updateLoanResult = await tx.loans.updateMany({
        where: {
          id: loanId,
          status: String(loanForExtension.status || ""),
          balance: Number(loanForExtension.balance || 0),
          expected_total: Number(loanForExtension.expected_total || 0),
        },
        data: {
          status: "restructured",
          principal: outstandingPrincipal,
          term_weeks: newTermWeeks,
          term_months: nextTermMonths,
          expected_total: nextExpectedTotal,
          repaid_total: 0,
          balance: nextBalance,
        },
      });
      if (Number(updateLoanResult.count || 0) !== 1) {
        throw new LoanStateConflictError("Loan state changed during term extension. Retry operation.", {
          currentStatus: loanForExtension.status,
          action: "term_extension",
        });
      }

      const extensionTx = await tx.transactions.create({
        data: {
          loan_id: loanId,
          client_id: loanForExtension.client_id,
          branch_id: loanForExtension.branch_id,
          tx_type: "term_extension",
          amount: nextExpectedTotal,
          note: note || `Loan term extended to ${newTermWeeks} weeks`,
          occurred_at: nowIso(),
        },
      });

      await postReceivableInterestAdjustmentTx(tx, {
        referenceType: "loan_term_extension_interest_adjustment",
        referenceId: Number(extensionTx.id || 0),
        loanId,
        clientId: loanForExtension.client_id,
        branchId: loanForExtension.branch_id,
        amount: interestAdjustment,
        interestAccountCode,
        description: "Term extension interest adjustment posted",
        note: note || null,
        postedByUserId: executedByUserId || null,
      });

      const contractualInterest = moneyToNumber(new Decimal(nextExpectedTotal).minus(outstandingPrincipal));
      await upsertInterestProfileTx(tx, {
        loanId,
        accrualMethod,
        accrualBasis: "flat",
        accrualStartAt: nowIso(),
        maturityAt: addWeeksIso(nowIso(), newTermWeeks),
        totalContractualInterest: contractualInterest,
        accruedInterest: accrualMethod === "daily_eod" ? 0 : contractualInterest,
      });

      await regeneratePendingInstallmentsTx(tx, {
        loanId,
        expectedTotal: nextExpectedTotal,
        termWeeks: newTermWeeks,
        scheduleStartDateIso: nowIso(),
        repaidTotal: 0,
        penaltyConfig: productConfig,
      });

      const updatedLoan = await tx.loans.findUnique({ where: { id: loanId } });
      const contractSnapshot = await buildLoanContractSnapshotTx(tx, loanId, {
        previousLoan: loanForExtension,
        newTermWeeks,
        repricingPrincipal: outstandingPrincipal,
        transactionId: Number(extensionTx.id || 0),
      });

      await recordLoanContractVersionTx(tx, {
        loanId,
        eventType: "term_extension",
        note: note || null,
        createdByUserId: executedByUserId || null,
        snapshotJson: contractSnapshot,
        principal: Number(updatedLoan?.principal || outstandingPrincipal),
        interestRate: Number(loanForExtension.interest_rate || 0),
        termWeeks: newTermWeeks,
        expectedTotal: Number(updatedLoan?.expected_total || nextExpectedTotal),
        repaidTotal: Number(updatedLoan?.repaid_total || 0),
        balance: Number(updatedLoan?.balance || nextBalance),
      });

      return {
        updatedLoan,
        transaction: await tx.transactions.findUnique({ where: { id: extensionTx.id } }),
      };
    };

    const termExtensionResult = transactionClient
      ? await runTermExtensionMutation(transactionClient)
      : await prisma.$transaction(async (tx) => runTermExtensionMutation(tx), { maxWait: 10000, timeout: 20000 });

    return termExtensionResult;
  }

  async function writeOffLoan({
    loanId,
    payload,
    user,
    ipAddress,
  }: {
    loanId: number;
    payload: { note?: string };
    user: { sub: number; role?: string };
    ipAddress: string | null | undefined;
  }) {
    const scope = await hierarchyService.resolveHierarchyScope(user);
    const loan = await prisma.loans.findUnique({
      where: { id: loanId },
      select: {
        id: true,
        client_id: true,
        branch_id: true,
        status: true,
        balance: true,
        repaid_total: true,
        expected_total: true,
        term_weeks: true,
        interest_rate: true,
      },
    });
    if (!loan) {
      throw new LoanNotFoundError();
    }
    if (!hierarchyService.isBranchInScope(scope, loan.branch_id)) {
      throw new ForbiddenScopeError();
    }

    if (loan.status === "written_off") {
      return { message: "Loan is already written off", loan };
    }
    if (loan.status === "closed") {
      throw new LoanStateConflictError("Cannot write off a closed loan", { currentStatus: loan.status, action: "write_off" });
    }
    if (loan.status === "pending_approval" || loan.status === "approved" || loan.status === "rejected") {
      throw new LoanStateConflictError("Cannot write off a loan that has not been disbursed", { currentStatus: loan.status, action: "write_off" });
    }
    if (Number(loan.balance || 0) <= 0) {
      throw new LoanStateConflictError("Cannot write off a loan with zero outstanding balance", { currentStatus: loan.status, action: "write_off" });
    }

    const requestId = await approvalWorkflowService.createPendingRequest({
      requestType: "loan_write_off",
      targetType: "loan",
      targetId: loanId,
      loanId,
      branchId: loan.branch_id,
      requestedByUserId: user.sub,
      requestPayload: {
        loanId,
        note: payload.note || null,
        snapshot: {
          status: String(loan.status || ""),
          balance: Number(loan.balance || 0),
          expectedTotal: Number(loan.expected_total || 0),
          repaidTotal: Number(loan.repaid_total || 0),
          termWeeks: Number(loan.term_weeks || 0),
          interestRate: Number(loan.interest_rate || 0),
        },
      },
      requestNote: payload.note || null,
    });

    const approvalRequest = await approvalWorkflowService.getApprovalRequestById(requestId);

    await writeAuditLog({
      userId: user.sub,
      action: "loan.write_off.requested",
      targetType: "loan",
      targetId: loanId,
      details: JSON.stringify({
        requestId,
        requestedByRole: normalizeRole(user.role),
        currentStatus: String(loan.status || "").toLowerCase(),
        outstandingBalance: Number(loan.balance || 0),
        note: payload.note || null,
      }),
      ipAddress: ipAddress || null,
    });
    await publishApprovalRequestCreatedEvent({
      requestId,
      requestType: "loan_write_off",
      loanId,
      branchId: loan.branch_id,
      requestedByUserId: user.sub,
      note: payload.note || null,
      approvalRequest,
      source: "loanLifecycleService.writeOffLoan",
    });

    return {
      message: "Loan write-off request submitted for approval",
      approvalRequest,
    };
  }

  async function restructureLoan({
    loanId,
    payload,
    user,
    ipAddress,
  }: {
    loanId: number;
    payload: { newTermWeeks: number; waiveInterest?: boolean; note?: string };
    user: { sub: number; role?: string };
    ipAddress: string | null | undefined;
  }) {
    const scope = await hierarchyService.resolveHierarchyScope(user);
    const loan = await prisma.loans.findUnique({
      where: { id: loanId },
      select: {
        id: true,
        client_id: true,
        branch_id: true,
        status: true,
        principal: true,
        interest_rate: true,
        term_weeks: true,
        expected_total: true,
        repaid_total: true,
        balance: true,
      },
    });
    if (!loan) {
      throw new LoanNotFoundError();
    }
    if (!hierarchyService.isBranchInScope(scope, loan.branch_id)) {
      throw new ForbiddenScopeError();
    }

    if (loan.status === "closed") {
      throw new LoanStateConflictError("Cannot restructure a closed loan", { currentStatus: loan.status, action: "restructure" });
    }
    if (loan.status === "written_off") {
      throw new LoanStateConflictError("Cannot restructure a written-off loan", { currentStatus: loan.status, action: "restructure" });
    }
    if (loan.status === "pending_approval" || loan.status === "approved" || loan.status === "rejected") {
      throw new LoanStateConflictError("Cannot restructure a loan that has not been disbursed", { currentStatus: loan.status, action: "restructure" });
    }

    const outstandingBalance = Number(loan.balance || 0);
    if (outstandingBalance <= 0) {
      throw new LoanStateConflictError("Cannot restructure a loan with zero outstanding balance", { currentStatus: loan.status, action: "restructure" });
    }

    const requestId = await approvalWorkflowService.createPendingRequest({
      requestType: "loan_restructure",
      targetType: "loan",
      targetId: loanId,
      loanId,
      branchId: loan.branch_id,
      requestedByUserId: user.sub,
      requestPayload: {
        loanId,
        newTermWeeks: payload.newTermWeeks,
        waiveInterest: payload.waiveInterest === true,
        note: payload.note || null,
        snapshot: {
          status: String(loan.status || ""),
          balance: Number(loan.balance || 0),
          expectedTotal: Number(loan.expected_total || 0),
          repaidTotal: Number(loan.repaid_total || 0),
          termWeeks: Number(loan.term_weeks || 0),
          interestRate: Number(loan.interest_rate || 0),
        },
      },
      requestNote: payload.note || null,
    });
    const approvalRequest = await approvalWorkflowService.getApprovalRequestById(requestId);

    await writeAuditLog({
      userId: user.sub,
      action: "loan.restructure.requested",
      targetType: "loan",
      targetId: loanId,
      details: JSON.stringify({
        requestId,
        requestedByRole: normalizeRole(user.role),
        currentStatus: String(loan.status || "").toLowerCase(),
        newTermWeeks: payload.newTermWeeks,
        waiveInterest: payload.waiveInterest === true,
        outstandingBalance,
        note: payload.note || null,
      }),
      ipAddress: ipAddress || null,
    });
    await publishApprovalRequestCreatedEvent({
      requestId,
      requestType: "loan_restructure",
      loanId,
      branchId: loan.branch_id,
      requestedByUserId: user.sub,
      note: payload.note || null,
      approvalRequest,
      source: "loanLifecycleService.restructureLoan",
    });

    return {
      message: "Loan restructure request submitted for approval",
      approvalRequest,
    };
  }

  async function topUpLoan({
    loanId,
    payload,
    user,
    ipAddress,
  }: {
    loanId: number;
    payload: { additionalPrincipal: number; newTermWeeks?: number; note?: string };
    user: { sub: number; role?: string };
    ipAddress: string | null | undefined;
  }) {
    const scope = await hierarchyService.resolveHierarchyScope(user);
    const loan = await prisma.loans.findUnique({
      where: { id: loanId },
      select: {
        id: true,
        branch_id: true,
        status: true,
        balance: true,
        expected_total: true,
        repaid_total: true,
        term_weeks: true,
        interest_rate: true,
      },
    });
    if (!loan) {
      throw new LoanNotFoundError();
    }
    if (!hierarchyService.isBranchInScope(scope, loan.branch_id)) {
      throw new ForbiddenScopeError();
    }
    if (["closed", "written_off", "pending_approval", "approved", "rejected"].includes(String(loan.status || ""))) {
      throw new LoanStateConflictError("Cannot top-up a non-active loan", { currentStatus: loan.status, action: "top_up" });
    }

    const requestId = await approvalWorkflowService.createPendingRequest({
      requestType: "loan_top_up",
      targetType: "loan",
      targetId: loanId,
      loanId,
      branchId: loan.branch_id,
      requestedByUserId: user.sub,
      requestPayload: {
        loanId,
        additionalPrincipal: payload.additionalPrincipal,
        newTermWeeks: payload.newTermWeeks || null,
        note: payload.note || null,
        snapshot: {
          status: String(loan.status || ""),
          balance: Number(loan.balance || 0),
          expectedTotal: Number(loan.expected_total || 0),
          repaidTotal: Number(loan.repaid_total || 0),
          termWeeks: Number(loan.term_weeks || 0),
          interestRate: Number(loan.interest_rate || 0),
        },
      },
      requestNote: payload.note || null,
    });
    const approvalRequest = await approvalWorkflowService.getApprovalRequestById(requestId);

    await writeAuditLog({
      userId: user.sub,
      action: "loan.top_up.requested",
      targetType: "loan",
      targetId: loanId,
      details: JSON.stringify({
        requestId,
        requestedByRole: normalizeRole(user.role),
        additionalPrincipal: payload.additionalPrincipal,
        newTermWeeks: payload.newTermWeeks || null,
        note: payload.note || null,
      }),
      ipAddress: ipAddress || null,
    });
    await publishApprovalRequestCreatedEvent({
      requestId,
      requestType: "loan_top_up",
      loanId,
      branchId: loan.branch_id,
      requestedByUserId: user.sub,
      note: payload.note || null,
      approvalRequest,
      source: "loanLifecycleService.topUpLoan",
    });

    return {
      message: "Loan top-up request submitted for approval",
      approvalRequest,
    };
  }

  async function refinanceLoan({
    loanId,
    payload,
    user,
    ipAddress,
  }: {
    loanId: number;
    payload: { newInterestRate: number; newTermWeeks: number; additionalPrincipal?: number; note?: string };
    user: { sub: number; role?: string };
    ipAddress: string | null | undefined;
  }) {
    const scope = await hierarchyService.resolveHierarchyScope(user);
    const loan = await prisma.loans.findUnique({
      where: { id: loanId },
      select: {
        id: true,
        branch_id: true,
        status: true,
        balance: true,
        expected_total: true,
        repaid_total: true,
        term_weeks: true,
        interest_rate: true,
      },
    });
    if (!loan) {
      throw new LoanNotFoundError();
    }
    if (!hierarchyService.isBranchInScope(scope, loan.branch_id)) {
      throw new ForbiddenScopeError();
    }
    if (["closed", "written_off", "pending_approval", "approved", "rejected"].includes(String(loan.status || ""))) {
      throw new LoanStateConflictError("Cannot refinance a non-active loan", { currentStatus: loan.status, action: "refinance" });
    }

    const requestId = await approvalWorkflowService.createPendingRequest({
      requestType: "loan_refinance",
      targetType: "loan",
      targetId: loanId,
      loanId,
      branchId: loan.branch_id,
      requestedByUserId: user.sub,
      requestPayload: {
        loanId,
        newInterestRate: payload.newInterestRate,
        newTermWeeks: payload.newTermWeeks,
        additionalPrincipal: payload.additionalPrincipal || 0,
        note: payload.note || null,
        snapshot: {
          status: String(loan.status || ""),
          balance: Number(loan.balance || 0),
          expectedTotal: Number(loan.expected_total || 0),
          repaidTotal: Number(loan.repaid_total || 0),
          termWeeks: Number(loan.term_weeks || 0),
          interestRate: Number(loan.interest_rate || 0),
        },
      },
      requestNote: payload.note || null,
    });
    const approvalRequest = await approvalWorkflowService.getApprovalRequestById(requestId);

    await writeAuditLog({
      userId: user.sub,
      action: "loan.refinance.requested",
      targetType: "loan",
      targetId: loanId,
      details: JSON.stringify({
        requestId,
        requestedByRole: normalizeRole(user.role),
        newInterestRate: payload.newInterestRate,
        newTermWeeks: payload.newTermWeeks,
        additionalPrincipal: payload.additionalPrincipal || 0,
        note: payload.note || null,
      }),
      ipAddress: ipAddress || null,
    });
    await publishApprovalRequestCreatedEvent({
      requestId,
      requestType: "loan_refinance",
      loanId,
      branchId: loan.branch_id,
      requestedByUserId: user.sub,
      note: payload.note || null,
      approvalRequest,
      source: "loanLifecycleService.refinanceLoan",
    });

    return {
      message: "Loan refinance request submitted for approval",
      approvalRequest,
    };
  }

  async function extendLoanTerm({
    loanId,
    payload,
    user,
    ipAddress,
  }: {
    loanId: number;
    payload: { newTermWeeks: number; note?: string };
    user: { sub: number; role?: string };
    ipAddress: string | null | undefined;
  }) {
    const scope = await hierarchyService.resolveHierarchyScope(user);
    const loan = await prisma.loans.findUnique({
      where: { id: loanId },
      select: {
        id: true,
        branch_id: true,
        status: true,
        balance: true,
        expected_total: true,
        repaid_total: true,
        term_weeks: true,
        interest_rate: true,
      },
    });
    if (!loan) {
      throw new LoanNotFoundError();
    }
    if (!hierarchyService.isBranchInScope(scope, loan.branch_id)) {
      throw new ForbiddenScopeError();
    }
    if (["closed", "written_off", "pending_approval", "approved", "rejected"].includes(String(loan.status || ""))) {
      throw new LoanStateConflictError("Cannot extend term for a non-active loan", { currentStatus: loan.status, action: "term_extension" });
    }

    const requestId = await approvalWorkflowService.createPendingRequest({
      requestType: "loan_term_extension",
      targetType: "loan",
      targetId: loanId,
      loanId,
      branchId: loan.branch_id,
      requestedByUserId: user.sub,
      requestPayload: {
        loanId,
        newTermWeeks: payload.newTermWeeks,
        note: payload.note || null,
        snapshot: {
          status: String(loan.status || ""),
          balance: Number(loan.balance || 0),
          expectedTotal: Number(loan.expected_total || 0),
          repaidTotal: Number(loan.repaid_total || 0),
          termWeeks: Number(loan.term_weeks || 0),
          interestRate: Number(loan.interest_rate || 0),
        },
      },
      requestNote: payload.note || null,
    });
    const approvalRequest = await approvalWorkflowService.getApprovalRequestById(requestId);

    await writeAuditLog({
      userId: user.sub,
      action: "loan.term_extension.requested",
      targetType: "loan",
      targetId: loanId,
      details: JSON.stringify({
        requestId,
        requestedByRole: normalizeRole(user.role),
        newTermWeeks: payload.newTermWeeks,
        note: payload.note || null,
      }),
      ipAddress: ipAddress || null,
    });
    await publishApprovalRequestCreatedEvent({
      requestId,
      requestType: "loan_term_extension",
      loanId,
      branchId: loan.branch_id,
      requestedByUserId: user.sub,
      note: payload.note || null,
      approvalRequest,
      source: "loanLifecycleService.extendLoanTerm",
    });

    return {
      message: "Loan term extension request submitted for approval",
      approvalRequest,
    };
  }

  async function reviewHighRiskApprovalRequest({
    requestId,
    payload,
    user,
    ipAddress,
  }: {
    requestId: number;
    payload: { decision: "approve" | "reject"; note?: string };
    user: { sub: number; role?: string };
    ipAddress: string | null | undefined;
  }) {
    const parsedRequestId = Number(requestId || 0);
    if (!parsedRequestId) {
      throw new DomainValidationError("Invalid approval request id");
    }

    const decision = String(payload?.decision || "").trim().toLowerCase();
    if (decision !== "approve" && decision !== "reject") {
      throw new DomainValidationError("decision must be either approve or reject");
    }

    const request = await approvalWorkflowService.getApprovalRequestById(parsedRequestId);
    if (!request) {
      throw new DomainValidationError("Approval request not found");
    }
    if (String(request.status || "") !== "pending") {
      throw new DomainConflictError("Approval request is not pending");
    }

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

      await writeAuditLog({
        userId: user.sub,
        action: "approval_request.rejected",
        targetType: "approval_request",
        targetId: parsedRequestId,
        details: JSON.stringify({
          requestType: request.request_type,
          loanId: Number(request.loan_id || 0),
          note: payload.note || null,
        }),
        ipAddress: ipAddress || null,
      });

      return {
        message: "Approval request rejected",
        approvalRequest: await approvalWorkflowService.getApprovalRequestById(parsedRequestId),
      };
    }

    const requestPayload = parseApprovalRequestPayload(request.request_payload);
    const executionResult = await prisma.$transaction(async (tx) => {
      await finalizeApprovedRequestTx({
        tx,
        requestId: parsedRequestId,
        checkerUserId: user.sub,
        checkerRole: String(user.role || ""),
        reviewNote: payload.note || null,
      });

      let txExecutionResult: Record<string, any> = {};
      if (String(request.request_type || "") === "loan_write_off") {
        txExecutionResult = await executeWriteOffLoanFromApprovedRequest({
          loanId: Number(request.loan_id || 0),
          note: String(requestPayload.note || payload.note || "").trim() || undefined,
          checkerUserId: user.sub,
          requestSnapshot: requestPayload.snapshot || null,
          transactionClient: tx,
        });
      } else if (String(request.request_type || "") === "loan_restructure") {
        const requestedNewTermWeeks = Number(requestPayload.newTermWeeks || 0);
        if (!Number.isInteger(requestedNewTermWeeks) || requestedNewTermWeeks <= 0) {
          throw new DomainValidationError("Invalid restructure payload in approval request");
        }

        txExecutionResult = await executeRestructureLoanFromApprovedRequest({
          loanId: Number(request.loan_id || 0),
          newTermWeeks: requestedNewTermWeeks,
          waiveInterest: Boolean(requestPayload.waiveInterest),
          note: String(requestPayload.note || payload.note || "").trim() || undefined,
          executedByUserId: user.sub,
          requestSnapshot: requestPayload.snapshot || null,
          transactionClient: tx,
        });
      } else if (String(request.request_type || "") === "loan_top_up") {
        const requestedAdditionalPrincipal = Number(requestPayload.additionalPrincipal || 0);
        if (!Number.isFinite(requestedAdditionalPrincipal) || requestedAdditionalPrincipal <= 0) {
          throw new DomainValidationError("Invalid top-up payload in approval request");
        }

        const requestedNewTermWeeks = Number(requestPayload.newTermWeeks || 0);
        txExecutionResult = await executeTopUpLoanFromApprovedRequest({
          loanId: Number(request.loan_id || 0),
          additionalPrincipal: requestedAdditionalPrincipal,
          newTermWeeks: Number.isInteger(requestedNewTermWeeks) && requestedNewTermWeeks > 0 ? requestedNewTermWeeks : undefined,
          note: String(requestPayload.note || payload.note || "").trim() || undefined,
          executedByUserId: user.sub,
          requestSnapshot: requestPayload.snapshot || null,
          transactionClient: tx,
        });
      } else if (String(request.request_type || "") === "loan_refinance") {
        const requestedNewTermWeeks = Number(requestPayload.newTermWeeks || 0);
        const requestedNewInterestRate = Number(requestPayload.newInterestRate);
        if (!Number.isInteger(requestedNewTermWeeks) || requestedNewTermWeeks <= 0) {
          throw new DomainValidationError("Invalid refinance payload term in approval request");
        }
        if (!Number.isFinite(requestedNewInterestRate) || requestedNewInterestRate < 0) {
          throw new DomainValidationError("Invalid refinance payload interest rate in approval request");
        }

        txExecutionResult = await executeRefinanceLoanFromApprovedRequest({
          loanId: Number(request.loan_id || 0),
          newTermWeeks: requestedNewTermWeeks,
          newInterestRate: requestedNewInterestRate,
          additionalPrincipal: Number(requestPayload.additionalPrincipal || 0),
          note: String(requestPayload.note || payload.note || "").trim() || undefined,
          executedByUserId: user.sub,
          requestSnapshot: requestPayload.snapshot || null,
          transactionClient: tx,
        });
      } else if (String(request.request_type || "") === "loan_term_extension") {
        const requestedNewTermWeeks = Number(requestPayload.newTermWeeks || 0);
        if (!Number.isInteger(requestedNewTermWeeks) || requestedNewTermWeeks <= 0) {
          throw new DomainValidationError("Invalid term extension payload in approval request");
        }

        txExecutionResult = await executeTermExtensionFromApprovedRequest({
          loanId: Number(request.loan_id || 0),
          newTermWeeks: requestedNewTermWeeks,
          note: String(requestPayload.note || payload.note || "").trim() || undefined,
          executedByUserId: user.sub,
          requestSnapshot: requestPayload.snapshot || null,
          transactionClient: tx,
        });
      } else {
        throw new DomainValidationError("Unsupported approval request type");
      }

      await markApprovedRequestExecutedTx(tx, parsedRequestId);

      return txExecutionResult;
    }, { maxWait: 10000, timeout: 20000 });

    await writeAuditLog({
      userId: user.sub,
      action: "approval_request.approved",
      targetType: "approval_request",
      targetId: parsedRequestId,
      details: JSON.stringify({
        requestType: request.request_type,
        loanId: Number(request.loan_id || 0),
        note: payload.note || null,
      }),
      ipAddress: ipAddress || null,
    });
    await invalidateReportCaches();

    return {
      message: "Approval request approved and executed",
      approvalRequest: await approvalWorkflowService.getApprovalRequestById(parsedRequestId),
      loan: executionResult.updatedLoan || null,
      execution: executionResult,
    };
  }

  async function approveLoan({
    loanId,
    payload,
    user,
    ipAddress,
  }: {
    loanId: number;
    payload: { notes?: string };
    user: { sub: number; role?: string };
    ipAddress: string | null | undefined;
  }) {
    const scope = await hierarchyService.resolveHierarchyScope(user);
    const loan = await prisma.loans.findUnique({ where: { id: loanId } });
    if (!loan) {
      throw new LoanNotFoundError();
    }
    if (!hierarchyService.isBranchInScope(scope, loan.branch_id)) {
      throw new ForbiddenScopeError();
    }
    if (loan.status !== "pending_approval") {
      throw new InvalidLoanStatusError("Loan is not pending approval", { currentStatus: loan.status, action: "approve" });
    }

    if (loan.created_by_user_id === user.sub && user.role !== "admin") {
      throw new ForbiddenActionError("Maker-Checker violation: You cannot approve a loan you created");
    }

    if (requireVerifiedClientKycForLoanApproval) {
      const client = await prisma.clients.findUnique({
        where: { id: Number(loan.client_id || 0) },
        select: { id: true, kyc_status: true },
      });
      if (!client) {
        throw new ClientNotFoundError();
      }
      const kycStatus = String(client.kyc_status || "pending").toLowerCase();
      if (kycStatus !== "verified") {
        throw new LoanStateConflictError("Cannot approve loan: client KYC status is not verified", { kycStatus, action: "approve" });
      }
    }

    const workflow = await getLoanWorkflowSnapshot({ get, loanId });
    if (!workflow) {
      throw new LoanNotFoundError();
    }
    if (workflow.approval_blockers.length > 0) {
      throw new LoanStateConflictError("Cannot approve loan: application is not ready for approval", {
        blockers: workflow.approval_blockers,
        action: "approve",
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
    return updatedLoan;
  }

  async function disburseLoan({
    loanId,
    payload,
    user,
    ipAddress,
  }: {
    loanId: number;
    payload: { notes?: string; amount?: number; finalDisbursement?: boolean };
    user: { sub: number };
    ipAddress: string | null | undefined;
  }) {
    const scope = await hierarchyService.resolveHierarchyScope(user);
    const loan = await prisma.loans.findUnique({ where: { id: loanId } });
    if (!loan) {
      throw new LoanNotFoundError();
    }
    if (!hierarchyService.isBranchInScope(scope, loan.branch_id)) {
      throw new ForbiddenScopeError();
    }
    if (loan.status === "active") {
      return { message: "Loan is already disbursed", loan };
    }
    if (loan.status !== "approved") {
      throw new LoanStateConflictError("Loan must be approved before disbursement", { currentStatus: loan.status, action: "disburse" });
    }

    const disbursementSummary = await prisma.$transaction(async (tx) => {
      const loanForDisbursement = await tx.loans.findUnique({ where: { id: loanId } });
      if (!loanForDisbursement) {
        throw new LoanNotFoundError();
      }
      if (loanForDisbursement.status !== "approved") {
        throw new LoanStateConflictError("Loan must be approved before disbursement", {
          currentStatus: loanForDisbursement.status,
          action: "disburse",
        });
      }

      const termWeeks = Number(loanForDisbursement.term_weeks || 0);
      if (!Number.isInteger(termWeeks) || termWeeks <= 0) {
        throw new LoanStateConflictError("Loan term is invalid for disbursement schedule generation", {
          currentStatus: loanForDisbursement.status,
          action: "disburse",
        });
      }

      const alreadySeededInstallments = await tx.loan_installments.count({
        where: { loan_id: loanId },
      });
      if (Number(alreadySeededInstallments || 0) > 0) {
        throw new LoanStateConflictError("Loan schedule already exists. Disbursement cannot be repeated", {
          currentStatus: loanForDisbursement.status,
          action: "disburse",
        });
      }
      const now = nowIso();
      const disbursedSoFar = await sumDisbursedPrincipalTx(tx, loanId);
      const approvedPrincipal = moneyToNumber(loanForDisbursement.principal || 0);
      const remainingPrincipal = moneyToNumber(new Decimal(approvedPrincipal).minus(disbursedSoFar));
      if (remainingPrincipal <= 0) {
        throw new LoanStateConflictError("Loan principal is already fully disbursed", {
          currentStatus: loanForDisbursement.status,
          action: "disburse",
        });
      }

      const disbursementRequest = resolveDisbursementRequest({
        approvedPrincipal,
        disbursedSoFar,
        requestedAmountInput: payload.amount,
        finalDisbursement: payload.finalDisbursement,
      });
      const requestedAmount = disbursementRequest.requestedAmount;
      const isFinalDisbursement = disbursementRequest.isFinalDisbursement;
      const nextTrancheNumber = await appendDisbursementTrancheTx({
        tx,
        loanId,
        amount: requestedAmount,
        disbursedAt: now,
        disbursedByUserId: user.sub,
        note: payload.notes || null,
        isFinal: isFinalDisbursement,
      });

      const disbursementTx = await tx.transactions.create({
        data: {
          loan_id: loanId,
          client_id: loanForDisbursement.client_id,
          branch_id: loanForDisbursement.branch_id,
          tx_type: isFinalDisbursement ? "disbursement" : "disbursement_tranche",
          amount: requestedAmount,
          note: payload.notes || (isFinalDisbursement ? "Loan disbursed" : "Loan tranche disbursed"),
          occurred_at: now,
        },
      });

      await generalLedgerService.postJournal({
        tx,
        referenceType: isFinalDisbursement ? "loan_disbursement" : "loan_disbursement_tranche",
        referenceId: Number(disbursementTx.id || 0),
        loanId: loanForDisbursement.id,
        clientId: loanForDisbursement.client_id,
        branchId: loanForDisbursement.branch_id,
        description: isFinalDisbursement ? "Final loan principal disbursement posted" : "Loan tranche principal disbursement posted",
        note: payload.notes || null,
        postedByUserId: user.sub,
        lines: [
          {
            accountCode: generalLedgerService.ACCOUNT_CODES.LOAN_RECEIVABLE,
            side: "debit",
            amount: requestedAmount,
            memo: "Recognize disbursed principal receivable",
          },
          {
            accountCode: generalLedgerService.ACCOUNT_CODES.CASH,
            side: "credit",
            amount: requestedAmount,
            memo: "Cash disbursed to borrower",
          },
        ],
      });

      if (!isFinalDisbursement) {
        const updatedLoan = await tx.loans.findUnique({ where: { id: loanId } });
        const contractSnapshot = await buildLoanContractSnapshotTx(tx, loanId, {
          previousLoan: loanForDisbursement,
          tranche: {
            trancheNumber: nextTrancheNumber,
            amount: requestedAmount,
            finalDisbursement: false,
          },
          transactionId: Number(disbursementTx.id || 0),
        });

        await recordLoanContractVersionTx(tx, {
          loanId,
          eventType: "disbursement_tranche",
          note: payload.notes || "Loan tranche disbursed",
          createdByUserId: user.sub,
          snapshotJson: contractSnapshot,
          principal: Number(updatedLoan?.principal || loanForDisbursement.principal || 0),
          interestRate: Number(updatedLoan?.interest_rate || loanForDisbursement.interest_rate || 0),
          termWeeks: Number(updatedLoan?.term_weeks || loanForDisbursement.term_weeks || 0),
          expectedTotal: Number(updatedLoan?.expected_total || loanForDisbursement.expected_total || 0),
          repaidTotal: Number(updatedLoan?.repaid_total || loanForDisbursement.repaid_total || 0),
          balance: Number(updatedLoan?.balance || loanForDisbursement.balance || 0),
        });

        const remainingAfterTranche = moneyToNumber(new Decimal(remainingPrincipal).minus(requestedAmount));

        await publishDomainEvent({
          eventType: "loan.tranche_disbursed",
          aggregateType: "loan",
          aggregateId: loanId,
          payload: {
            loanId,
            disbursedByUserId: user.sub,
            notes: payload.notes || null,
            trancheNumber: nextTrancheNumber,
            trancheAmount: requestedAmount,
            remainingPrincipal: remainingAfterTranche,
            finalDisbursement: false,
            loanStatus: updatedLoan?.status || null,
            branchId: Number(updatedLoan?.branch_id || 0) || null,
            clientId: Number(updatedLoan?.client_id || 0) || null,
            disbursedAt: updatedLoan?.disbursed_at || now,
          },
          metadata: {
            source: "loanLifecycleService.disburseLoan",
          },
        }, tx);

        return {
          isFinalDisbursement: false,
          trancheNumber: nextTrancheNumber,
          disbursedAmount: requestedAmount,
          remainingPrincipal: remainingAfterTranche,
          updatedLoan,
        };
      }

      const disbursementUpdate = await tx.loans.updateMany({
        where: {
          id: loanId,
          status: "approved",
        },
        data: {
          status: "active",
          disbursed_at: now,
          disbursed_by_user_id: user.sub,
          disbursement_note: payload.notes || "Loan disbursed",
        },
      });
      if (Number(disbursementUpdate.count || 0) !== 1) {
        throw new LoanStateConflictError("Loan status changed during disbursement. Retry operation.", {
          currentStatus: loanForDisbursement.status,
          action: "disburse",
        });
      }

      const registrationFee = moneyToNumber(loanForDisbursement.registration_fee || 0);
      const processingFee = moneyToNumber(loanForDisbursement.processing_fee || 0);
      const interestAmount = moneyToNumber(
        new Decimal(loanForDisbursement.expected_total || 0)
          .minus(loanForDisbursement.principal || 0),
      );
      const feeIncome = moneyToNumber(new Decimal(registrationFee).plus(processingFee));

      if (registrationFee > 0) {
        await tx.transactions.create({
          data: {
            loan_id: loanId,
            client_id: loanForDisbursement.client_id,
            branch_id: loanForDisbursement.branch_id,
            tx_type: "registration_fee",
            amount: registrationFee,
            note: "One-time client registration fee",
            occurred_at: nowIso(),
          },
        });
      }

      if (processingFee > 0) {
        await tx.transactions.create({
          data: {
            loan_id: loanId,
            client_id: loanForDisbursement.client_id,
            branch_id: loanForDisbursement.branch_id,
            tx_type: "processing_fee",
            amount: processingFee,
            note: "Recurring loan processing fee",
            occurred_at: nowIso(),
          },
        });
      }

      const productConfig = await getLoanProductConfigTx(tx, Number(loanForDisbursement.product_id || 0));
      const accrualMethod = normalizeInterestAccrualMethod(productConfig.interest_accrual_method);
      const interestAccountCode = accrualMethod === "daily_eod"
        ? generalLedgerService.ACCOUNT_CODES.UNEARNED_INTEREST
        : generalLedgerService.ACCOUNT_CODES.INTEREST_INCOME;

      if (interestAmount > 0 || feeIncome > 0) {
        const finalizationLines: JournalLine[] = [
        ];
        if (interestAmount > 0) {
          finalizationLines.push({
            accountCode: generalLedgerService.ACCOUNT_CODES.LOAN_RECEIVABLE,
            side: "debit",
            amount: interestAmount,
            memo: "Recognize contractual interest receivable",
          });
          finalizationLines.push({
            accountCode: interestAccountCode,
            side: "credit",
            amount: interestAmount,
            memo: accrualMethod === "daily_eod"
              ? "Defer contractual interest for EOD accrual recognition"
              : "Recognize contractual interest income",
          });
        }
        if (feeIncome > 0) {
          finalizationLines.push({
            accountCode: generalLedgerService.ACCOUNT_CODES.CASH,
            side: "debit",
            amount: feeIncome,
            memo: "Recognize upfront registration and processing fees collected",
          });
          finalizationLines.push({
            accountCode: generalLedgerService.ACCOUNT_CODES.FEE_INCOME,
            side: "credit",
            amount: feeIncome,
            memo: "Recognize registration and processing fee income paid upfront",
          });
        }

        await generalLedgerService.postJournal({
          tx,
          referenceType: "loan_disbursement_finalize",
          referenceId: loanId,
          loanId: loanForDisbursement.id,
          clientId: loanForDisbursement.client_id,
          branchId: loanForDisbursement.branch_id,
          description: "Final loan disbursement interest and upfront fee recognition posted",
          note: payload.notes || null,
          postedByUserId: user.sub,
          lines: finalizationLines,
        });
      }

      const disbursedAt = new Date().toISOString();
      await regeneratePendingInstallmentsTx(tx, {
        loanId,
        expectedTotal: Number(loanForDisbursement.expected_total || 0),
        termWeeks,
        scheduleStartDateIso: disbursedAt,
        repaidTotal: 0,
        penaltyConfig: productConfig,
      });

      await upsertInterestProfileTx(tx, {
        loanId,
        accrualMethod,
        accrualBasis: "flat",
        accrualStartAt: disbursedAt,
        maturityAt: addWeeksIso(disbursedAt, termWeeks),
        totalContractualInterest: interestAmount,
        accruedInterest: accrualMethod === "daily_eod" ? 0 : interestAmount,
      });

      const updatedLoan = await tx.loans.findUnique({ where: { id: loanId } });
      const contractSnapshot = await buildLoanContractSnapshotTx(tx, loanId, {
        previousLoan: loanForDisbursement,
        disbursement: {
          trancheNumber: nextTrancheNumber,
          amount: requestedAmount,
          finalDisbursement: true,
          totalDisbursedPrincipal: approvedPrincipal,
          interestAccrualMethod: accrualMethod,
        },
        transactionId: Number(disbursementTx.id || 0),
      });

      await recordLoanContractVersionTx(tx, {
        loanId,
        eventType: "disbursement",
        note: payload.notes || null,
        createdByUserId: user.sub,
        snapshotJson: contractSnapshot,
        principal: Number(updatedLoan?.principal || loanForDisbursement.principal || 0),
        interestRate: Number(updatedLoan?.interest_rate || loanForDisbursement.interest_rate || 0),
        termWeeks: Number(updatedLoan?.term_weeks || termWeeks),
        expectedTotal: Number(updatedLoan?.expected_total || loanForDisbursement.expected_total || 0),
        repaidTotal: Number(updatedLoan?.repaid_total || loanForDisbursement.repaid_total || 0),
        balance: Number(updatedLoan?.balance || loanForDisbursement.balance || 0),
      });

      await publishDomainEvent({
        eventType: "loan.disbursed",
        aggregateType: "loan",
        aggregateId: loanId,
        payload: {
          loanId,
          disbursedByUserId: user.sub,
          notes: payload.notes || null,
          trancheNumber: nextTrancheNumber,
          trancheAmount: requestedAmount,
          remainingPrincipal: 0,
          finalDisbursement: true,
          loanStatus: updatedLoan?.status || null,
          branchId: Number(updatedLoan?.branch_id || 0) || null,
          clientId: Number(updatedLoan?.client_id || 0) || null,
          disbursedAt: updatedLoan?.disbursed_at || disbursedAt,
        },
        metadata: {
          source: "loanLifecycleService.disburseLoan",
        },
      }, tx);

      return {
        isFinalDisbursement: true,
        trancheNumber: nextTrancheNumber,
        disbursedAmount: requestedAmount,
        remainingPrincipal: 0,
        updatedLoan,
      };
    }, { maxWait: 10000, timeout: 20000 });

    await writeAuditLog({
      userId: user.sub,
      action: "loan.disbursed",
      targetType: "loan",
      targetId: loanId,
      details: JSON.stringify({
        disbursedBy: user.sub,
        notes: payload.notes || null,
        trancheNumber: disbursementSummary.trancheNumber,
        trancheAmount: disbursementSummary.disbursedAmount,
        finalDisbursement: disbursementSummary.isFinalDisbursement,
      }),
      ipAddress: ipAddress || null,
    });

    const updatedLoan = await prisma.loans.findUnique({ where: { id: loanId } });
    await invalidateReportCaches();

    if (!disbursementSummary.isFinalDisbursement) {
      return {
        message: "Loan tranche disbursed",
        loan: updatedLoan,
        disbursement: {
          trancheNumber: disbursementSummary.trancheNumber,
          amount: disbursementSummary.disbursedAmount,
          remainingPrincipal: disbursementSummary.remainingPrincipal,
          finalDisbursement: false,
        },
      };
    }

    return {
      message: "Loan disbursed",
      loan: updatedLoan,
      disbursement: {
        trancheNumber: disbursementSummary.trancheNumber,
        amount: disbursementSummary.disbursedAmount,
        remainingPrincipal: 0,
        finalDisbursement: true,
      },
    };
  }

  async function rejectLoan({
    loanId,
    payload,
    user,
    ipAddress,
  }: {
    loanId: number;
    payload: { reason: string };
    user: { sub: number };
    ipAddress: string | null | undefined;
  }) {
    const scope = await hierarchyService.resolveHierarchyScope(user);
    const loan = await prisma.loans.findUnique({ where: { id: loanId } });
    if (!loan) {
      throw new LoanNotFoundError();
    }
    if (!hierarchyService.isBranchInScope(scope, loan.branch_id)) {
      throw new ForbiddenScopeError();
    }
    if (loan.status !== "pending_approval") {
      throw new InvalidLoanStatusError("Loan is not pending approval", { currentStatus: loan.status, action: "reject" });
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
    return updatedLoan;
  }

  async function getDisbursementTranches({
    loanId,
    user,
  }: {
    loanId: number;
    user: { sub?: number; role?: string };
  }) {
    const scope = await hierarchyService.resolveHierarchyScope(user);
    const loan = await prisma.loans.findUnique({
      where: { id: loanId },
      select: { id: true, branch_id: true, principal: true },
    });
    if (!loan) {
      throw new LoanNotFoundError();
    }
    if (!hierarchyService.isBranchInScope(scope, loan.branch_id)) {
      throw new ForbiddenScopeError();
    }

    const rows = await (all || (async () => []))(
      `
        SELECT
          id,
          tranche_number,
          amount,
          disbursed_at,
          disbursed_by_user_id,
          note,
          is_final,
          created_at
        FROM loan_disbursement_tranches
        WHERE loan_id = ?
        ORDER BY tranche_number ASC, id ASC
      `,
      [loanId],
    );
    const totalDisbursed = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);

    return {
      loanId,
      approvedPrincipal: Number(loan.principal || 0),
      totalDisbursed: moneyToNumber(totalDisbursed),
      remainingPrincipal: moneyToNumber(new Decimal(loan.principal || 0).minus(totalDisbursed)),
      tranches: rows.map((row) => ({
        id: Number(row.id),
        tranche_number: Number(row.tranche_number || 0),
        amount: Number(row.amount || 0),
        disbursed_at: row.disbursed_at,
        disbursed_by_user_id: Number(row.disbursed_by_user_id || 0) || null,
        note: row.note || null,
        is_final: Number(row.is_final || 0) === 1,
        created_at: row.created_at,
      })),
    };
  }

  async function getLoanContractVersions({
    loanId,
    user,
  }: {
    loanId: number;
    user: { sub?: number; role?: string };
  }) {
    const scope = await hierarchyService.resolveHierarchyScope(user);
    const loan = await prisma.loans.findUnique({
      where: { id: loanId },
      select: { id: true, branch_id: true },
    });
    if (!loan) {
      throw new LoanNotFoundError();
    }
    if (!hierarchyService.isBranchInScope(scope, loan.branch_id)) {
      throw new ForbiddenScopeError();
    }

    const rows = await (all || (async () => []))(
      `
        SELECT
          id,
          version_number,
          event_type,
          principal,
          interest_rate,
          term_weeks,
          expected_total,
          repaid_total,
          balance,
          snapshot_json,
          note,
          created_by_user_id,
          created_at
        FROM loan_contract_versions
        WHERE loan_id = ?
        ORDER BY version_number ASC, id ASC
      `,
      [loanId],
    );

    return {
      loanId,
      versions: rows.map((row) => ({
        id: Number(row.id),
        version_number: Number(row.version_number || 0),
        event_type: String(row.event_type || ""),
        principal: Number(row.principal || 0),
        interest_rate: Number(row.interest_rate || 0),
        term_weeks: Number(row.term_weeks || 0),
        expected_total: Number(row.expected_total || 0),
        repaid_total: Number(row.repaid_total || 0),
        balance: Number(row.balance || 0),
        snapshot: (() => {
          const raw = String(row.snapshot_json || "").trim();
          if (!raw) {
            return null;
          }
          try {
            return JSON.parse(raw);
          } catch (_error) {
            return raw;
          }
        })(),
        note: row.note || null,
        created_by_user_id: Number(row.created_by_user_id || 0) || null,
        created_at: row.created_at,
      })),
    };
  }

  return {
    writeOffLoan,
    restructureLoan,
    topUpLoan,
    refinanceLoan,
    extendLoanTerm,
    reviewHighRiskApprovalRequest,
    approveLoan,
    disburseLoan,
    rejectLoan,
    getDisbursementTranches,
    getLoanContractVersions,
  };
}

export {
  createLoanLifecycleService,
};





