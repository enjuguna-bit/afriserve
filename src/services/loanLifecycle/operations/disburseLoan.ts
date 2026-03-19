import { Decimal } from "decimal.js";
import { prisma } from "../../../db/prismaClient.js";
import {
  ForbiddenScopeError,
  LoanNotFoundError,
  LoanStateConflictError,
} from "../../../domain/errors.js";
import { buildLoanContractSnapshotTx, recordLoanContractVersionTx } from "../../loanContractVersioning.js";
import {
  appendDisbursementTrancheTx,
  resolveDisbursementRequest,
} from "../../loanLifecycleDisbursementSupport.js";
import {
  nowIso,
  moneyToNumber,
  normalizeInterestAccrualMethod,
} from "../shared/helpers.js";
import {
  sumDisbursedPrincipalTx,
  regeneratePendingInstallmentsTx,
  upsertInterestProfileTx,
  getLoanProductConfigTx,
} from "../shared/contextHelpers.js";
import type { LoanLifecycleDeps, JournalLine } from "../shared/types.js";

export async function disburseLoan(
  deps: Pick<LoanLifecycleDeps,
    | "hierarchyService" | "generalLedgerService" | "addWeeksIso"
    | "writeAuditLog" | "invalidateReportCaches" | "publishDomainEvent">,
  args: {
    loanId: number;
    payload: { notes?: string; amount?: number; finalDisbursement?: boolean };
    user: { sub: number };
    ipAddress: string | null | undefined;
  },
): Promise<Record<string, any>> {
  const { hierarchyService, generalLedgerService, addWeeksIso, writeAuditLog, invalidateReportCaches } = deps;
  const publishDomainEvent = deps.publishDomainEvent ?? (async () => 0);
  const { loanId, payload, user, ipAddress } = args;

  const scope = await hierarchyService.resolveHierarchyScope(user);
  const loan = await prisma.loans.findUnique({ where: { id: loanId } });
  if (!loan) throw new LoanNotFoundError();
  if (!hierarchyService.isBranchInScope(scope, loan.branch_id)) throw new ForbiddenScopeError();
  if (loan.status === "active") return { message: "Loan is already disbursed", loan };
  if (loan.status !== "approved") {
    throw new LoanStateConflictError("Loan must be approved before disbursement", {
      currentStatus: loan.status, action: "disburse",
    });
  }

  const disbursementSummary = await prisma.$transaction(async (tx: any) => {
    const loanForDisbursement = await tx.loans.findUnique({ where: { id: loanId } });
    if (!loanForDisbursement) throw new LoanNotFoundError();
    if (loanForDisbursement.status !== "approved") {
      throw new LoanStateConflictError("Loan must be approved before disbursement", {
        currentStatus: loanForDisbursement.status, action: "disburse",
      });
    }

    const termWeeks = Number(loanForDisbursement.term_weeks || 0);
    if (!Number.isInteger(termWeeks) || termWeeks <= 0) {
      throw new LoanStateConflictError("Loan term is invalid for disbursement schedule generation", {
        currentStatus: loanForDisbursement.status, action: "disburse",
      });
    }

    const now = nowIso();
    const disbursedSoFar = await sumDisbursedPrincipalTx(tx as any, loanId);
    const approvedPrincipal = moneyToNumber(loanForDisbursement.principal || 0);
    const remainingPrincipal = moneyToNumber(new Decimal(approvedPrincipal).minus(disbursedSoFar));
    if (remainingPrincipal <= 0) {
      throw new LoanStateConflictError("Loan principal is already fully disbursed", {
        currentStatus: loanForDisbursement.status, action: "disburse",
      });
    }

    const disbursementRequest = resolveDisbursementRequest({
      approvedPrincipal, disbursedSoFar,
      requestedAmountInput: payload.amount,
      finalDisbursement: payload.finalDisbursement,
    });
    const { requestedAmount, isFinalDisbursement } = disbursementRequest;

    const nextTrancheNumber = await appendDisbursementTrancheTx({
      tx: tx as any, loanId, amount: requestedAmount,
      disbursedAt: now, disbursedByUserId: user.sub,
      note: payload.notes || null, isFinal: isFinalDisbursement,
    });

    const disbursementTx = await tx.transactions.create({
      data: {
        loan_id: loanId, client_id: loanForDisbursement.client_id,
        branch_id: loanForDisbursement.branch_id,
        tx_type: isFinalDisbursement ? "disbursement" : "disbursement_tranche",
        amount: requestedAmount,
        note: payload.notes || (isFinalDisbursement ? "Loan disbursed" : "Loan tranche disbursed"),
        occurred_at: now,
      },
    });

    await generalLedgerService.postJournal({
      tx: tx as any,
      referenceType: isFinalDisbursement ? "loan_disbursement" : "loan_disbursement_tranche",
      referenceId: Number(disbursementTx.id || 0),
      loanId: loanForDisbursement.id, clientId: loanForDisbursement.client_id,
      branchId: loanForDisbursement.branch_id,
      description: isFinalDisbursement
        ? "Final loan principal disbursement posted"
        : "Loan tranche principal disbursement posted",
      note: payload.notes || null, postedByUserId: user.sub,
      lines: [
        { accountCode: generalLedgerService.ACCOUNT_CODES.LOAN_RECEIVABLE ?? "", side: "debit", amount: requestedAmount, memo: "Recognize disbursed principal receivable" },
        { accountCode: generalLedgerService.ACCOUNT_CODES.CASH ?? "", side: "credit", amount: requestedAmount, memo: "Cash disbursed to borrower" },
      ],
    });

    if (!isFinalDisbursement) {
      const updatedLoan = await tx.loans.findUnique({ where: { id: loanId } });
      const contractSnapshot = await buildLoanContractSnapshotTx(tx as any, loanId, {
        previousLoan: loanForDisbursement,
        tranche: { trancheNumber: nextTrancheNumber, amount: requestedAmount, finalDisbursement: false },
        transactionId: Number(disbursementTx.id || 0),
      });
      await recordLoanContractVersionTx(tx as any, {
        loanId, eventType: "disbursement_tranche",
        note: payload.notes || "Loan tranche disbursed", createdByUserId: user.sub,
        snapshotJson: contractSnapshot,
        principal: Number(updatedLoan?.principal || loanForDisbursement.principal || 0),
        interestRate: Number(updatedLoan?.interest_rate || loanForDisbursement.interest_rate || 0),
        termWeeks: Number(updatedLoan?.term_weeks || loanForDisbursement.term_weeks || 0),
        expectedTotal: Number(updatedLoan?.expected_total || loanForDisbursement.expected_total || 0),
        repaidTotal: Number(updatedLoan?.repaid_total || loanForDisbursement.repaid_total || 0),
        balance: Number(updatedLoan?.balance || loanForDisbursement.balance || 0),
      });
      const remainingAfterTranche = moneyToNumber(new Decimal(remainingPrincipal).minus(requestedAmount));
      await publishDomainEvent({ eventType: "loan.tranche_disbursed", aggregateType: "loan", aggregateId: loanId, payload: { loanId, disbursedByUserId: user.sub, notes: payload.notes || null, trancheNumber: nextTrancheNumber, trancheAmount: requestedAmount, remainingPrincipal: remainingAfterTranche, finalDisbursement: false, loanStatus: updatedLoan?.status || null, branchId: Number(updatedLoan?.branch_id || 0) || null, clientId: Number(updatedLoan?.client_id || 0) || null, disbursedAt: updatedLoan?.disbursed_at || now }, metadata: { source: "disburseLoan" } }, tx as any);
      return { isFinalDisbursement: false, trancheNumber: nextTrancheNumber, disbursedAmount: requestedAmount, remainingPrincipal: remainingAfterTranche, updatedLoan };
    }

    // Final disbursement path
    const disbursementUpdate = await tx.loans.updateMany({
      where: { id: loanId, status: "approved" },
      data: { status: "active", disbursed_at: now, disbursed_by_user_id: user.sub, disbursement_note: payload.notes || "Loan disbursed" },
    });
    if (Number(disbursementUpdate.count || 0) !== 1) {
      throw new LoanStateConflictError("Loan status changed during disbursement. Retry operation.", {
        currentStatus: loanForDisbursement.status, action: "disburse",
      });
    }

    const registrationFee = moneyToNumber(loanForDisbursement.registration_fee || 0);
    const processingFee = moneyToNumber(loanForDisbursement.processing_fee || 0);
    const interestAmount = moneyToNumber(new Decimal(loanForDisbursement.expected_total || 0).minus(loanForDisbursement.principal || 0));
    const feeIncome = moneyToNumber(new Decimal(registrationFee).plus(processingFee));

    if (registrationFee > 0) {
      await tx.transactions.create({ data: { loan_id: loanId, client_id: loanForDisbursement.client_id, branch_id: loanForDisbursement.branch_id, tx_type: "registration_fee", amount: registrationFee, note: "One-time client registration fee", occurred_at: nowIso() } });
    }
    if (processingFee > 0) {
      await tx.transactions.create({ data: { loan_id: loanId, client_id: loanForDisbursement.client_id, branch_id: loanForDisbursement.branch_id, tx_type: "processing_fee", amount: processingFee, note: "Recurring loan processing fee", occurred_at: nowIso() } });
    }

    const productConfig = await getLoanProductConfigTx(tx as any, Number(loanForDisbursement.product_id || 0));
    const accrualMethod = normalizeInterestAccrualMethod(productConfig.interest_accrual_method);
    const interestAccountCode = accrualMethod === "daily_eod"
      ? generalLedgerService.ACCOUNT_CODES.UNEARNED_INTEREST
      : generalLedgerService.ACCOUNT_CODES.INTEREST_INCOME;

    if (interestAmount > 0 || feeIncome > 0) {
      const finalizationLines: JournalLine[] = [];
      if (interestAmount > 0) {
        finalizationLines.push({ accountCode: generalLedgerService.ACCOUNT_CODES.LOAN_RECEIVABLE ?? "", side: "debit", amount: interestAmount, memo: "Recognize contractual interest receivable" });
        finalizationLines.push({ accountCode: interestAccountCode ?? "", side: "credit", amount: interestAmount, memo: accrualMethod === "daily_eod" ? "Defer contractual interest for EOD accrual recognition" : "Recognize contractual interest income" });
      }
      if (feeIncome > 0) {
        finalizationLines.push({ accountCode: generalLedgerService.ACCOUNT_CODES.CASH ?? "", side: "debit", amount: feeIncome, memo: "Recognize upfront registration and processing fees collected" });
        finalizationLines.push({ accountCode: generalLedgerService.ACCOUNT_CODES.FEE_INCOME ?? "", side: "credit", amount: feeIncome, memo: "Recognize registration and processing fee income paid upfront" });
      }
      await generalLedgerService.postJournal({ tx: tx as any, referenceType: "loan_disbursement_finalize", referenceId: loanId, loanId: loanForDisbursement.id, clientId: loanForDisbursement.client_id, branchId: loanForDisbursement.branch_id, description: "Final loan disbursement interest and upfront fee recognition posted", note: payload.notes || null, postedByUserId: user.sub, lines: finalizationLines });
    }

    const disbursedAt = new Date().toISOString();
    await regeneratePendingInstallmentsTx(tx as any, addWeeksIso, { loanId, expectedTotal: Number(loanForDisbursement.expected_total || 0), termWeeks, scheduleStartDateIso: disbursedAt, repaidTotal: 0, penaltyConfig: productConfig });
    await upsertInterestProfileTx(tx as any, { loanId, accrualMethod, accrualBasis: "flat", accrualStartAt: disbursedAt, maturityAt: addWeeksIso(disbursedAt, termWeeks), totalContractualInterest: interestAmount, accruedInterest: accrualMethod === "daily_eod" ? 0 : interestAmount });

    const updatedLoan = await tx.loans.findUnique({ where: { id: loanId } });
    const contractSnapshot = await buildLoanContractSnapshotTx(tx as any, loanId, { previousLoan: loanForDisbursement, disbursement: { trancheNumber: nextTrancheNumber, amount: requestedAmount, finalDisbursement: true, totalDisbursedPrincipal: approvedPrincipal, interestAccrualMethod: accrualMethod }, transactionId: Number(disbursementTx.id || 0) });
    await recordLoanContractVersionTx(tx as any, { loanId, eventType: "disbursement", note: payload.notes || null, createdByUserId: user.sub, snapshotJson: contractSnapshot, principal: Number(updatedLoan?.principal || loanForDisbursement.principal || 0), interestRate: Number(updatedLoan?.interest_rate || loanForDisbursement.interest_rate || 0), termWeeks: Number(updatedLoan?.term_weeks || termWeeks), expectedTotal: Number(updatedLoan?.expected_total || loanForDisbursement.expected_total || 0), repaidTotal: Number(updatedLoan?.repaid_total || loanForDisbursement.repaid_total || 0), balance: Number(updatedLoan?.balance || loanForDisbursement.balance || 0) });
    await publishDomainEvent({ eventType: "loan.disbursed", aggregateType: "loan", aggregateId: loanId, payload: { loanId, disbursedByUserId: user.sub, notes: payload.notes || null, trancheNumber: nextTrancheNumber, trancheAmount: requestedAmount, remainingPrincipal: 0, finalDisbursement: true, loanStatus: updatedLoan?.status || null, branchId: Number(updatedLoan?.branch_id || 0) || null, clientId: Number(updatedLoan?.client_id || 0) || null, disbursedAt: updatedLoan?.disbursed_at || disbursedAt }, metadata: { source: "disburseLoan" } }, tx as any);

    return { isFinalDisbursement: true, trancheNumber: nextTrancheNumber, disbursedAmount: requestedAmount, remainingPrincipal: 0, updatedLoan };
  }, { maxWait: 10000, timeout: 20000 });

  await writeAuditLog({ userId: user.sub, action: "loan.disbursed", targetType: "loan", targetId: loanId, details: JSON.stringify({ disbursedBy: user.sub, notes: payload.notes || null, trancheNumber: disbursementSummary.trancheNumber, trancheAmount: disbursementSummary.disbursedAmount, finalDisbursement: disbursementSummary.isFinalDisbursement }), ipAddress: ipAddress || null });

  const updatedLoan = await prisma.loans.findUnique({ where: { id: loanId } });
  await invalidateReportCaches();

  if (!disbursementSummary.isFinalDisbursement) {
    return { message: "Loan tranche disbursed", loan: updatedLoan, disbursement: { trancheNumber: disbursementSummary.trancheNumber, amount: disbursementSummary.disbursedAmount, remainingPrincipal: disbursementSummary.remainingPrincipal, finalDisbursement: false } };
  }
  return { message: "Loan disbursed", loan: updatedLoan, disbursement: { trancheNumber: disbursementSummary.trancheNumber, amount: disbursementSummary.disbursedAmount, remainingPrincipal: 0, finalDisbursement: true } };
}
