/**
 * executeWriteOffLoanFromApprovedRequest
 * executeRestructureLoanFromApprovedRequest
 * executeTopUpLoanFromApprovedRequest
 * executeRefinanceLoanFromApprovedRequest
 * executeTermExtensionFromApprovedRequest
 *
 * These are the transaction-level executors dispatched by reviewHighRisk.ts
 * when a checker approves an approval request. Each one:
 *   1. Validates the current loan state matches the snapshot recorded at
 *      request-creation time (optimistic concurrency guard).
 *   2. Runs all mutations inside a Prisma transaction (passed-in or new).
 *   3. Posts GL entries, regenerates the installment schedule, upserts the
 *      interest profile, and records a contract version.
 *
 * Extracted from loanLifecycleService.ts (lines 704-1853) as part of Gap 1.
 *
 * Event emission (event-driven architecture wiring):
 *   executeWriteOffLoanFromApprovedRequest  → publishes loan.written_off after tx commit
 *   executeRestructureLoanFromApprovedRequest → publishes loan.restructured after tx commit
 *   Both use publishDomainEvent (outbox-backed, at-least-once delivery). The
 *   calls are best-effort: a failure must not roll back the already-committed
 *   financial transaction. The outbox dispatch job will retry any missed event.
 */
import { Decimal } from "decimal.js";
import { prisma } from "../../../db/prismaClient.js";
import type { PrismaTransactionClient } from "../../../db/prismaClient.js";
import {
  DomainValidationError,
  LoanNotFoundError,
  LoanStateConflictError,
} from "../../../domain/errors.js";
import {
  buildLoanContractSnapshotTx,
  recordLoanContractVersionTx,
} from "../../loanContractVersioning.js";
import { appendDisbursementTrancheTx } from "../../loanLifecycleDisbursementSupport.js";
import {
  getScheduleMaturityIso,
  nowIso,
  moneyToNumber,
  estimateOutstandingPrincipalForRepricing,
  normalizeInterestAccrualMethod,
  resolveLoanRepaymentCadence,
} from "../shared/helpers.js";
import {
  assertLoanSnapshotMatchesCurrent,
  getLoanProductConfigTx,
  regeneratePendingInstallmentsTx,
  upsertInterestProfileTx,
  postReceivableInterestAdjustmentTx,
} from "../shared/contextHelpers.js";
import type { LoanLifecycleDeps } from "../shared/types.js";

// Deps subset needed by all execute helpers.
// publishDomainEvent is optional — falls back to a no-op when not wired.
type ExecuteDeps = Pick<
  LoanLifecycleDeps,
  "generalLedgerService" | "calculateExpectedTotal" | "addWeeksIso" | "publishDomainEvent"
>;

