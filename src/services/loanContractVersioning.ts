import type { DbTransactionContext } from "../types/dataLayer.js";
import type { PrismaTransactionClient } from "../db/prismaClient.js";
import { Decimal } from "decimal.js";

// Raw-SQL transaction context — matches DbTransactionContext (run/get/all).
// Using DbTransactionContext directly removes the PrismaTransactionClient coupling.
type RawTxCtx = Pick<DbTransactionContext, "run" | "get">;
type TxCtx = RawTxCtx | PrismaTransactionClient;

function isRawTxCtx(tx: TxCtx): tx is RawTxCtx {
  return typeof (tx as RawTxCtx).get === "function" && typeof (tx as RawTxCtx).run === "function";
}

function toMoneyNumber(value: Decimal.Value): number {
  return new Decimal(value || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Builds a point-in-time snapshot of a loan's contract state for audit versioning.
 * Uses raw SQL via the injected transaction context — no Prisma dependency.
 */
async function buildLoanContractSnapshotTx(
  tx: TxCtx,
  loanId: number,
  extra: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  if (isRawTxCtx(tx)) {
    const loan = await tx.get("SELECT * FROM loans WHERE id = ?", [Number(loanId)]);

    if (!loan) {
      return { ...extra };
    }

    const [trancheAggRow, finalTrancheRow] = await Promise.all([
      tx.get(
        `SELECT COALESCE(SUM(amount), 0) AS total_amount, COUNT(*) AS total_count
         FROM loan_disbursement_tranches WHERE loan_id = ?`,
        [Number(loanId)],
      ),
      tx.get(
        `SELECT COUNT(*) AS total FROM loan_disbursement_tranches WHERE loan_id = ? AND is_final = 1`,
        [Number(loanId)],
      ),
    ]);

    const totalDisbursed = toMoneyNumber(trancheAggRow?.["total_amount"] || 0);

    return {
      loan,
      disbursementSummary: {
        totalDisbursed,
        remainingPrincipal: toMoneyNumber(new Decimal(loan["principal"] || 0).minus(totalDisbursed)),
        trancheCount: Number(trancheAggRow?.["total_count"] || 0),
        finalTrancheCount: Number(finalTrancheRow?.["total"] || 0),
      },
      ...extra,
    };
  }

  const prismaTx = tx as any;
  const loan = await prismaTx.loans.findUnique({
    where: { id: Number(loanId) },
  });

  if (!loan) {
    return { ...extra };
  }

  const [trancheAggregate, finalTrancheCount] = await Promise.all([
    prismaTx.loan_disbursement_tranches.aggregate({
      where: { loan_id: Number(loanId) },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prismaTx.loan_disbursement_tranches.count({
      where: { loan_id: Number(loanId), is_final: 1 },
    }),
  ]);

  const totalDisbursed = toMoneyNumber(trancheAggregate?._sum?.amount || 0);

  return {
    loan,
    disbursementSummary: {
      totalDisbursed,
      remainingPrincipal: toMoneyNumber(new Decimal(loan.principal || 0).minus(totalDisbursed)),
      trancheCount: Number(trancheAggregate?._count?._all || 0),
      finalTrancheCount: Number(finalTrancheCount || 0),
    },
    ...extra,
  };
}

/**
 * Appends a new version row to loan_contract_versions inside the given transaction.
 * Uses raw SQL — no Prisma dependency.
 */
async function recordLoanContractVersionTx(
  tx: TxCtx,
  options: {
    loanId: number;
    eventType: string;
    note?: string | null;
    createdByUserId?: number | null;
    snapshotJson?: Record<string, unknown> | null;
    principal: number;
    interestRate: number;
    termWeeks: number;
    expectedTotal: number;
    repaidTotal: number;
    balance: number;
  },
): Promise<number> {
  if (isRawTxCtx(tx)) {
    const maxVersionRow = await tx.get(
      "SELECT MAX(version_number) AS max_version FROM loan_contract_versions WHERE loan_id = ?",
      [Number(options.loanId)],
    );
    const versionNumber = Number(maxVersionRow?.["max_version"] || 0) + 1;

    await tx.run(
      `INSERT INTO loan_contract_versions (
        loan_id, version_number, event_type,
        principal, interest_rate, term_weeks,
        expected_total, repaid_total, balance,
        snapshot_json, note, created_by_user_id, created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        Number(options.loanId),
        versionNumber,
        String(options.eventType || "unknown"),
        toMoneyNumber(options.principal || 0),
        Number(options.interestRate || 0),
        Number(options.termWeeks || 0),
        toMoneyNumber(options.expectedTotal || 0),
        toMoneyNumber(options.repaidTotal || 0),
        toMoneyNumber(options.balance || 0),
        options.snapshotJson ? JSON.stringify(options.snapshotJson) : null,
        options.note || null,
        Number(options.createdByUserId || 0) || null,
        nowIso(),
      ],
    );

    return versionNumber;
  }

  const prismaTx = tx as any;
  const latestVersion = await prismaTx.loan_contract_versions.findFirst({
    where: { loan_id: Number(options.loanId) },
    orderBy: [{ version_number: "desc" }],
    select: { version_number: true },
  });
  const versionNumber = Number(latestVersion?.version_number || 0) + 1;

  await prismaTx.loan_contract_versions.create({
    data: {
      loan_id: Number(options.loanId),
      version_number: versionNumber,
      event_type: String(options.eventType || "unknown"),
      principal: toMoneyNumber(options.principal || 0),
      interest_rate: Number(options.interestRate || 0),
      term_weeks: Number(options.termWeeks || 0),
      expected_total: toMoneyNumber(options.expectedTotal || 0),
      repaid_total: toMoneyNumber(options.repaidTotal || 0),
      balance: toMoneyNumber(options.balance || 0),
      snapshot_json: options.snapshotJson ? JSON.stringify(options.snapshotJson) : null,
      note: options.note || null,
      created_by_user_id: Number(options.createdByUserId || 0) || null,
      created_at: nowIso(),
    },
  });

  return versionNumber;
}

export {
  buildLoanContractSnapshotTx,
  recordLoanContractVersionTx,
};
