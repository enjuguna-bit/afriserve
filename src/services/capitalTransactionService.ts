import { createSqlWhereBuilder } from "../utils/sqlBuilder.js";
import { getCurrentTenantId } from "../utils/tenantStore.js";
import { createGeneralLedgerService } from "./generalLedgerService.js";
import type { DbTransactionOptions } from "../types/dataLayer.js";

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type CapitalTransactionType = "deposit" | "withdrawal";
export type CapitalTransactionStatus = "pending" | "approved" | "rejected" | "cancelled";

export type CreateDepositPayload = {
  amount: number;
  currency?: string;
  branchId: number | null;
  submittedByUserId: number;
  submittedByRole: string;
  reference?: string | null;
  note?: string | null;
};

export type CreateWithdrawalPayload = CreateDepositPayload;

export type ApproveTransactionPayload = {
  transactionId: number;
  approvedByUserId: number;
  cashflowOverrideNote?: string | null;
};

export type RejectTransactionPayload = {
  transactionId: number;
  rejectedByUserId: number;
  reason: string;
};

export type ListTransactionsQuery = {
  branchId?: number | null;
  submittedByUserId?: number | null;
  type?: CapitalTransactionType | null;
  status?: CapitalTransactionStatus | null;
  limit?: number;
  offset?: number;
};

// â”€â”€â”€ RBAC sets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const CAPITAL_SUBMITTER_ROLES = new Set(["investor", "partner", "owner", "ceo", "admin"]);
const CAPITAL_APPROVER_ROLES  = new Set(["finance", "admin"]);

// â”€â”€â”€ GL account codes used for capital double-entry â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const GL = Object.freeze({
  CASH:               "CASH",
  CAPITAL_DEPOSIT:    "CAPITAL_DEPOSIT",
  CAPITAL_WITHDRAWAL: "CAPITAL_WITHDRAWAL",
});
const CASHFLOW_REFERENCE_FILTER_SQL = "COALESCE(j.reference_type, '') <> 'loan_disbursement_finalize'";

// â”€â”€â”€ Deps interface â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// NOTE: generalLedgerService is NOT injected â€” it has no deps and is
// instantiated directly inside the factory, exactly like all other services
// in this codebase that call postJournal.

interface TxContext {
  run: (sql: string, params?: unknown[]) => Promise<{ lastID?: number; changes?: number }>;
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
}

interface CapitalTransactionServiceDeps {
  get:  (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all:  (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  run:  (sql: string, params?: unknown[]) => Promise<{ lastID?: number; changes?: number }>;
  executeTransaction: (callback: (tx: TxContext) => Promise<any>, options?: DbTransactionOptions) => Promise<any>;
  hierarchyService: {
    buildScopeCondition: (scope: any, ref: string) => { sql: string; params: unknown[] };
    isBranchInScope:     (scope: any, branchId: number | null | undefined) => boolean;
  };
  writeAuditLog: (payload: {
    userId?:      number | null;
    action:       string;
    targetType?:  string | null;
    targetId?:    number | null;
    details?:     string | null;
  }) => Promise<void> | void;
}

// â”€â”€â”€ Factory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function createCapitalTransactionService(deps: CapitalTransactionServiceDeps) {
  const { get, all, run, executeTransaction, hierarchyService, writeAuditLog } = deps;

  // Instantiate the GL service the same way every other service does it â€”
  // directly, with no injected deps (the factory takes none).
  const glService = createGeneralLedgerService();

  // â”€â”€ Internal helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function now(): string {
    return new Date().toISOString();
  }

  function createHttpError(status: number, message: string): Error & { status: number } {
    return Object.assign(new Error(message), { status });
  }

  async function getTransactionById(transactionId: number): Promise<Record<string, any> | null | undefined> {
    return get(
      "SELECT * FROM capital_transactions WHERE id = ? AND tenant_id = ?",
      [transactionId, getCurrentTenantId()],
    );
  }

