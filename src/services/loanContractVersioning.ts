import type { PrismaTransactionClient } from "../db/prismaClient.js";
import { Decimal } from "decimal.js";

function toMoneyNumber(value: Decimal.Value): number {
  return new Decimal(value || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

function nowIso(): string {
  return new Date().toISOString();
}

async function buildLoanContractSnapshotTx(
  tx: PrismaTransactionClient,
  loanId: number,
  extra: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const loan = await (tx as any).loans.findUnique({
    where: { id: Number(loanId) },
  });

  if (!loan) {
    return {
      ...extra,
    };
  }

  const trancheSummaryRows = (await (tx as any).$queryRawUnsafe(
    `
      SELECT
        COALESCE(SUM(amount), 0) AS total_disbursed,
        COUNT(*) AS tranche_count,
        COALESCE(SUM(CASE WHEN is_final = 1 THEN 1 ELSE 0 END), 0) AS final_tranche_count
      FROM loan_disbursement_tranches
      WHERE loan_id = ?
    `,
    Number(loanId),
  )) as any[];

  const totalDisbursed = toMoneyNumber(trancheSummaryRows?.[0]?.total_disbursed || 0);

  return {
    loan,
    disbursementSummary: {
      totalDisbursed,
      remainingPrincipal: toMoneyNumber(new Decimal(loan.principal || 0).minus(totalDisbursed)),
      trancheCount: Number(trancheSummaryRows?.[0]?.tranche_count || 0),
      finalTrancheCount: Number(trancheSummaryRows?.[0]?.final_tranche_count || 0),
    },
    ...extra,
  };
}

async function recordLoanContractVersionTx(
  tx: PrismaTransactionClient,
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
  const maxVersionRows = (await (tx as any).$queryRawUnsafe(
    "SELECT MAX(version_number) AS max_version FROM loan_contract_versions WHERE loan_id = ?",
    Number(options.loanId),
  )) as any[];
  const versionNumber = Number(maxVersionRows?.[0]?.max_version || 0) + 1;

  await (tx as any).$executeRawUnsafe(
    `
      INSERT INTO loan_contract_versions (
        loan_id,
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
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
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
  );

  return versionNumber;
}

export {
  buildLoanContractSnapshotTx,
  recordLoanContractVersionTx,
};