// ---------------------------------------------------------------------------
// executeWriteOffLoanFromApprovedRequest
// ---------------------------------------------------------------------------
export async function executeWriteOffLoanFromApprovedRequest(
  deps: ExecuteDeps,
  args: {
    loanId: number;
    note?: string;
    checkerUserId: number;
    requestSnapshot?: Record<string, any> | null;
    transactionClient?: PrismaTransactionClient;
  },
): Promise<Record<string, any>> {
  const { generalLedgerService } = deps;
  const publishDomainEvent = deps.publishDomainEvent ?? (async () => 0);
  const { loanId, note, checkerUserId, requestSnapshot, transactionClient } = args;

  const snapshotClient = transactionClient || prisma;
  const preCheck = await snapshotClient.loans.findUnique({
    where: { id: loanId },
    select: { id: true, status: true, balance: true, expected_total: true, repaid_total: true, term_weeks: true, interest_rate: true },
  });
  if (!preCheck) throw new LoanNotFoundError();
  assertLoanSnapshotMatchesCurrent(
    { status: String(preCheck.status || ""), balance: Number(preCheck.balance || 0), expected_total: Number(preCheck.expected_total || 0), repaid_total: Number(preCheck.repaid_total || 0), term_weeks: Number(preCheck.term_weeks || 0), interest_rate: Number(preCheck.interest_rate || 0) },
    requestSnapshot || null,
  );

  const runMutation = async (tx: PrismaTransactionClient) => {
    const loan = await tx.loans.findUnique({
      where: { id: loanId },
      select: { id: true, client_id: true, branch_id: true, status: true, principal: true, balance: true, repaid_total: true, expected_total: true, term_weeks: true, interest_rate: true },
    });
    if (!loan) throw new LoanNotFoundError();
    assertLoanSnapshotMatchesCurrent(
      { status: String(loan.status || ""), balance: Number(loan.balance || 0), expected_total: Number(loan.expected_total || 0), repaid_total: Number(loan.repaid_total || 0), term_weeks: Number(loan.term_weeks || 0), interest_rate: Number(loan.interest_rate || 0) },
      requestSnapshot || null,
    );

    if (loan.status === "written_off") throw new LoanStateConflictError("Loan has already been written off", { currentStatus: loan.status, action: "write_off" });
    if (loan.status === "closed") throw new LoanStateConflictError("Cannot write off a closed loan", { currentStatus: loan.status, action: "write_off" });
    if (["pending_approval", "approved", "rejected"].includes(String(loan.status || ""))) throw new LoanStateConflictError("Cannot write off a loan that has not been disbursed", { currentStatus: loan.status, action: "write_off" });
    if (Number(loan.balance || 0) <= 0) throw new LoanStateConflictError("Cannot write off a loan with zero outstanding balance", { currentStatus: loan.status, action: "write_off" });

    const writeOffUpdate = await tx.loans.updateMany({
      where: { id: loanId, status: loan.status, balance: Number(loan.balance || 0) },
      data: { status: "written_off" },
    });
    if (Number(writeOffUpdate.count || 0) !== 1) throw new LoanStateConflictError("Loan state changed during write-off. Retry operation.", { currentStatus: loan.status, action: "write_off" });

    await tx.transactions.create({
      data: { loan_id: loan.id, client_id: loan.client_id, branch_id: loan.branch_id, tx_type: "write_off", amount: Number(loan.balance || 0), note: note || "Loan written off", occurred_at: nowIso() },
    });

    const journalId = await generalLedgerService.postJournal({
      tx, referenceType: "loan_write_off", referenceId: loan.id, loanId: loan.id,
      clientId: loan.client_id, branchId: loan.branch_id,
      description: "Loan balance written off", note: note || null, postedByUserId: checkerUserId,
      lines: [
        { accountCode: generalLedgerService.ACCOUNT_CODES.WRITE_OFF_EXPENSE ?? "", side: "debit", amount: Number(loan.balance || 0), memo: "Recognize loan write-off expense" },
        { accountCode: generalLedgerService.ACCOUNT_CODES.LOAN_RECEIVABLE ?? "", side: "credit", amount: Number(loan.balance || 0), memo: "Remove uncollectible receivable" },
      ],
    });

    const updatedLoan = await tx.loans.findUnique({ where: { id: loanId } });
    const contractSnapshot = await buildLoanContractSnapshotTx(tx, loanId, { previousLoan: loan, writeOffAmount: Number(loan.balance || 0), journalId });
    await recordLoanContractVersionTx(tx, { loanId, eventType: "write_off", note: note || "Loan written off", createdByUserId: checkerUserId, snapshotJson: contractSnapshot, principal: Number(updatedLoan?.principal || loan.principal || 0), interestRate: Number(updatedLoan?.interest_rate || loan.interest_rate || 0), termWeeks: Number(updatedLoan?.term_weeks || loan.term_weeks || 0), expectedTotal: Number(updatedLoan?.expected_total || loan.expected_total || 0), repaidTotal: Number(updatedLoan?.repaid_total || loan.repaid_total || 0), balance: Number(updatedLoan?.balance || 0) });

    // Return the pre-write-off snapshot so the post-commit hook can embed it
    return { previousLoan: loan, updatedLoan, journalId };
  };

  const result = transactionClient
    ? await runMutation(transactionClient)
    : await prisma.$transaction(async (tx: PrismaTransactionClient) => runMutation(tx), { maxWait: 10000, timeout: 20000 });

  // ── Post-commit: publish loan.written_off domain event (outbox-backed) ──
  // The Prisma transaction has committed. Publish outside the tx so the outbox
  // row is written in its own atomic operation. Best-effort: a failure here
  // must NOT roll back the write-off — the outbox dispatch job will retry.
  try {
    const prevLoan = result.previousLoan as Record<string, any>;
    await publishDomainEvent({
      eventType:     "loan.written_off",
      aggregateType: "loan",
      aggregateId:   loanId,
      payload: {
        loanId,
        clientId:          Number(prevLoan.client_id ?? 0),
        branchId:          Number(prevLoan.branch_id  ?? 0) || null,
        writtenOffAmount:  Number(prevLoan.balance     ?? 0),
        writtenOffByUserId: checkerUserId,
        writtenOffAt:      nowIso(),
        reason:            note || null,
      },
      occurredAt: nowIso(),
    });
  } catch (_eventError) {
    // Non-fatal: financial mutation is already committed. Outbox retry will deliver.
  }

  return result;
}