  async function getCashflowNet(branchId: number | null): Promise<number> {
    const tenantId = getCurrentTenantId();
    const row = branchId
      ? await get(
          `SELECT
             ROUND(COALESCE(SUM(CASE WHEN e.side='debit'  THEN e.amount ELSE 0 END),0),2) AS total_inflow,
             ROUND(COALESCE(SUM(CASE WHEN e.side='credit' THEN e.amount ELSE 0 END),0),2) AS total_outflow
           FROM gl_entries e
           INNER JOIN gl_accounts a ON a.id = e.account_id
           INNER JOIN gl_journals j ON j.id = e.journal_id
           WHERE a.code = 'CASH' AND j.tenant_id = ? AND j.branch_id = ? AND ${CASHFLOW_REFERENCE_FILTER_SQL}`,
          [tenantId, branchId],
        )
      : await get(
          `SELECT
             ROUND(COALESCE(SUM(CASE WHEN e.side='debit'  THEN e.amount ELSE 0 END),0),2) AS total_inflow,
             ROUND(COALESCE(SUM(CASE WHEN e.side='credit' THEN e.amount ELSE 0 END),0),2) AS total_outflow
           FROM gl_entries e
           INNER JOIN gl_accounts a ON a.id = e.account_id
           INNER JOIN gl_journals j ON j.id = e.journal_id
           WHERE a.code = 'CASH' AND j.tenant_id = ? AND ${CASHFLOW_REFERENCE_FILTER_SQL}`,
          [tenantId],
        );
    return Number((Number(row?.total_inflow || 0) - Number(row?.total_outflow || 0)).toFixed(2));
  }

  // â”€â”€ Public API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async function createDeposit(payload: CreateDepositPayload): Promise<Record<string, any>> {
    const { amount, currency = "KES", branchId, submittedByUserId, submittedByRole, reference, note } = payload;

    if (!Number.isFinite(amount) || amount <= 0) {
      throw createHttpError(400, "Deposit amount must be a positive number.");
    }
    if (!CAPITAL_SUBMITTER_ROLES.has(submittedByRole.toLowerCase())) {
      throw createHttpError(403, "Your role is not authorised to submit capital deposits.");
    }

    const cashflowNet = await getCashflowNet(branchId);
    const ts = now();

    const result = await run(
      `INSERT INTO capital_transactions
         (tenant_id, transaction_type, status, amount, currency, submitted_by_user_id, submitted_by_role,
          branch_id, cashflow_net_at_submission, reference, note, created_at, updated_at)
       VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [getCurrentTenantId(), "deposit", amount, currency.toUpperCase(), submittedByUserId, submittedByRole,
       branchId, cashflowNet, reference || null, note || null, ts, ts],
    );

    const id = result.lastID;
    await writeAuditLog({
      userId: submittedByUserId,
      action: "capital_deposit_submitted",
      targetType: "capital_transaction",
      targetId: id,
      details: `Amount: ${currency} ${amount}, branch: ${branchId ?? "org-wide"}`,
    });

    return (await getTransactionById(Number(id))) as Record<string, any>;
  }

  async function createWithdrawal(payload: CreateWithdrawalPayload): Promise<Record<string, any>> {
    const { amount, currency = "KES", branchId, submittedByUserId, submittedByRole, reference, note } = payload;

    if (!Number.isFinite(amount) || amount <= 0) {
      throw createHttpError(400, "Withdrawal amount must be a positive number.");
    }
    if (!CAPITAL_SUBMITTER_ROLES.has(submittedByRole.toLowerCase())) {
      throw createHttpError(403, "Your role is not authorised to submit withdrawal requests.");
    }

    const cashflowNet = await getCashflowNet(branchId);
    const ts = now();

    const result = await run(
      `INSERT INTO capital_transactions
         (tenant_id, transaction_type, status, amount, currency, submitted_by_user_id, submitted_by_role,
          branch_id, cashflow_net_at_submission, reference, note, created_at, updated_at)
       VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [getCurrentTenantId(), "withdrawal", amount, currency.toUpperCase(), submittedByUserId, submittedByRole,
       branchId, cashflowNet, reference || null, note || null, ts, ts],
    );

    const id = result.lastID;
    await writeAuditLog({
      userId: submittedByUserId,
      action: "capital_withdrawal_requested",
      targetType: "capital_transaction",
      targetId: id,
      details: `Amount: ${currency} ${amount}, branch: ${branchId ?? "org-wide"}, cashflow at submission: ${cashflowNet}`,
    });

