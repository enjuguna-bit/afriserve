import type { PrismaTransactionClient } from "../db/prismaClient.js";
import { Decimal } from "decimal.js";
import { DomainValidationError } from "../domain/errors.js";

function toMoneyNumber(value: Decimal.Value): number {
  return new Decimal(value || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

function isAmountProvided(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "string" && value.trim() === "") {
    return false;
  }
  return true;
}

interface ResolveDisbursementRequestOptions {
  approvedPrincipal: number;
  disbursedSoFar: number;
  requestedAmountInput?: unknown;
  finalDisbursement?: boolean;
}

interface ResolvedDisbursementRequest {
  requestedAmount: number;
  remainingPrincipal: number;
  isFinalDisbursement: boolean;
}

function resolveDisbursementRequest(options: ResolveDisbursementRequestOptions): ResolvedDisbursementRequest {
  const approvedPrincipal = toMoneyNumber(options.approvedPrincipal || 0);
  const disbursedSoFar = toMoneyNumber(options.disbursedSoFar || 0);
  const remainingPrincipal = toMoneyNumber(new Decimal(approvedPrincipal).minus(disbursedSoFar));

  const hasCustomAmount = isAmountProvided(options.requestedAmountInput);
  if (hasCustomAmount && !Number.isFinite(Number(options.requestedAmountInput))) {
    throw new DomainValidationError("Disbursement amount must be a valid number");
  }

  const requestedAmount = hasCustomAmount
    ? toMoneyNumber(Number(options.requestedAmountInput))
    : remainingPrincipal;

  if (requestedAmount <= 0) {
    throw new DomainValidationError("Disbursement amount must be greater than zero");
  }

  if (requestedAmount - remainingPrincipal > 0.01) {
    throw new DomainValidationError("Disbursement amount exceeds approved remaining principal");
  }

  const finalByAmount = Math.abs(remainingPrincipal - requestedAmount) <= 0.01;
  const explicitFinal = options.finalDisbursement === true;
  if (explicitFinal && !finalByAmount) {
    throw new DomainValidationError("finalDisbursement can only be true when disbursing the remaining principal");
  }

  return {
    requestedAmount,
    remainingPrincipal,
    isFinalDisbursement: explicitFinal || finalByAmount,
  };
}

interface AppendDisbursementTrancheOptions {
  tx: PrismaTransactionClient;
  loanId: number;
  amount: number;
  disbursedAt: string;
  disbursedByUserId?: number | null;
  note?: string | null;
  isFinal: boolean;
}

async function appendDisbursementTrancheTx(options: AppendDisbursementTrancheOptions): Promise<number> {
  const latestTranche = await options.tx.loan_disbursement_tranches.findFirst({
    where: { loan_id: options.loanId },
    orderBy: [
      { tranche_number: "desc" },
      { id: "desc" },
    ],
    select: { tranche_number: true },
  });
  const nextTrancheNumber = Number(latestTranche?.tranche_number || 0) + 1;

  await options.tx.loan_disbursement_tranches.create({
    data: {
      loan_id: options.loanId,
      tranche_number: nextTrancheNumber,
      amount: toMoneyNumber(options.amount || 0),
      disbursed_at: options.disbursedAt,
      disbursed_by_user_id: Number(options.disbursedByUserId || 0) || null,
      note: options.note || null,
      is_final: options.isFinal ? 1 : 0,
      created_at: options.disbursedAt,
    },
  });

  return nextTrancheNumber;
}

export {
  resolveDisbursementRequest,
  appendDisbursementTrancheTx,
};