// ---------------------------------------------------------------------------
// executeRestructureLoanFromApprovedRequest
// ---------------------------------------------------------------------------
export async function executeRestructureLoanFromApprovedRequest(
  deps: ExecuteDeps,
  args: {
    loanId: number;
    newTermWeeks: number;
    waiveInterest?: boolean;
    note?: string;
    executedByUserId?: number;
    requestSnapshot?: Record<string, any> | null;
    transactionClient?: PrismaTransactionClient;
  },
): Promise<Record<string, any>> {
  const { calculateExpectedTotal, addWeeksIso } = deps;
  const publishDomainEvent = deps.publishDomainEvent ?? (async () => 0);
  const { loanId, newTermWeeks, waiveInterest, note, executedByUserId, requestSnapshot, transactionClient } = args;

  const snapshotClient = transactionClient || prisma;
  const preCheck = await snapshotClient.loans.findUnique({ where: { id: loanId }, select: { id: true, status: true, balance: true, expected_total: true, repaid_total: true, term_weeks: true, interest_rate: true } });
  if (!preCheck) throw new LoanNotFoundError();
  assertLoanSnapshotMatchesCurrent({ status: String(preCheck.status || ""), balance: Number(preCheck.balance || 0), expected_total: Number(preCheck.expected_total || 0), repaid_total: Number(preCheck.repaid_total || 0), term_weeks: Number(preCheck.term_weeks || 0), interest_rate: Number(preCheck.interest_rate || 0) }, requestSnapshot || null);

  const runMutation = async (tx: PrismaTransactionClient) => {
    const loan = await tx.loans.findUnique({ where: { id: loanId }, select: { id: true, client_id: true, branch_id: true, product_id: true, status: true, principal: true, interest_rate: true, term_weeks: true, expected_total: true, repaid_total: true, balance: true } });
    if (!loan) throw new LoanNotFoundError();
    assertLoanSnapshotMatchesCurrent({ status: String(loan.status || ""), balance: Number(loan.balance || 0), expected_total: Number(loan.expected_total || 0), repaid_total: Number(loan.repaid_total || 0), term_weeks: Number(loan.term_weeks || 0), interest_rate: Number(loan.interest_rate || 0) }, requestSnapshot || null);

    if (loan.status === "closed") throw new LoanStateConflictError("Cannot restructure a closed loan", { currentStatus: loan.status, action: "restructure" });
    if (loan.status === "written_off") throw new LoanStateConflictError("Cannot restructure a written-off loan", { currentStatus: loan.status, action: "restructure" });
    if (["pending_approval", "approved", "rejected"].includes(String(loan.status || ""))) throw new LoanStateConflictError("Cannot restructure a loan that has not been disbursed", { currentStatus: loan.status, action: "restructure" });

    const outstandingBalance = Number(loan.balance || 0);
    if (outstandingBalance <= 0) throw new LoanStateConflictError("Cannot restructure a loan with zero outstanding balance", { currentStatus: loan.status, action: "restructure" });

    const repricingPrincipal = estimateOutstandingPrincipalForRepricing({ principal: Number(loan.principal || 0), expectedTotal: Number(loan.expected_total || 0), balance: outstandingBalance });
    if (repricingPrincipal <= 0) throw new LoanStateConflictError("Cannot restructure a loan with no outstanding principal", { currentStatus: loan.status, action: "restructure" });

    const shouldWaiveInterest = waiveInterest === true;
    const nextInterestRate = shouldWaiveInterest ? 0 : Number(loan.interest_rate || 0);
    const newOutstandingTotal = moneyToNumber(calculateExpectedTotal(repricingPrincipal, nextInterestRate, newTermWeeks));
    const nextTermMonths = Math.max(1, Math.ceil(newTermWeeks / 4));
    const scheduleStartDate = new Date().toISOString();
    const productConfig = await getLoanProductConfigTx(tx, Number(loan.product_id || 0));

    await regeneratePendingInstallmentsTx(tx, addWeeksIso, { loanId, expectedTotal: newOutstandingTotal, termWeeks: newTermWeeks, scheduleStartDateIso: scheduleStartDate, repaidTotal: 0, penaltyConfig: productConfig });

    const restructureUpdate = await tx.loans.updateMany({
      where: { id: loanId, status: loan.status, balance: outstandingBalance, expected_total: Number(loan.expected_total || 0), repaid_total: Number(loan.repaid_total || 0) },
      data: { status: "restructured", principal: repricingPrincipal, interest_rate: nextInterestRate, term_months: nextTermMonths, term_weeks: newTermWeeks, expected_total: newOutstandingTotal, repaid_total: 0, balance: newOutstandingTotal },
    });
    if (Number(restructureUpdate.count || 0) !== 1) throw new LoanStateConflictError("Loan state changed during restructure. Retry operation.", { currentStatus: loan.status, action: "restructure" });

    const restructureTx = await tx.transactions.create({ data: { loan_id: loanId, client_id: loan.client_id, branch_id: loan.branch_id, tx_type: "restructure", amount: newOutstandingTotal, note: note || (shouldWaiveInterest ? `Loan restructured to ${newTermWeeks} weeks with waived interest` : `Loan restructured to ${newTermWeeks} weeks`), occurred_at: nowIso() } });

    const contractualInterest = moneyToNumber(new Decimal(newOutstandingTotal).minus(repricingPrincipal));
    const accrualMethod = normalizeInterestAccrualMethod(productConfig.interest_accrual_method);
    await upsertInterestProfileTx(tx, {
      loanId,
      accrualMethod,
      accrualBasis: "flat",
      accrualStartAt: scheduleStartDate,
      maturityAt: getScheduleMaturityIso({
        startIso: scheduleStartDate,
        termWeeks: newTermWeeks,
        cadence: resolveLoanRepaymentCadence(productConfig.interest_accrual_method),
        addWeeksIso,
      }),
      totalContractualInterest: contractualInterest,
      accruedInterest: accrualMethod === "daily_eod" ? 0 : contractualInterest,
    });

    const updatedLoan = await tx.loans.findUnique({ where: { id: loanId } });
    const contractSnapshot = await buildLoanContractSnapshotTx(tx, loanId, { previousLoan: loan, newTermWeeks, waiveInterest: shouldWaiveInterest, repricingPrincipal, transactionId: Number(restructureTx.id || 0) });
    await recordLoanContractVersionTx(tx, { loanId, eventType: "restructure", note: note || null, createdByUserId: executedByUserId || null, snapshotJson: contractSnapshot, principal: Number(updatedLoan?.principal || repricingPrincipal), interestRate: nextInterestRate, termWeeks: newTermWeeks, expectedTotal: Number(updatedLoan?.expected_total || newOutstandingTotal), repaidTotal: Number(updatedLoan?.repaid_total || 0), balance: Number(updatedLoan?.balance || newOutstandingTotal) });

    return { updatedLoan, transaction: await tx.transactions.findUnique({ where: { id: restructureTx.id } }), previousLoan: loan, newOutstandingTotal, nextExpectedTotal: newOutstandingTotal, shouldWaiveInterest, nextInterestRate };
  };

  const result = transactionClient
    ? await runMutation(transactionClient)
    : await prisma.$transaction(async (tx: PrismaTransactionClient) => runMutation(tx), { maxWait: 10000, timeout: 20000 });

  // ── Post-commit: publish loan.restructured domain event (outbox-backed) ──
  try {
    const prevLoan = result.previousLoan as Record<string, any>;
    await publishDomainEvent({
      eventType:     "loan.restructured",
      aggregateType: "loan",
      aggregateId:   loanId,
      payload: {
        loanId,
        clientId:              Number(prevLoan.client_id  ?? 0),
        branchId:              Number(prevLoan.branch_id  ?? 0) || null,
        previousBalance:       Number(prevLoan.balance    ?? 0),
        newPrincipal:          Number(result.newOutstandingTotal ?? 0),
        newTermWeeks,
        restructuredByUserId:  executedByUserId ?? null,
        restructuredAt:        nowIso(),
        reason:                note || null,
      },
      occurredAt: nowIso(),
    });
  } catch (_eventError) {
    // Non-fatal: financial mutation is already committed. Outbox retry will deliver.
  }

  return result;
}