    return (await getTransactionById(Number(id))) as Record<string, any>;
  }

  /**
   * Finance approves a pending capital transaction and posts the GL journal.
   *
   * Cashflow rule:
   *   â€¢ Withdrawals where net cashflow < amount are blocked UNLESS
   *     cashflowOverrideNote is supplied (finance override).
   *   â€¢ Deposits are always approvable.
   *
   * GL double-entry:
   *   â€¢ Deposit:    DR CASH  /  CR CAPITAL_DEPOSIT
   *   â€¢ Withdrawal: DR CAPITAL_WITHDRAWAL  /  CR CASH
   *
   * FIX: glService is a local instance (no injection needed).
   * FIX: postJournal returns Promise<number> â€” the journal ID directly.
   * FIX: pass run/get from the executeTransaction callback, NOT tx as a Prisma client.
   */
  async function approveTransaction(payload: ApproveTransactionPayload): Promise<Record<string, any>> {
    const { transactionId, approvedByUserId, cashflowOverrideNote } = payload;

    const tx = await getTransactionById(transactionId);
    if (!tx) throw createHttpError(404, "Capital transaction not found.");
    if (tx.status !== "pending") {
      throw createHttpError(409, `Transaction is already ${tx.status} and cannot be approved.`);
    }

    const amount   = Number(tx.amount);
    const branchId = tx.branch_id ? Number(tx.branch_id) : null;

    // â”€â”€ Cashflow guard (withdrawals only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (tx.transaction_type === "withdrawal") {
      const currentNet = await getCashflowNet(branchId);
      if (currentNet < amount && !cashflowOverrideNote?.trim()) {
        throw createHttpError(
          422,
          `Insufficient cashflow: net position is ${currentNet.toFixed(2)} but withdrawal is ` +
          `${amount.toFixed(2)}. Provide a cashflowOverrideNote to authorise the override.`,
        );
      }
    }

    const ts = now();
    let glJournalId: number | null = null;

    // â”€â”€ Post GL journal inside a DB transaction â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // executeTransaction callback receives { run, get, all } â€” raw SQLite helpers.
    // postJournal accepts run+get directly (no Prisma tx needed here).
    // postJournal returns the new journal ID as a plain number.
    await executeTransaction(async (dbTx: TxContext) => {
      const lines =
        tx.transaction_type === "deposit"
          ? [
              { accountCode: GL.CASH,            side: "debit"  as const, amount, memo: `Capital deposit #${transactionId}` },
              { accountCode: GL.CAPITAL_DEPOSIT,  side: "credit" as const, amount, memo: `Capital deposit #${transactionId}` },
            ]
          : [
              { accountCode: GL.CAPITAL_WITHDRAWAL, side: "debit"  as const, amount, memo: `Capital withdrawal #${transactionId}` },
              { accountCode: GL.CASH,               side: "credit" as const, amount, memo: `Capital withdrawal #${transactionId}` },
            ];

      // postJournal returns Promise<number> â€” the new journal's id
      const journalId = await glService.postJournal({
        run:           dbTx.run,
        get:           dbTx.get,
        referenceType: `capital_${tx.transaction_type}` as string,
        referenceId:   transactionId,
        loanId:        null,
        clientId:      null,
        branchId,
        description:   `Capital ${tx.transaction_type} â€” ${tx.currency} ${amount}`,
        note:          (tx.note as string | null) || cashflowOverrideNote || null,
        postedByUserId: approvedByUserId,
        postedAt:      ts,
        lines,
      });

      glJournalId = journalId;   // plain number, not an object
    }, { isolationLevel: "serializable" });

    // â”€â”€ Update the capital_transactions row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    await run(
      `UPDATE capital_transactions
       SET status = 'approved', approved_by_user_id = ?, approved_at = ?,
           cashflow_override_note = ?, gl_journal_id = ?, updated_at = ?
       WHERE id = ? AND tenant_id = ?`,
      [approvedByUserId, ts, cashflowOverrideNote?.trim() || null, glJournalId, ts, transactionId, getCurrentTenantId()],
    );

    await writeAuditLog({
      userId: approvedByUserId,
      action: `capital_${tx.transaction_type}_approved`,
      targetType: "capital_transaction",
      targetId: transactionId,
      details: `Amount: ${tx.currency} ${amount}, GL journal: ${glJournalId}, override: ${!!cashflowOverrideNote}`,
    });

    return (await getTransactionById(transactionId)) as Record<string, any>;
  }

  async function rejectTransaction(payload: RejectTransactionPayload): Promise<Record<string, any>> {
    const { transactionId, rejectedByUserId, reason } = payload;

    if (!reason?.trim()) throw createHttpError(400, "A rejection reason is required.");

    const tx = await getTransactionById(transactionId);
    if (!tx) throw createHttpError(404, "Capital transaction not found.");
    if (tx.status !== "pending") {
      throw createHttpError(409, `Transaction is already ${tx.status} and cannot be rejected.`);
    }

    const ts = now();
    await run(
      `UPDATE capital_transactions
       SET status = 'rejected', rejected_by_user_id = ?, rejected_at = ?,
           rejection_reason = ?, updated_at = ?
       WHERE id = ? AND tenant_id = ?`,
      [rejectedByUserId, ts, reason.trim(), ts, transactionId, getCurrentTenantId()],
    );

    await writeAuditLog({
      userId: rejectedByUserId,
      action: `capital_${tx.transaction_type}_rejected`,
      targetType: "capital_transaction",
      targetId: transactionId,
      details: `Reason: ${reason}`,
    });

    return (await getTransactionById(transactionId)) as Record<string, any>;
  }

  async function listTransactions(
    scope: any,
    filters: ListTransactionsQuery,
  ): Promise<{ data: Record<string, any>[]; total: number }> {
    const { branchId, submittedByUserId, type, status, limit = 50, offset = 0 } = filters;

    const wb = createSqlWhereBuilder();
    wb.addEquals("ct.tenant_id", getCurrentTenantId());
    wb.addCondition(hierarchyService.buildScopeCondition(scope, "ct.branch_id"));
    if (branchId)           wb.addEquals("ct.branch_id",            branchId);
    if (submittedByUserId)  wb.addEquals("ct.submitted_by_user_id", submittedByUserId);
    if (type)               wb.addEquals("ct.transaction_type",     type);
    if (status)             wb.addEquals("ct.status",               status);

    const where  = wb.buildWhere();
    const params = wb.getParams();

    const countRow = await get(`SELECT COUNT(*) AS total FROM capital_transactions ct ${where}`, params);
    const total    = Number(countRow?.total || 0);

    const rows = await all(
      `SELECT ct.*,
              u.full_name   AS submitted_by_name,
              b.name        AS branch_name,
              ab.full_name  AS approved_by_name,
              rb.full_name  AS rejected_by_name
       FROM capital_transactions ct
       LEFT JOIN users    u  ON u.id  = ct.submitted_by_user_id
       LEFT JOIN branches b  ON b.id  = ct.branch_id
       LEFT JOIN users    ab ON ab.id = ct.approved_by_user_id
       LEFT JOIN users    rb ON rb.id = ct.rejected_by_user_id
       ${where}
       ORDER BY ct.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    return { data: rows, total };
  }

  async function getCashflowPosition(branchId: number | null): Promise<{
    net: number;
    total_inflow: number;
    total_outflow: number;
    pending_withdrawals: number;
    available_after_pending: number;
  }> {
    const tenantId = getCurrentTenantId();
    const net = await getCashflowNet(branchId);

    const pendingRow = branchId
      ? await get(
          `SELECT ROUND(COALESCE(SUM(amount),0),2) AS pending
           FROM capital_transactions
           WHERE tenant_id = ? AND transaction_type='withdrawal' AND status='pending' AND branch_id=?`,
          [tenantId, branchId],
        )
      : await get(
          `SELECT ROUND(COALESCE(SUM(amount),0),2) AS pending
           FROM capital_transactions
           WHERE tenant_id = ? AND transaction_type='withdrawal' AND status='pending'`,
          [tenantId],
        );
    const pendingWithdrawals = Number(pendingRow?.pending || 0);

    const flowRow = branchId
      ? await get(
          `SELECT
             ROUND(COALESCE(SUM(CASE WHEN e.side='debit'  THEN e.amount ELSE 0 END),0),2) AS total_inflow,
             ROUND(COALESCE(SUM(CASE WHEN e.side='credit' THEN e.amount ELSE 0 END),0),2) AS total_outflow
           FROM gl_entries e
           INNER JOIN gl_accounts a ON a.id = e.account_id
           INNER JOIN gl_journals j ON j.id = e.journal_id
           WHERE a.code = 'CASH' AND j.tenant_id = ? AND j.branch_id = ? AND ${CASHFLOW_REFERENCE_FILTER_SQL}`,
          [tenantId, branchId],
        )
      : await get(
          `SELECT
             ROUND(COALESCE(SUM(CASE WHEN e.side='debit'  THEN e.amount ELSE 0 END),0),2) AS total_inflow,
             ROUND(COALESCE(SUM(CASE WHEN e.side='credit' THEN e.amount ELSE 0 END),0),2) AS total_outflow
           FROM gl_entries e
           INNER JOIN gl_accounts a ON a.id = e.account_id
           INNER JOIN gl_journals j ON j.id = e.journal_id
           WHERE a.code = 'CASH' AND j.tenant_id = ? AND ${CASHFLOW_REFERENCE_FILTER_SQL}`,
          [tenantId],
        );

    return {
      net,
      total_inflow:             Number(flowRow?.total_inflow  || 0),
      total_outflow:            Number(flowRow?.total_outflow || 0),
      pending_withdrawals:      pendingWithdrawals,
      available_after_pending:  Number((net - pendingWithdrawals).toFixed(2)),
    };
  }

  return {
    createDeposit,
    createWithdrawal,
    approveTransaction,
    rejectTransaction,
    listTransactions,
    getCashflowPosition,
    CAPITAL_SUBMITTER_ROLES,
    CAPITAL_APPROVER_ROLES,
  };
}

export type CapitalTransactionService = ReturnType<typeof createCapitalTransactionService>;
