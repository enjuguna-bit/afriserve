import type { DbRunResult } from "../types/dataLayer.js";
import { prisma, type PrismaTransactionClient } from "../db/prismaClient.js";
import { Decimal } from "decimal.js";
import {
  DomainValidationError,
  ForbiddenScopeError,
  InvalidLoanStatusError,
  LoanNotFoundError,
  LoanStateConflictError,
} from "../domain/errors.js";

interface RepaymentServiceDeps {
  executeTransaction: (callback: (tx: {
    run: (sql: string, params?: unknown[]) => Promise<DbRunResult>;
    get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
    all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  }) => Promise<any>) => Promise<any>;
  hierarchyService: any;
  writeAuditLog: (payload: {
    userId?: number | null;
    action: string;
    targetType?: string | null;
    targetId?: number | null;
    details?: string | null;
    ipAddress?: string | null;
  }) => Promise<void> | void;
  invalidateReportCaches: () => Promise<void>;
  generalLedgerService: {
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
      lines: Array<{ accountCode: string; side: "debit" | "credit"; amount: number; memo?: string | null | undefined }>;
    }) => Promise<number>;
  };
}

function createRepaymentService(deps: RepaymentServiceDeps) {
  const {
    hierarchyService,
    writeAuditLog,
    invalidateReportCaches,
    generalLedgerService,
  } = deps;

  const collectibleLoanStatuses = ["active", "restructured"];

  function toMoneyDecimal(value: Decimal.Value): Decimal {
    return new Decimal(value || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }

  function isCollectibleLoanStatus(status: unknown): boolean {
    return collectibleLoanStatuses.includes(String(status || "").toLowerCase());
  }

  function normalizeClientIdempotencyKey(value: unknown): string | null {
    const normalized = String(value || "").trim();
    return normalized ? normalized : null;
  }

  function isUniqueConstraintError(error: unknown): boolean {
    const message = String((error as { message?: unknown })?.message || "").toLowerCase();
    return message.includes("unique constraint")
      || message.includes("duplicate key")
      || message.includes("already exists");
  }

  async function reconcileInstallmentStatuses(
    tx: PrismaTransactionClient,
    loanId: number,
  ) {
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();
    const installments = await tx.loan_installments.findMany({
      where: {
        loan_id: loanId,
      },
      select: {
        id: true,
        amount_due: true,
        amount_paid: true,
        due_date: true,
        paid_at: true,
      },
      orderBy: {
        installment_number: "asc",
      },
    });

    for (const installment of installments) {
      const installmentDue = toMoneyDecimal(installment.amount_due || 0);
      const normalizedPaid = Decimal.min(
        installmentDue,
        Decimal.max(0, toMoneyDecimal(installment.amount_paid || 0)),
      ).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const isPaid = normalizedPaid.greaterThanOrEqualTo(installmentDue);
      const dueDateMs = new Date(String(installment.due_date || "")).getTime();
      const shouldBeOverdue = !isPaid && Number.isFinite(dueDateMs) && dueDateMs < nowMs;

      await tx.loan_installments.update({
        where: { id: installment.id },
        data: {
          amount_paid: normalizedPaid.toNumber(),
          status: isPaid ? "paid" : (shouldBeOverdue ? "overdue" : "pending"),
          paid_at: isPaid ? (installment.paid_at || nowIso) : null,
        },
      });
    }
  }

  async function allocatePenaltyFirst(
    tx: PrismaTransactionClient,
    loanId: number,
    repaymentAmount: Decimal,
  ): Promise<{ penaltyAllocated: Decimal; remaining: Decimal }> {
    let remaining = toMoneyDecimal(repaymentAmount);
    let penaltyAllocated = toMoneyDecimal(0);
    if (remaining.lte(0)) {
      return {
        penaltyAllocated,
        remaining,
      };
    }

    const installments = await tx.loan_installments.findMany({
      where: { loan_id: loanId },
      select: {
        id: true,
        penalty_amount_accrued: true,
      },
      orderBy: {
        installment_number: "asc",
      },
    });

    for (const installment of installments) {
      if (remaining.lte(0)) {
        break;
      }

      const outstandingPenalty = toMoneyDecimal(installment.penalty_amount_accrued || 0);
      if (outstandingPenalty.lte(0)) {
        continue;
      }

      const penaltyAllocation = Decimal.min(remaining, outstandingPenalty).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const nextPenaltyOutstanding = Decimal.max(0, outstandingPenalty.minus(penaltyAllocation)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

      await tx.loan_installments.update({
        where: { id: installment.id },
        data: {
          penalty_amount_accrued: nextPenaltyOutstanding.toNumber(),
        },
      });

      penaltyAllocated = penaltyAllocated.plus(penaltyAllocation).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      remaining = remaining.minus(penaltyAllocation).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    }

    return {
      penaltyAllocated,
      remaining: Decimal.max(0, remaining).toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    };
  }

  async function allocateScheduledInstallments(
    tx: PrismaTransactionClient,
    loanId: number,
    scheduledAmount: Decimal,
  ): Promise<{
    scheduledAllocated: Decimal;
    interestAllocated: Decimal;
    principalAllocated: Decimal;
  }> {
    let remaining = toMoneyDecimal(scheduledAmount);
    let scheduledAllocated = toMoneyDecimal(0);
    if (remaining.lte(0)) {
      return {
        scheduledAllocated,
        interestAllocated: toMoneyDecimal(0),
        principalAllocated: toMoneyDecimal(0),
      };
    }

    const loan = await tx.loans.findUnique({
      where: { id: loanId },
      select: {
        principal: true,
      },
    });
    if (!loan) {
      throw new LoanNotFoundError();
    }

    const installments = await tx.loan_installments.findMany({
      where: { loan_id: loanId },
      select: {
        id: true,
        amount_due: true,
        amount_paid: true,
      },
      orderBy: {
        installment_number: "asc",
      },
    });

    const totalScheduledDue = installments.reduce(
      (sum: Decimal, installment: any) => sum.plus(toMoneyDecimal(installment.amount_due || 0)),
      toMoneyDecimal(0),
    ).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const totalScheduledPaidBefore = installments.reduce(
      (sum: Decimal, installment: any) => sum.plus(toMoneyDecimal(installment.amount_paid || 0)),
      toMoneyDecimal(0),
    ).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    for (const installment of installments) {
      if (remaining.lte(0)) {
        break;
      }

      const installmentDue = toMoneyDecimal(installment.amount_due || 0);
      const installmentPaid = toMoneyDecimal(installment.amount_paid || 0);
      const installmentOutstanding = Decimal.max(0, installmentDue.minus(installmentPaid)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      if (installmentOutstanding.lte(0)) {
        continue;
      }

      const allocation = Decimal.min(remaining, installmentOutstanding).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const nextAmountPaid = Decimal.min(installmentDue, installmentPaid.plus(allocation)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

      await tx.loan_installments.update({
        where: { id: installment.id },
        data: {
          amount_paid: nextAmountPaid.toNumber(),
        },
      });

      scheduledAllocated = scheduledAllocated.plus(allocation).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      remaining = remaining.minus(allocation).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    }

    // FIX #12: Instead of throwing when unallocated remainder exists (which crashes
    // repayments on loans with no pending installments or fully paid schedules),
    // absorb the remainder into scheduledAllocated so the repayment still commits.
    // This covers edge cases: zero-installment loans, fully pre-paid schedules,
    // and any rounding delta < 1 cent that slips through.
    if (remaining.greaterThan(0)) {
      scheduledAllocated = scheduledAllocated.plus(remaining).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    }

    const contractualInterestTotal = Decimal.max(
      0,
      totalScheduledDue.minus(toMoneyDecimal(loan.principal || 0)),
    ).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const interestPaidBefore = Decimal.min(totalScheduledPaidBefore, contractualInterestTotal).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const interestPaidAfter = Decimal.min(
      totalScheduledPaidBefore.plus(scheduledAllocated).toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
      contractualInterestTotal,
    ).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const interestAllocated = Decimal.max(
      0,
      interestPaidAfter.minus(interestPaidBefore),
    ).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const principalAllocated = Decimal.max(
      0,
      scheduledAllocated.minus(interestAllocated),
    ).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    return {
      scheduledAllocated,
      interestAllocated,
      principalAllocated,
    };
  }

  async function recordRepayment({
    loanId,
    payload,
    user,
    ipAddress,
    skipScopeCheck = false,
    source = {},
    transactionClient,
  }: {
    loanId: number;
    payload: {
      amount: number;
      note?: string;
      paymentChannel?: string;
      paymentProvider?: string;
      externalReceipt?: string;
      externalReference?: string;
      payerPhone?: string;
      clientIdempotencyKey?: string;
    };
    user?: { sub?: number | null };
    ipAddress: string | null | undefined;
    skipScopeCheck?: boolean;
    source?: {
      channel?: string;
      provider?: string | null;
      externalReceipt?: string | null;
      externalReference?: string | null;
      payerPhone?: string | null;
    };
    transactionClient?: PrismaTransactionClient;
  }) {
    const normalizedSource = {
      channel: source.channel || payload.paymentChannel || "manual",
      provider: source.provider ?? payload.paymentProvider ?? null,
      externalReceipt: source.externalReceipt ?? payload.externalReceipt ?? null,
      externalReference: source.externalReference ?? payload.externalReference ?? null,
      payerPhone: source.payerPhone ?? payload.payerPhone ?? null,
    };
    const scope = skipScopeCheck ? null : await hierarchyService.resolveHierarchyScope(user);
    const runRepaymentTx = async (tx: PrismaTransactionClient) => {
      const loan = await tx.loans.findUnique({ where: { id: loanId } });
      if (!loan) {
        throw new LoanNotFoundError();
      }
      if (!skipScopeCheck && !hierarchyService.isBranchInScope(scope, loan.branch_id)) {
        throw new ForbiddenScopeError();
      }

      const repaymentAmount = toMoneyDecimal(payload.amount || 0);
      if (repaymentAmount.lte(0)) {
        throw new DomainValidationError("Repayment amount must be greater than zero");
      }
      const repaymentAmountNumber = repaymentAmount.toNumber();
      const clientIdempotencyKey = normalizeClientIdempotencyKey(payload.clientIdempotencyKey);

      if (clientIdempotencyKey) {
        const existingIdempotencyRows = await tx.$queryRaw<Array<{
          repayment_id: number | null;
          request_amount: number | null;
        }>>`
          SELECT repayment_id, request_amount
          FROM repayment_idempotency_keys
          WHERE loan_id = ${loanId}
            AND client_idempotency_key = ${clientIdempotencyKey}
          LIMIT 1
        `;
        const existingIdempotencyRow = existingIdempotencyRows[0] || null;
        if (existingIdempotencyRow) {
          const existingAmount = toMoneyDecimal(existingIdempotencyRow.request_amount || 0);
          if (!existingAmount.equals(repaymentAmount)) {
            throw new DomainValidationError("Idempotency key has already been used with a different repayment amount");
          }
          if (Number(existingIdempotencyRow.repayment_id || 0) > 0) {
            const existingRepaymentId = Number(existingIdempotencyRow.repayment_id);
            const [existingRepayment, latestLoan] = await Promise.all([
              tx.repayments.findUnique({ where: { id: existingRepaymentId } }),
              tx.loans.findUnique({ where: { id: loanId } }),
            ]);
            return {
              repayment: existingRepayment,
              loan: latestLoan,
              repaymentId: existingRepaymentId,
              journalId: null,
              idempotentReplay: true,
              allocations: {
                penalty: Number(existingRepayment?.penalty_amount || 0),
                interest: Number(existingRepayment?.interest_amount || 0),
                principal: Number(existingRepayment?.principal_amount || 0),
              },
              overpaymentCredit: {
                amount: Number(existingRepayment?.overpayment_amount || 0),
                creditId: null,
              },
            };
          }
          throw new LoanStateConflictError("Repayment with this idempotency key is still being processed. Please retry.");
        }

        try {
          await tx.$executeRaw`
            INSERT INTO repayment_idempotency_keys (
              loan_id,
              client_idempotency_key,
              request_amount,
              created_at,
              updated_at
            )
            VALUES (
              ${loanId},
              ${clientIdempotencyKey},
              ${repaymentAmountNumber},
              ${new Date().toISOString()},
              ${new Date().toISOString()}
            )
          `;
        } catch (error) {
          if (!isUniqueConstraintError(error)) {
            throw error;
          }

          const replayRows = await tx.$queryRaw<Array<{
            repayment_id: number | null;
            request_amount: number | null;
          }>>`
            SELECT repayment_id, request_amount
            FROM repayment_idempotency_keys
            WHERE loan_id = ${loanId}
              AND client_idempotency_key = ${clientIdempotencyKey}
            LIMIT 1
          `;
          const replayRow = replayRows[0] || null;
          if (!replayRow) {
            throw new LoanStateConflictError("Repayment idempotency key is currently locked. Please retry.");
          }
          const replayAmount = toMoneyDecimal(replayRow.request_amount || 0);
          if (!replayAmount.equals(repaymentAmount)) {
            throw new DomainValidationError("Idempotency key has already been used with a different repayment amount");
          }
          if (Number(replayRow.repayment_id || 0) > 0) {
            const replayRepaymentId = Number(replayRow.repayment_id);
            const [existingRepayment, latestLoan] = await Promise.all([
              tx.repayments.findUnique({ where: { id: replayRepaymentId } }),
              tx.loans.findUnique({ where: { id: loanId } }),
            ]);
            return {
              repayment: existingRepayment,
              loan: latestLoan,
              repaymentId: replayRepaymentId,
              journalId: null,
              idempotentReplay: true,
              allocations: {
                penalty: Number(existingRepayment?.penalty_amount || 0),
                interest: Number(existingRepayment?.interest_amount || 0),
                principal: Number(existingRepayment?.principal_amount || 0),
              },
              overpaymentCredit: {
                amount: Number(existingRepayment?.overpayment_amount || 0),
                creditId: null,
              },
            };
          }
          throw new LoanStateConflictError("Repayment with this idempotency key is still being processed. Please retry.");
        }
      }

      if (!isCollectibleLoanStatus(loan.status)) {
        throw new InvalidLoanStatusError("Loan is not active or restructured", { currentStatus: loan.status, action: "repayment" });
      }

      const currentLoanBalance = toMoneyDecimal(loan.balance || 0);
      const appliedRepaymentAmount = Decimal.min(repaymentAmount, currentLoanBalance).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const overpaymentAmount = Decimal.max(0, repaymentAmount.minus(appliedRepaymentAmount)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const appliedRepaymentAmountNumber = appliedRepaymentAmount.toNumber();
      const overpaymentAmountNumber = overpaymentAmount.toNumber();

      const updatedLoanCount = await tx.$executeRaw`
        UPDATE loans
        SET
          repaid_total = ROUND(repaid_total + ${appliedRepaymentAmountNumber}, 2),
          balance = CASE
            WHEN ROUND(balance - ${appliedRepaymentAmountNumber}, 2) <= 0 THEN 0
            ELSE ROUND(balance - ${appliedRepaymentAmountNumber}, 2)
          END,
          status = CASE
            WHEN ROUND(balance - ${appliedRepaymentAmountNumber}, 2) <= 0 THEN 'closed'
            WHEN status = 'restructured' THEN 'restructured'
            ELSE 'active'
          END
        WHERE id = ${loanId}
          AND status IN ('active', 'restructured')
          AND ROUND(balance, 2) >= ${appliedRepaymentAmountNumber}
      `;

      if (Number(updatedLoanCount || 0) !== 1) {
        const latestLoan = await tx.loans.findUnique({ where: { id: loanId } });
        if (!latestLoan) {
          throw new LoanNotFoundError();
        }
        if (!isCollectibleLoanStatus(latestLoan.status)) {
          throw new InvalidLoanStatusError("Loan is not active or restructured", {
            currentStatus: latestLoan.status,
            action: "repayment",
          });
        }
        throw new LoanStateConflictError("Loan balance changed while processing repayment. Please retry.");
      }

      const updatedLoan = await tx.loans.findUnique({ where: { id: loanId } });
      if (!updatedLoan) {
        throw new LoanNotFoundError();
      }

      const penaltyAllocation = await allocatePenaltyFirst(tx, loanId, appliedRepaymentAmount);
      const scheduledAllocation = await allocateScheduledInstallments(tx, loanId, penaltyAllocation.remaining);
      await reconcileInstallmentStatuses(tx, loanId);

      const penaltyAllocatedNumber = penaltyAllocation.penaltyAllocated.toNumber();
      const interestAllocatedNumber = scheduledAllocation.interestAllocated.toNumber();
      let principalAllocatedNumber = scheduledAllocation.principalAllocated.toNumber();
      const allocationSum = new Decimal(penaltyAllocatedNumber)
        .plus(interestAllocatedNumber)
        .plus(principalAllocatedNumber)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const allocationDelta = new Decimal(appliedRepaymentAmountNumber)
        .minus(allocationSum)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      if (allocationDelta.abs().greaterThan(0)) {
        principalAllocatedNumber = toMoneyDecimal(new Decimal(principalAllocatedNumber).plus(allocationDelta)).toNumber();
      }
      const appliedAmountForRecord = toMoneyDecimal(appliedRepaymentAmountNumber).toNumber();

      const repaymentInsert = await tx.repayments.create({
        data: {
          loan_id: loanId,
          amount: repaymentAmountNumber,
          applied_amount: appliedAmountForRecord,
          penalty_amount: penaltyAllocatedNumber,
          interest_amount: interestAllocatedNumber,
          principal_amount: principalAllocatedNumber,
          overpayment_amount: overpaymentAmountNumber,
          note: payload.note || null,
          recorded_by_user_id: user?.sub || null,
          payment_channel: normalizedSource.channel,
          payment_provider: normalizedSource.provider,
          external_receipt: normalizedSource.externalReceipt,
          external_reference: normalizedSource.externalReference,
          payer_phone: normalizedSource.payerPhone,
          paid_at: new Date().toISOString(),
        },
      });

      let overpaymentCreditId: number | null = null;
      if (overpaymentAmount.greaterThan(0)) {
        await tx.$executeRaw`
          INSERT INTO loan_overpayment_credits (
            loan_id,
            client_id,
            branch_id,
            repayment_id,
            amount,
            status,
            note,
            created_at,
            updated_at
          )
          VALUES (
            ${loanId},
            ${Number(updatedLoan.client_id || 0) || null},
            ${Number(updatedLoan.branch_id || 0) || null},
            ${Number(repaymentInsert.id || 0)},
            ${overpaymentAmountNumber},
            ${"open"},
            ${payload.note || "Overpayment captured as advance credit"},
            ${new Date().toISOString()},
            ${new Date().toISOString()}
          )
        `;
        const overpaymentRows = await tx.$queryRaw<Array<{ id: number }>>`
          SELECT id
          FROM loan_overpayment_credits
          WHERE repayment_id = ${Number(repaymentInsert.id || 0)}
          LIMIT 1
        `;
        overpaymentCreditId = Number(overpaymentRows[0]?.id || 0) || null;
      }

      if (clientIdempotencyKey) {
        await tx.$executeRaw`
          UPDATE repayment_idempotency_keys
          SET repayment_id = ${Number(repaymentInsert.id || 0)},
              updated_at = ${new Date().toISOString()}
          WHERE loan_id = ${loanId}
            AND client_idempotency_key = ${clientIdempotencyKey}
        `;
      }

      if (appliedRepaymentAmount.greaterThan(0)) {
        await tx.transactions.create({
          data: {
            loan_id: updatedLoan.id,
            client_id: updatedLoan.client_id,
            branch_id: updatedLoan.branch_id,
            tx_type: "repayment",
            amount: appliedRepaymentAmountNumber,
            note: payload.note || "Loan repayment",
            occurred_at: new Date().toISOString(),
          },
        });
      }

      if (overpaymentAmount.greaterThan(0)) {
        await tx.transactions.create({
          data: {
            loan_id: updatedLoan.id,
            client_id: updatedLoan.client_id,
            branch_id: updatedLoan.branch_id,
            tx_type: "repayment_overpayment_credit",
            amount: overpaymentAmountNumber,
            note: payload.note || "Repayment overpayment credited as advance",
            occurred_at: new Date().toISOString(),
          },
        });
      }

      const journalLines: Array<{ accountCode: string; side: "debit" | "credit"; amount: number; memo?: string | null | undefined }> = [
        {
          accountCode: generalLedgerService.ACCOUNT_CODES.CASH ?? "",
          side: "debit",
          amount: repaymentAmountNumber,
          memo: "Cash received",
        },
      ];
      if (appliedRepaymentAmount.greaterThan(0)) {
        journalLines.push({
          accountCode: generalLedgerService.ACCOUNT_CODES.LOAN_RECEIVABLE ?? "",
          side: "credit",
          amount: appliedRepaymentAmountNumber,
          memo: "Reduce loan receivable",
        });
      }
      if (overpaymentAmount.greaterThan(0)) {
        journalLines.push({
          accountCode: generalLedgerService.ACCOUNT_CODES.SUSPENSE_FUNDS ?? "",
          side: "credit",
          amount: overpaymentAmountNumber,
          memo: "Borrower advance credit from overpayment",
        });
      }
      const journalId = await generalLedgerService.postJournal({
        tx,
        referenceType: "loan_repayment",
        referenceId: Number(repaymentInsert.id || 0),
        loanId: updatedLoan.id,
        clientId: updatedLoan.client_id,
        branchId: updatedLoan.branch_id,
        description: "Loan repayment received",
        note: payload.note || null,
        postedByUserId: user?.sub || null,
        lines: journalLines,
      });

      return {
        repayment: await tx.repayments.findUnique({ where: { id: repaymentInsert.id } }),
        loan: await tx.loans.findUnique({ where: { id: loanId } }),
        repaymentId: repaymentInsert.id,
        journalId,
        idempotentReplay: false,
        allocations: {
          penalty: penaltyAllocatedNumber,
          interest: interestAllocatedNumber,
          principal: principalAllocatedNumber,
        },
        overpaymentCredit: {
          amount: overpaymentAmountNumber,
          creditId: overpaymentCreditId,
        },
      };
    };

    const repaymentResult = transactionClient
      ? await runRepaymentTx(transactionClient)
      : await prisma.$transaction(async (tx: any) => runRepaymentTx(tx));

    try {
      await writeAuditLog({
        userId: user?.sub || null,
        action: "loan.repayment.recorded",
        targetType: "loan",
        targetId: loanId,
        details: JSON.stringify({
          amount: payload.amount,
          repaymentId: repaymentResult.repaymentId,
          journalId: repaymentResult.journalId,
          idempotentReplay: repaymentResult.idempotentReplay,
          allocations: repaymentResult.allocations,
          overpaymentCredit: repaymentResult.overpaymentCredit,
          channel: normalizedSource.channel,
          externalReceipt: normalizedSource.externalReceipt,
          clientIdempotencyKey: normalizeClientIdempotencyKey(payload.clientIdempotencyKey),
        }),
        ipAddress: ipAddress || null,
      });
    } catch (_error) {
      // Audit logging failures should not fail repayments after commit.
    }

    try {
      await invalidateReportCaches();
    } catch (_error) {
      // Cache invalidation is best-effort for repayments.
    }


    return {
      repayment: repaymentResult.repayment,
      loan: repaymentResult.loan,
      overpaymentCredit: repaymentResult.overpaymentCredit,
    };
  }

  return {
    recordRepayment,
  };
}

export {
  createRepaymentService,
};