// ---------------------------------------------------------------------------
// executeTopUpLoanFromApprovedRequest
// ---------------------------------------------------------------------------
export async function executeTopUpLoanFromApprovedRequest(
  deps: ExecuteDeps,
  args: {
    loanId: number;
    additionalPrincipal: number;
    newTermWeeks?: number;
    note?: string;
    executedByUserId?: number;
    requestSnapshot?: Record<string, any> | null;
    transactionClient?: PrismaTransactionClient;
  },
): Promise<Record<string, any>> {
  const { generalLedgerService, calculateExpectedTotal, addWeeksIso } = deps;
  const { loanId, additionalPrincipal, newTermWeeks, note, executedByUserId, requestSnapshot, transactionClient } = args;

  const snapshotClient = transactionClient || prisma;
  const preCheck = await snapshotClient.loans.findUnique({ where: { id: loanId }, select: { id: true, status: true, balance: true, expected_total: true, repaid_total: true, term_weeks: true, interest_rate: true } });
  if (!preCheck) throw new LoanNotFoundError();
  assertLoanSnapshotMatchesCurrent({ status: String(preCheck.status || ""), balance: Number(preCheck.balance || 0), expected_total: Number(preCheck.expected_total || 0), repaid_total: Number(preCheck.repaid_total || 0), term_weeks: Number(preCheck.term_weeks || 0), interest_rate: Number(preCheck.interest_rate || 0) }, requestSnapshot || null);

  const runMutation = async (tx: PrismaTransactionClient) => {
    const loan = await tx.loans.findUnique({ where: { id: loanId }, select: { id: true, client_id: true, branch_id: true, product_id: true, status: true, principal: true, interest_rate: true, term_weeks: true, expected_total: true, repaid_total: true, balance: true } });
    if (!loan) throw new LoanNotFoundError();
    if (["closed", "written_off", "pending_approval", "approved", "rejected"].includes(String(loan.status || ""))) throw new LoanStateConflictError("Cannot top-up a non-active loan", { currentStatus: loan.status, action: "top_up" });

    const normalizedAdditional = moneyToNumber(additionalPrincipal || 0);
    if (normalizedAdditional <= 0) throw new DomainValidationError("additionalPrincipal must be greater than zero");

    const targetTermWeeks = Number(newTermWeeks || loan.term_weeks || 0);
    if (!Number.isInteger(targetTermWeeks) || targetTermWeeks <= 0) throw new DomainValidationError("newTermWeeks must be a positive integer");

    const additionalExpectedTotal = moneyToNumber(calculateExpectedTotal(normalizedAdditional, Number(loan.interest_rate || 0), targetTermWeeks));
    const additionalInterest = moneyToNumber(new Decimal(additionalExpectedTotal).minus(normalizedAdditional));
    const nextExpectedTotal = moneyToNumber(new Decimal(loan.expected_total || 0).plus(additionalExpectedTotal));
    const nextBalance = moneyToNumber(new Decimal(loan.balance || 0).plus(additionalExpectedTotal));
    const nextPrincipal = moneyToNumber(new Decimal(loan.principal || 0).plus(normalizedAdditional));
    const nextTermMonths = Math.max(1, Math.ceil(targetTermWeeks / 4));
    const productConfig = await getLoanProductConfigTx(tx, Number(loan.product_id || 0));
    const accrualMethod = normalizeInterestAccrualMethod(productConfig.interest_accrual_method);
    const interestAccountCode = accrualMethod === "daily_eod" ? generalLedgerService.ACCOUNT_CODES.UNEARNED_INTEREST : generalLedgerService.ACCOUNT_CODES.INTEREST_INCOME;

    const updateResult = await tx.loans.updateMany({
      where: { id: loanId, status: String(loan.status || ""), balance: Number(loan.balance || 0), expected_total: Number(loan.expected_total || 0) },
      data: { principal: nextPrincipal, term_weeks: targetTermWeeks, term_months: nextTermMonths, expected_total: nextExpectedTotal, balance: nextBalance, status: String(loan.status || "") === "restructured" ? "restructured" : "active" },
    });
    if (Number(updateResult.count || 0) !== 1) throw new LoanStateConflictError("Loan state changed during top-up. Retry operation.", { currentStatus: loan.status, action: "top_up" });

    const topUpTx = await tx.transactions.create({ data: { loan_id: loanId, client_id: loan.client_id, branch_id: loan.branch_id, tx_type: "top_up", amount: normalizedAdditional, note: note || `Loan top-up principal ${normalizedAdditional}`, occurred_at: nowIso() } });
    await appendDisbursementTrancheTx({ tx, loanId, amount: normalizedAdditional, disbursedAt: nowIso(), disbursedByUserId: Number(executedByUserId || 0) || null, note: note || "Top-up disbursement", isFinal: true });

    await generalLedgerService.postJournal({
      tx, referenceType: "loan_top_up", referenceId: Number(topUpTx.id || 0), loanId, clientId: loan.client_id, branchId: loan.branch_id,
      description: "Loan top-up disbursement posted", note: note || null, postedByUserId: executedByUserId || null,
      lines: [
        { accountCode: generalLedgerService.ACCOUNT_CODES.LOAN_RECEIVABLE ?? "", side: "debit", amount: additionalExpectedTotal, memo: "Increase receivable for top-up contract" },
        { accountCode: generalLedgerService.ACCOUNT_CODES.CASH ?? "", side: "credit", amount: normalizedAdditional, memo: "Cash disbursed for top-up" },
        ...(additionalInterest > 0 ? [{ accountCode: interestAccountCode ?? "", side: "credit" as const, amount: additionalInterest, memo: accrualMethod === "daily_eod" ? "Defer top-up interest for daily accrual recognition" : "Recognize top-up contractual interest" }] : []),
      ],
    });

    const interestProfile = await (tx as any).loan_interest_profiles.findUnique({
      where: { loan_id: Number(loanId) },
      select: { total_contractual_interest: true, accrued_interest: true },
    });
    const currentTotalContractInterest = moneyToNumber(interestProfile?.total_contractual_interest || 0);
    const currentAccruedInterest = moneyToNumber(interestProfile?.accrued_interest || 0);
    const nextTotalContractInterest = moneyToNumber(new Decimal(currentTotalContractInterest).plus(additionalInterest));

    const topUpAccrualStartAt = nowIso();
    await upsertInterestProfileTx(tx, {
      loanId,
      accrualMethod,
      accrualBasis: "flat",
      accrualStartAt: topUpAccrualStartAt,
      maturityAt: getScheduleMaturityIso({
        startIso: topUpAccrualStartAt,
        termWeeks: targetTermWeeks,
        cadence: resolveLoanRepaymentCadence(productConfig.interest_accrual_method),
        addWeeksIso,
      }),
      totalContractualInterest: nextTotalContractInterest,
      accruedInterest: accrualMethod === "daily_eod" ? currentAccruedInterest : nextTotalContractInterest,
    });

    const lastRep = await tx.repayments.findFirst({ where: { loan_id: loanId }, orderBy: [{ paid_at: "desc" }, { id: "desc" }], select: { paid_at: true } });
    const anchor = lastRep?.paid_at ? new Date(String(lastRep.paid_at)).toISOString() : nowIso();
    await regeneratePendingInstallmentsTx(tx, addWeeksIso, { loanId, expectedTotal: nextExpectedTotal, termWeeks: targetTermWeeks, scheduleStartDateIso: anchor, repaidTotal: Number(loan.repaid_total || 0), penaltyConfig: productConfig });

    const updatedLoan = await tx.loans.findUnique({ where: { id: loanId } });
    const contractSnapshot = await buildLoanContractSnapshotTx(tx, loanId, { previousLoan: loan, additionalPrincipal: normalizedAdditional, additionalInterest, transactionId: Number(topUpTx.id || 0) });
    await recordLoanContractVersionTx(tx, { loanId, eventType: "top_up", note: note || null, createdByUserId: executedByUserId || null, snapshotJson: contractSnapshot, principal: Number(updatedLoan?.principal || nextPrincipal), interestRate: Number(loan.interest_rate || 0), termWeeks: targetTermWeeks, expectedTotal: Number(updatedLoan?.expected_total || nextExpectedTotal), repaidTotal: Number(updatedLoan?.repaid_total || loan.repaid_total || 0), balance: Number(updatedLoan?.balance || nextBalance) });

    return { updatedLoan, transaction: await tx.transactions.findUnique({ where: { id: topUpTx.id } }) };
  };

  return transactionClient
    ? await runMutation(transactionClient)
    : await prisma.$transaction(async (tx: PrismaTransactionClient) => runMutation(tx), { maxWait: 10000, timeout: 20000 });
}

