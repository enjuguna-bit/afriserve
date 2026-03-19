import { Decimal } from "decimal.js";
import { prisma } from "../../../db/prismaClient.js";
import { ForbiddenScopeError, LoanNotFoundError } from "../../../domain/errors.js";
import { moneyToNumber } from "../shared/helpers.js";
import type { LoanLifecycleDeps } from "../shared/types.js";

type AllFn = (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;

export async function getDisbursementTranches(
  deps: Pick<LoanLifecycleDeps, "all" | "hierarchyService">,
  args: { loanId: number; user: { sub?: number; role?: string } },
): Promise<Record<string, any>> {
  const { hierarchyService } = deps;
  const allFn: AllFn = deps.all ?? (async () => []);
  const { loanId, user } = args;

  const scope = await hierarchyService.resolveHierarchyScope(user);
  const loan = await prisma.loans.findUnique({
    where: { id: loanId },
    select: { id: true, branch_id: true, principal: true },
  });
  if (!loan) throw new LoanNotFoundError();
  if (!hierarchyService.isBranchInScope(scope, loan.branch_id)) throw new ForbiddenScopeError();

  const rows = await allFn(
    `SELECT id, tranche_number, amount, disbursed_at, disbursed_by_user_id, note, is_final, created_at
     FROM loan_disbursement_tranches WHERE loan_id = ? ORDER BY tranche_number ASC, id ASC`,
    [loanId],
  );
  const totalDisbursed = rows.reduce((s, r) => s + Number(r.amount || 0), 0);

  return {
    loanId,
    approvedPrincipal: Number(loan.principal || 0),
    totalDisbursed: moneyToNumber(totalDisbursed),
    remainingPrincipal: moneyToNumber(new Decimal(loan.principal || 0).minus(totalDisbursed)),
    tranches: rows.map((r) => ({
      id: Number(r.id),
      tranche_number: Number(r.tranche_number || 0),
      amount: Number(r.amount || 0),
      disbursed_at: r.disbursed_at,
      disbursed_by_user_id: Number(r.disbursed_by_user_id || 0) || null,
      note: r.note || null,
      is_final: Number(r.is_final || 0) === 1,
      created_at: r.created_at,
    })),
  };
}

export async function getLoanContractVersions(
  deps: Pick<LoanLifecycleDeps, "all" | "hierarchyService">,
  args: { loanId: number; user: { sub?: number; role?: string } },
): Promise<Record<string, any>> {
  const { hierarchyService } = deps;
  const allFn: AllFn = deps.all ?? (async () => []);
  const { loanId, user } = args;

  const scope = await hierarchyService.resolveHierarchyScope(user);
  const loan = await prisma.loans.findUnique({
    where: { id: loanId },
    select: { id: true, branch_id: true },
  });
  if (!loan) throw new LoanNotFoundError();
  if (!hierarchyService.isBranchInScope(scope, loan.branch_id)) throw new ForbiddenScopeError();

  const rows = await allFn(
    `SELECT id, version_number, event_type, principal, interest_rate, term_weeks, expected_total,
            repaid_total, balance, snapshot_json, note, created_by_user_id, created_at
     FROM loan_contract_versions WHERE loan_id = ? ORDER BY version_number ASC, id ASC`,
    [loanId],
  );

  return {
    loanId,
    versions: rows.map((r) => ({
      id: Number(r.id),
      version_number: Number(r.version_number || 0),
      event_type: String(r.event_type || ""),
      principal: Number(r.principal || 0),
      interest_rate: Number(r.interest_rate || 0),
      term_weeks: Number(r.term_weeks || 0),
      expected_total: Number(r.expected_total || 0),
      repaid_total: Number(r.repaid_total || 0),
      balance: Number(r.balance || 0),
      snapshot: (() => {
        const raw = String(r.snapshot_json || "").trim();
        if (!raw) return null;
        try { return JSON.parse(raw); } catch { return raw; }
      })(),
      note: r.note || null,
      created_by_user_id: Number(r.created_by_user_id || 0) || null,
      created_at: r.created_at,
    })),
  };
}