// ---------------------------------------------------------------------------
// executeRefinanceLoanFromApprovedRequest
// ---------------------------------------------------------------------------
export async function executeRefinanceLoanFromApprovedRequest(
  deps: ExecuteDeps,
  args: {
    loanId: number;
    newTermWeeks: number;
    newInterestRate: number;
    additionalPrincipal?: number;
    note?: string;
    executedByUserId?: number;
    requestSnapshot?: Record<string, any> | null;
    transactionClient?: PrismaTransactionClient;
  },
): Promise<Record<string, any>> {
  const { generalLedgerService, calculateExpectedTotal, addWeeksIso } = deps;
  const { loanId, newTermWeeks, newInterestRate, additionalPrincipal, note, executedByUserId, requestSnapshot, transactionClient } = args;

  const snapshotClient = transactionClient || prisma;
  const preCheck = await snapshotClient.loans.findUnique({ where: { id: loanId }, select: { id: true, status: true, balance: true, expected_total: true, repaid_total: true, term_weeks: true, interest_rate: true } });
  if (!preCheck) throw new LoanNotFoundError();
  assertLoanSnapshotMatchesCurrent({ status: String(preCheck.status || ""), balance: Number(preCheck.balance || 0), expected_total: Number(preCheck.expected_total || 0), repaid_total: Number(preCheck.repaid_total || 0), term_weeks: Number(preCheck.term_weeks || 0), interest_rate: Number(preCheck.interest_rate || 0) }, requestSnapshot || null);

  const runMutation = async (tx: PrismaTransactionClient) => {
    const loan = await tx.loans.findUnique({ where: { id: loanId }, select: { id: true, client_id: true, branch_id: true, product_id: true, status: true, principal: true, interest_rate: true, term_weeks: true, expected_total: true, repaid_total: true, balance: true } });
    if (!loan) throw new LoanNotFoundError();
    if (["closed", "written_off", "pending_approval", "approved", "rejected"].includes(String(loan.status || ""))) throw new LoanStateConflictError("Cannot refinance a non-active loan", { currentStatus: loan.status, action: "refinance" });

    const normalizedAdditional = moneyToNumber(additionalPrincipal || 0);
    const outstandingPrincipal = estimateOutstandingPrincipalForRepricing({ principal: Number(loan.principal || 0), expectedTotal: Number(loan.expected_total || 0), balance: Number(loan.balance || 0) });
    const basePrincipal = moneyToNumber(new Decimal(outstandingPrincipal).plus(normalizedAdditional));
    if (basePrincipal <= 0) throw new LoanStateConflictError("Cannot refinance a loan with no outstanding principal", { currentStatus: loan.status, action: "refinance" });

    const nextExpectedTotal = moneyToNumber(calculateExpectedTotal(basePrincipal, newInterestRate, newTermWeeks));
    const nextBalance = nextExpectedTotal;
    const interestAdjustment = moneyToNumber(new Decimal(nextExpectedTotal).minus(loan.balance || 0).minus(normalizedAdditional));
    const nextTermMonths = Math.max(1, Math.ceil(newTermWeeks / 4));
    const productConfig = await getLoanProductConfigTx(tx, Number(loan.product_id || 0));
    const accrualMethod = normalizeInterestAccrualMethod(productConfig.interest_accrual_method);
    const interestAccountCode = (accrualMethod === "daily_eod" ? generalLedgerService.ACCOUNT_CODES.UNEARNED_INTEREST : generalLedgerService.ACCOUNT_CODES.INTEREST_INCOME) ?? "";

    const updateResult = await tx.loans.updateMany({
      where: { id: loanId, status: String(loan.status || ""), balance: Number(loan.balance || 0), expected_total: Number(loan.expected_total || 0) },
      data: { status: "restructured", principal: basePrincipal, interest_rate: newInterestRate, term_weeks: newTermWeeks, term_months: nextTermMonths, expected_total: nextExpectedTotal, repaid_total: 0, balance: nextBalance },
    });
    if (Number(updateResult.count || 0) !== 1) throw new LoanStateConflictError("Loan state changed during refinance. Retry operation.", { currentStatus: loan.status, action: "refinance" });

    const refinanceTx = await tx.transactions.create({ data: { loan_id: loanId, client_id: loan.client_id, branch_id: loan.branch_id, tx_type: "refinance", amount: nextExpectedTotal, note: note || `Loan refinanced to ${newTermWeeks} weeks`, occurred_at: nowIso() } });

    if (normalizedAdditional > 0) {
      await generalLedgerService.postJournal({ tx, referenceType: "loan_refinance_cash", referenceId: Number(refinanceTx.id || 0), loanId, clientId: loan.client_id, branchId: loan.branch_id, description: "Refinance top-up disbursement posted", note: note || null, postedByUserId: executedByUserId || null, lines: [{ accountCode: generalLedgerService.ACCOUNT_CODES.LOAN_RECEIVABLE ?? "", side: "debit", amount: normalizedAdditional, memo: "Increase receivable from refinance top-up principal" }, { accountCode: generalLedgerService.ACCOUNT_CODES.CASH ?? "", side: "credit", amount: normalizedAdditional, memo: "Cash disbursed under refinance top-up" }] });
      await appendDisbursementTrancheTx({ tx, loanId, amount: normalizedAdditional, disbursedAt: nowIso(), disbursedByUserId: Number(executedByUserId || 0) || null, note: note || "Refinance top-up disbursement", isFinal: true });
    }

    await postReceivableInterestAdjustmentTx(tx, generalLedgerService, { referenceType: "loan_refinance_interest_adjustment", referenceId: Number(refinanceTx.id || 0), loanId, clientId: loan.client_id, branchId: loan.branch_id, amount: interestAdjustment, interestAccountCode, description: "Refinance interest adjustment posted", note: note || null, postedByUserId: executedByUserId || null });

    const contractualInterest = moneyToNumber(new Decimal(nextExpectedTotal).minus(basePrincipal));
    const refinanceAccrualStartAt = nowIso();
    await upsertInterestProfileTx(tx, {
      loanId,
      accrualMethod,
      accrualBasis: "flat",
      accrualStartAt: refinanceAccrualStartAt,
      maturityAt: getScheduleMaturityIso({
        startIso: refinanceAccrualStartAt,
        termWeeks: newTermWeeks,
        cadence: resolveLoanRepaymentCadence(productConfig.interest_accrual_method),
        addWeeksIso,
      }),
      totalContractualInterest: contractualInterest,
      accruedInterest: accrualMethod === "daily_eod" ? 0 : contractualInterest,
    });

    const lastRep = await tx.repayments.findFirst({ where: { loan_id: loanId }, orderBy: [{ paid_at: "desc" }, { id: "desc" }], select: { paid_at: true } });
    const anchor = lastRep?.paid_at ? new Date(String(lastRep.paid_at)).toISOString() : nowIso();
    await regeneratePendingInstallmentsTx(tx, addWeeksIso, { loanId, expectedTotal: nextExpectedTotal, termWeeks: newTermWeeks, scheduleStartDateIso: anchor, repaidTotal: 0, penaltyConfig: productConfig });

    const updatedLoan = await tx.loans.findUnique({ where: { id: loanId } });
    const contractSnapshot = await buildLoanContractSnapshotTx(tx, loanId, { previousLoan: loan, outstandingPrincipal, newInterestRate, additionalPrincipal: normalizedAdditional, transactionId: Number(refinanceTx.id || 0) });
    await recordLoanContractVersionTx(tx, { loanId, eventType: "refinance", note: note || null, createdByUserId: executedByUserId || null, snapshotJson: contractSnapshot, principal: Number(updatedLoan?.principal || basePrincipal), interestRate: newInterestRate, termWeeks: newTermWeeks, expectedTotal: Number(updatedLoan?.expected_total || nextExpectedTotal), repaidTotal: Number(updatedLoan?.repaid_total || 0), balance: Number(updatedLoan?.balance || nextBalance) });

    return { updatedLoan, transaction: await tx.transactions.findUnique({ where: { id: refinanceTx.id } }) };
  };

  return transactionClient
    ? await runMutation(transactionClient)
    : await prisma.$transaction(async (tx: PrismaTransactionClient) => runMutation(tx), { maxWait: 10000, timeout: 20000 });
}

// ---------------------------------------------------------------------------
// executeTermExtensionFromApprovedRequest
// ---------------------------------------------------------------------------
export async function executeTermExtensionFromApprovedRequest(
  deps: ExecuteDeps,
  args: {
    loanId: number;
    newTermWeeks: number;
    note?: string;
    executedByUserId?: number;
    requestSnapshot?: Record<string, any> | null;
    transactionClient?: PrismaTransactionClient;
  },
): Promise<Record<string, any>> {
  const { generalLedgerService, calculateExpectedTotal, addWeeksIso } = deps;
  const { loanId, newTermWeeks, note, executedByUserId, requestSnapshot, transactionClient } = args;

  const snapshotClient = transactionClient || prisma;
  const preCheck = await snapshotClient.loans.findUnique({ where: { id: loanId }, select: { id: true, status: true, balance: true, expected_total: true, repaid_total: true, term_weeks: true, interest_rate: true } });
  if (!preCheck) throw new LoanNotFoundError();
  assertLoanSnapshotMatchesCurrent({ status: String(preCheck.status || ""), balance: Number(preCheck.balance || 0), expected_total: Number(preCheck.expected_total || 0), repaid_total: Number(preCheck.repaid_total || 0), term_weeks: Number(preCheck.term_weeks || 0), interest_rate: Number(preCheck.interest_rate || 0) }, requestSnapshot || null);

  const runMutation = async (tx: PrismaTransactionClient) => {
    const loan = await tx.loans.findUnique({ where: { id: loanId }, select: { id: true, client_id: true, branch_id: true, product_id: true, status: true, principal: true, interest_rate: true, term_weeks: true, expected_total: true, repaid_total: true, balance: true } });
    if (!loan) throw new LoanNotFoundError();
    if (["closed", "written_off", "pending_approval", "approved", "rejected"].includes(String(loan.status || ""))) throw new LoanStateConflictError("Cannot extend term for a non-active loan", { currentStatus: loan.status, action: "term_extension" });

    const outstandingBalance = Number(loan.balance || 0);
    const outstandingPrincipal = estimateOutstandingPrincipalForRepricing({ principal: Number(loan.principal || 0), expectedTotal: Number(loan.expected_total || 0), balance: outstandingBalance });
    if (outstandingPrincipal <= 0) throw new LoanStateConflictError("Cannot extend term for a loan with no outstanding principal", { currentStatus: loan.status, action: "term_extension" });

    const nextExpectedTotal = moneyToNumber(calculateExpectedTotal(outstandingPrincipal, Number(loan.interest_rate || 0), newTermWeeks));
    const nextBalance = nextExpectedTotal;
    const interestAdjustment = moneyToNumber(new Decimal(nextExpectedTotal).minus(outstandingBalance));
    const nextTermMonths = Math.max(1, Math.ceil(newTermWeeks / 4));
    const productConfig = await getLoanProductConfigTx(tx, Number(loan.product_id || 0));
    const accrualMethod = normalizeInterestAccrualMethod(productConfig.interest_accrual_method);
    const interestAccountCode = (accrualMethod === "daily_eod" ? generalLedgerService.ACCOUNT_CODES.UNEARNED_INTEREST : generalLedgerService.ACCOUNT_CODES.INTEREST_INCOME) ?? "";

    const updateResult = await tx.loans.updateMany({
      where: { id: loanId, status: String(loan.status || ""), balance: Number(loan.balance || 0), expected_total: Number(loan.expected_total || 0) },
      data: { status: "restructured", principal: outstandingPrincipal, term_weeks: newTermWeeks, term_months: nextTermMonths, expected_total: nextExpectedTotal, repaid_total: 0, balance: nextBalance },
    });
    if (Number(updateResult.count || 0) !== 1) throw new LoanStateConflictError("Loan state changed during term extension. Retry operation.", { currentStatus: loan.status, action: "term_extension" });

    const extensionTx = await tx.transactions.create({ data: { loan_id: loanId, client_id: loan.client_id, branch_id: loan.branch_id, tx_type: "term_extension", amount: nextExpectedTotal, note: note || `Loan term extended to ${newTermWeeks} weeks`, occurred_at: nowIso() } });

    await postReceivableInterestAdjustmentTx(tx, generalLedgerService, { referenceType: "loan_term_extension_interest_adjustment", referenceId: Number(extensionTx.id || 0), loanId, clientId: loan.client_id, branchId: loan.branch_id, amount: interestAdjustment, interestAccountCode, description: "Term extension interest adjustment posted", note: note || null, postedByUserId: executedByUserId || null });

    const contractualInterest = moneyToNumber(new Decimal(nextExpectedTotal).minus(outstandingPrincipal));
    const extensionAccrualStartAt = nowIso();
    await upsertInterestProfileTx(tx, {
      loanId,
      accrualMethod,
      accrualBasis: "flat",
      accrualStartAt: extensionAccrualStartAt,
      maturityAt: getScheduleMaturityIso({
        startIso: extensionAccrualStartAt,
        termWeeks: newTermWeeks,
        cadence: resolveLoanRepaymentCadence(productConfig.interest_accrual_method),
        addWeeksIso,
      }),
      totalContractualInterest: contractualInterest,
      accruedInterest: accrualMethod === "daily_eod" ? 0 : contractualInterest,
    });

    const lastRep = await tx.repayments.findFirst({ where: { loan_id: loanId }, orderBy: [{ paid_at: "desc" }, { id: "desc" }], select: { paid_at: true } });
    const anchor = lastRep?.paid_at ? new Date(String(lastRep.paid_at)).toISOString() : nowIso();
    await regeneratePendingInstallmentsTx(tx, addWeeksIso, { loanId, expectedTotal: nextExpectedTotal, termWeeks: newTermWeeks, scheduleStartDateIso: anchor, repaidTotal: 0, penaltyConfig: productConfig });

    const updatedLoan = await tx.loans.findUnique({ where: { id: loanId } });
    const contractSnapshot = await buildLoanContractSnapshotTx(tx, loanId, { previousLoan: loan, newTermWeeks, repricingPrincipal: outstandingPrincipal, transactionId: Number(extensionTx.id || 0) });
    await recordLoanContractVersionTx(tx, { loanId, eventType: "term_extension", note: note || null, createdByUserId: executedByUserId || null, snapshotJson: contractSnapshot, principal: Number(updatedLoan?.principal || outstandingPrincipal), interestRate: Number(loan.interest_rate || 0), termWeeks: newTermWeeks, expectedTotal: Number(updatedLoan?.expected_total || nextExpectedTotal), repaidTotal: Number(updatedLoan?.repaid_total || 0), balance: Number(updatedLoan?.balance || nextBalance) });

    return { updatedLoan, transaction: await tx.transactions.findUnique({ where: { id: extensionTx.id } }) };
  };

  return transactionClient
    ? await runMutation(transactionClient)
    : await prisma.$transaction(async (tx: PrismaTransactionClient) => runMutation(tx), { maxWait: 10000, timeout: 20000 });
}
