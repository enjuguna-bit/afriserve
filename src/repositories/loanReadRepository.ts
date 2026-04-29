import { getCurrentTenantId } from "../utils/tenantStore.js";
import { createSqlWhereBuilder } from "../utils/sqlBuilder.js";

type DbAll = (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
type DbGet = (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;

interface LoanReadRepositoryDeps {
  all: DbAll;
  get: DbGet;
}

interface ScopeCondition {
  sql: string;
  params: unknown[];
}

interface ListLoansFilters {
  status?: string;
  statusGroup?: "active_portfolio";
  workflowStage?: "arrears";
  loanId?: number;
  clientId?: number;
  branchId?: number;
  officerId?: number;
  search?: string;
  scopeCondition?: ScopeCondition;
  limit: number;
  offset: number;
  sortBy: "id" | "disbursedAt" | "clientId" | "principal" | "expectedTotal" | "balance" | "repaidTotal" | "status" | "branchCode" | "officerName";
  sortOrder: "asc" | "desc";
}

interface ListMyPendingLoansFilters {
  createdByUserId: number;
  scopeCondition?: ScopeCondition;
  limit: number;
  offset: number;
  sortBy: "id" | "createdAt" | "principal" | "status" | "client";
  sortOrder: "asc" | "desc";
}

interface ListPendingApprovalLoansFilters {
  branchId?: number;
  officerId?: number;
  dateFrom?: string;
  dateTo?: string;
  scopeCondition?: ScopeCondition;
  limit: number;
  offset: number;
  sortBy: "loanId" | "submittedAt" | "clientName" | "principal" | "expectedTotal" | "branchCode" | "officerName" | "createdByName";
  sortOrder: "asc" | "desc";
}

interface ListLoanInstallmentsFilters {
  loanId: number;
  status?: string;
}

interface LoanStatementSummaryRow {
  total_installments: number;
  paid_installments: number;
  overdue_installments: number;
  total_due: number;
  total_paid: number;
  total_outstanding: number;
}

interface LoanRepaymentSummaryRow {
  repayment_count: number;
  total_repayments: number;
  total_applied: number;
  first_repayment_at: string | null;
  last_repayment_at: string | null;
}

const loanListSortColumnMap: Record<ListLoansFilters["sortBy"], string> = {
  id: "l.id",
  disbursedAt: "l.disbursed_at",
  clientId: "l.client_id",
  principal: "l.principal",
  expectedTotal: "l.expected_total",
  balance: "l.balance",
  repaidTotal: "l.repaid_total",
  status: "l.status",
  branchCode: "b.code",
  officerName: "u.full_name",
};

const myPendingSortColumnMap: Record<ListMyPendingLoansFilters["sortBy"], string> = {
  id: "l.id",
  createdAt: "l.created_at",
  principal: "l.principal",
  status: "l.status",
  client: "c.full_name",
};

const pendingApprovalSortColumnMap: Record<ListPendingApprovalLoansFilters["sortBy"], string> = {
  loanId: "l.id",
  submittedAt: "l.created_at",
  clientName: "c.full_name",
  principal: "l.principal",
  expectedTotal: "l.expected_total",
  branchCode: "b.code",
  officerName: "o.full_name",
  createdByName: "cb.full_name",
};

function createLoanReadRepository(deps: LoanReadRepositoryDeps) {
  const { all, get } = deps;

  async function listLoans(filters: ListLoansFilters) {
    const where = createSqlWhereBuilder();
    where.addEquals("l.tenant_id", getCurrentTenantId());

    if (filters.status) {
      where.addEquals("l.status", filters.status);
    }
    if (filters.statusGroup === "active_portfolio") {
      where.addClause("LOWER(COALESCE(l.status, '')) IN ('active', 'restructured', 'overdue')");
    }
    if (filters.workflowStage === "arrears") {
      where.addClause("LOWER(COALESCE(l.status, '')) IN ('active', 'restructured', 'overdue')");
      where.addClause("COALESCE(inst.overdue_installments, 0) > 0");
    }
    if (Number.isInteger(filters.loanId) && Number(filters.loanId) > 0) {
      where.addEquals("l.id", Number(filters.loanId));
    }
    if (Number.isInteger(filters.clientId) && Number(filters.clientId) > 0) {
      where.addEquals("l.client_id", Number(filters.clientId));
    }
    if (Number.isInteger(filters.branchId) && Number(filters.branchId) > 0) {
      where.addEquals("l.branch_id", Number(filters.branchId));
    }
    if (Number.isInteger(filters.officerId) && Number(filters.officerId) > 0) {
      where.addEquals("l.officer_id", Number(filters.officerId));
    }
    if (filters.search) {
      const pattern = `%${String(filters.search).toLowerCase()}%`;
      where.addClause(
        "(LOWER(COALESCE(c.full_name, '')) LIKE ? OR LOWER(COALESCE(u.full_name, '')) LIKE ? OR LOWER(COALESCE(b.code, '')) LIKE ? OR LOWER(COALESCE(l.external_reference, '')) LIKE ? OR CAST(l.id AS TEXT) LIKE ?)",
        [pattern, pattern, pattern, pattern, pattern],
      );
    }
    if (filters.scopeCondition?.sql) {
      where.addCondition(filters.scopeCondition);
    }

    const whereSql = where.buildWhere();
    const queryParams = where.getParams();
    const sortColumn = loanListSortColumnMap[filters.sortBy] || loanListSortColumnMap.id;
    const sortOrder = filters.sortOrder === "asc" ? "ASC" : "DESC";

    const rows = await all(
      `
        SELECT
          l.*,
          c.full_name AS client_name,
          b.code AS branch_code,
          u.full_name AS officer_name,
          p.name AS product_name,
          COALESCE(inst.total_installments, 0) AS total_installments,
          COALESCE(inst.pending_installments, 0) AS pending_installments,
          COALESCE(inst.overdue_installments, 0) AS overdue_installments,
          COALESCE(inst.paid_installments, 0) AS paid_installments,
          inst.next_due_date AS next_due_date,
          COALESCE(inst.overdue_amount, 0) AS overdue_amount,
          COALESCE(lg.guarantor_count, 0) AS guarantor_count,
          COALESCE(lc.collateral_count, 0) AS collateral_count,
          CASE
            WHEN LOWER(COALESCE(l.status, '')) = 'pending_approval' THEN 'loan_application'
            WHEN LOWER(COALESCE(l.status, '')) = 'approved' THEN 'approved_waiting_disbursement'
            WHEN LOWER(COALESCE(l.status, '')) = 'rejected' THEN 'rejected'
            WHEN LOWER(COALESCE(l.status, '')) = 'written_off' THEN 'written_off'
            WHEN LOWER(COALESCE(l.status, '')) = 'closed' THEN 'closed'
            WHEN LOWER(COALESCE(l.status, '')) IN ('active', 'restructured') AND COALESCE(inst.overdue_installments, 0) > 0 THEN 'arrears'
            WHEN LOWER(COALESCE(l.status, '')) IN ('active', 'restructured') AND COALESCE(inst.total_installments, 0) > 0 THEN 'waiting_for_dues'
            ELSE LOWER(COALESCE(l.status, ''))
          END AS workflow_stage
        FROM loans l
        INNER JOIN clients c ON c.id = l.client_id
        LEFT JOIN branches b ON b.id = l.branch_id
        LEFT JOIN users u ON u.id = l.officer_id
        LEFT JOIN loan_products p ON p.id = l.product_id
        LEFT JOIN (
          SELECT
            loan_id,
            COUNT(*) AS total_installments,
            SUM(
              CASE
                WHEN status = 'paid' THEN 0
                WHEN COALESCE(amount_due, 0) - COALESCE(amount_paid, 0) <= 0 THEN 0
                WHEN date(due_date) < date('now') OR status = 'overdue' THEN 0
                ELSE 1
              END
            ) AS pending_installments,
            SUM(
              CASE
                WHEN status = 'paid' THEN 0
                WHEN COALESCE(amount_due, 0) - COALESCE(amount_paid, 0) <= 0 THEN 0
                WHEN date(due_date) < date('now') OR status = 'overdue' THEN 1
                ELSE 0
              END
            ) AS overdue_installments,
            SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid_installments,
            MIN(
              CASE
                WHEN status = 'paid' THEN NULL
                WHEN COALESCE(amount_due, 0) - COALESCE(amount_paid, 0) <= 0 THEN NULL
                ELSE due_date
              END
            ) AS next_due_date,
            COALESCE(
              SUM(
                CASE
                  WHEN status = 'paid' THEN 0
                  WHEN COALESCE(amount_due, 0) - COALESCE(amount_paid, 0) <= 0 THEN 0
                  WHEN date(due_date) < date('now') OR status = 'overdue' THEN amount_due - amount_paid
                  ELSE 0
                END
              ),
              0
            ) AS overdue_amount
          FROM loan_installments
          GROUP BY loan_id
        ) inst ON inst.loan_id = l.id
        LEFT JOIN (
          SELECT loan_id, COUNT(*) AS guarantor_count
          FROM loan_guarantors
          GROUP BY loan_id
        ) lg ON lg.loan_id = l.id
        LEFT JOIN (
          SELECT loan_id, COUNT(*) AS collateral_count
          FROM loan_collaterals
          GROUP BY loan_id
        ) lc ON lc.loan_id = l.id
        ${whereSql}
        ORDER BY ${sortColumn} ${sortOrder}, l.id DESC
        LIMIT ? OFFSET ?
      `,
      [...queryParams, filters.limit, filters.offset],
    );

    const totalRow = await get(
      `
        SELECT COUNT(*) AS total
        FROM loans l
        INNER JOIN clients c ON c.id = l.client_id
        LEFT JOIN branches b ON b.id = l.branch_id
        LEFT JOIN users u ON u.id = l.officer_id
        LEFT JOIN (
          SELECT
            loan_id,
            SUM(
              CASE
                WHEN status = 'paid' THEN 0
                WHEN COALESCE(amount_due, 0) - COALESCE(amount_paid, 0) <= 0 THEN 0
                WHEN date(due_date) < date('now') OR status = 'overdue' THEN 1
                ELSE 0
              END
            ) AS overdue_installments
          FROM loan_installments
          GROUP BY loan_id
        ) inst ON inst.loan_id = l.id
        ${whereSql}
      `,
      queryParams,
    );

    return {
      rows,
      total: Number(totalRow?.total || 0),
    };
  }

  async function listMyPendingLoans(filters: ListMyPendingLoansFilters) {
    const where = createSqlWhereBuilder();
    where.addEquals("l.tenant_id", getCurrentTenantId());
    where.addClause("l.status IN ('pending_approval', 'approved', 'rejected')");
    where.addEquals("l.created_by_user_id", Number(filters.createdByUserId));
    if (filters.scopeCondition?.sql) {
      where.addCondition(filters.scopeCondition);
    }

    const whereSql = where.buildWhere();
    const queryParams = where.getParams();
    const sortColumn = myPendingSortColumnMap[filters.sortBy] || myPendingSortColumnMap.createdAt;
    const sortOrder = filters.sortOrder === "asc" ? "ASC" : "DESC";

    const rows = await all(
      `
        SELECT
          l.id AS loan_id,
          c.full_name AS client_name,
          l.principal,
          l.created_at AS created_at,
          l.status,
          l.rejection_reason,
          l.rejected_at,
          l.rejected_by_user_id
        FROM loans l
        INNER JOIN clients c ON c.id = l.client_id
        ${whereSql}
        ORDER BY ${sortColumn} ${sortOrder}, l.id DESC
        LIMIT ? OFFSET ?
      `,
      [...queryParams, filters.limit, filters.offset],
    );

    const totalRow = await get(
      `
        SELECT COUNT(*) AS total
        FROM loans l
        ${whereSql}
      `,
      queryParams,
    );

    return {
      rows,
      total: Number(totalRow?.total || 0),
    };
  }

  async function listPendingApprovalLoans(filters: ListPendingApprovalLoansFilters) {
    const where = createSqlWhereBuilder();
    where.addEquals("l.tenant_id", getCurrentTenantId());
    where.addClause("l.status = 'pending_approval'");

    if (Number.isInteger(filters.branchId) && Number(filters.branchId) > 0) {
      where.addEquals("l.branch_id", Number(filters.branchId));
    }
    if (Number.isInteger(filters.officerId) && Number(filters.officerId) > 0) {
      where.addEquals("l.officer_id", Number(filters.officerId));
    }
    where.addDateRange("l.created_at", filters.dateFrom, filters.dateTo);
    if (filters.scopeCondition?.sql) {
      where.addCondition(filters.scopeCondition);
    }

    const whereSql = where.buildWhere();
    const queryParams = where.getParams();
    const sortColumn = pendingApprovalSortColumnMap[filters.sortBy] || pendingApprovalSortColumnMap.submittedAt;
    const sortOrder = filters.sortOrder === "asc" ? "ASC" : "DESC";

    const rows = await all(
      `
        SELECT
          l.id AS loan_id,
          l.client_id,
          c.full_name AS client_name,
          l.principal,
          l.expected_total,
          l.balance,
          l.term_weeks,
          l.status,
          l.created_at AS submitted_at,
          l.branch_id,
          b.name AS branch_name,
          b.code AS branch_code,
          l.officer_id,
          o.full_name AS officer_name,
          l.created_by_user_id,
          cb.full_name AS created_by_name,
          COALESCE(c.fee_payment_status, 'unpaid') AS fee_payment_status,
          COALESCE(lg.guarantor_count, 0) AS guarantor_count,
          COALESCE(lc.collateral_count, 0) AS collateral_count
        FROM loans l
        INNER JOIN clients c ON c.id = l.client_id
        LEFT JOIN branches b ON b.id = l.branch_id
        LEFT JOIN users o ON o.id = l.officer_id
        LEFT JOIN users cb ON cb.id = l.created_by_user_id
        LEFT JOIN (
          SELECT loan_id, COUNT(*) AS guarantor_count
          FROM loan_guarantors
          GROUP BY loan_id
        ) lg ON lg.loan_id = l.id
        LEFT JOIN (
          SELECT loan_id, COUNT(*) AS collateral_count
          FROM loan_collaterals
          GROUP BY loan_id
        ) lc ON lc.loan_id = l.id
        ${whereSql}
        ORDER BY ${sortColumn} ${sortOrder}, l.id DESC
        LIMIT ? OFFSET ?
      `,
      [...queryParams, filters.limit, filters.offset],
    );

    const totalRow = await get(
      `
        SELECT COUNT(*) AS total
        FROM loans l
        ${whereSql}
      `,
      queryParams,
    );

    return {
      rows,
      total: Number(totalRow?.total || 0),
    };
  }

  async function listLoanInstallments(filters: ListLoanInstallmentsFilters) {
    const where = createSqlWhereBuilder();
    where.addEquals("loan_id", Number(filters.loanId));
    if (filters.status) {
      where.addEquals("status", filters.status);
    }

    return all(
      `
        SELECT
          installment_number,
          due_date,
          amount_due,
          amount_paid,
          status,
          paid_at
        FROM loan_installments
        ${where.buildWhere()}
        ORDER BY installment_number ASC
      `,
      where.getParams(),
    );
  }

  async function getLoanStatementDetails(loanId: number) {
    return get(
      `
        SELECT
          l.*,
          c.full_name AS client_name,
          c.phone AS client_phone,
          c.branch_id AS client_branch_id,
          b.name AS branch_name,
          b.code AS branch_code,
          o.full_name AS officer_name,
          cb.full_name AS created_by_name,
          ab.full_name AS approved_by_name
        FROM loans l
        INNER JOIN clients c ON c.id = l.client_id
        LEFT JOIN branches b ON b.id = l.branch_id
        LEFT JOIN users o ON o.id = l.officer_id
        LEFT JOIN users cb ON cb.id = l.created_by_user_id
        LEFT JOIN users ab ON ab.id = l.approved_by_user_id
        WHERE l.id = ?
      `,
      [loanId],
    );
  }

  async function listLoanAmortizationRows(loanId: number) {
    return all(
      `
        SELECT
          id,
          installment_number,
          due_date,
          amount_due,
          amount_paid,
          ROUND(amount_due - amount_paid, 2) AS amount_outstanding,
          status,
          paid_at
        FROM loan_installments
        WHERE loan_id = ?
        ORDER BY installment_number ASC
      `,
      [loanId],
    );
  }

  async function listLoanRepaymentsDetailed(loanId: number) {
    return all(
      `
        SELECT
          r.id,
          r.loan_id,
          r.amount,
          r.applied_amount,
          r.penalty_amount,
          r.interest_amount,
          r.principal_amount,
          r.overpayment_amount,
          r.paid_at,
          r.note,
          r.payment_channel,
          r.payment_provider,
          r.external_receipt,
          r.external_reference,
          r.payer_phone,
          r.recorded_by_user_id,
          u.full_name AS recorded_by_name
        FROM repayments r
        LEFT JOIN users u ON u.id = r.recorded_by_user_id
        WHERE r.loan_id = ?
        ORDER BY r.id DESC
      `,
      [loanId],
    );
  }

  async function getLoanStatementInstallmentSummary(loanId: number): Promise<LoanStatementSummaryRow> {
    const row = await get(
      `
        SELECT
          COUNT(*) AS total_installments,
          SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid_installments,
          SUM(
            CASE
              WHEN status = 'paid' THEN 0
              WHEN COALESCE(amount_due, 0) - COALESCE(amount_paid, 0) <= 0 THEN 0
              WHEN date(due_date) < date('now') OR status = 'overdue' THEN 1
              ELSE 0
            END
          ) AS overdue_installments,
          COALESCE(SUM(amount_due), 0) AS total_due,
          COALESCE(SUM(amount_paid), 0) AS total_paid,
          COALESCE(SUM(amount_due - amount_paid), 0) AS total_outstanding
        FROM loan_installments
        WHERE loan_id = ?
      `,
      [loanId],
    );
    return {
      total_installments: Number(row?.total_installments || 0),
      paid_installments: Number(row?.paid_installments || 0),
      overdue_installments: Number(row?.overdue_installments || 0),
      total_due: Number(row?.total_due || 0),
      total_paid: Number(row?.total_paid || 0),
      total_outstanding: Number(row?.total_outstanding || 0),
    };
  }

  async function getLoanRepaymentSummary(loanId: number): Promise<LoanRepaymentSummaryRow> {
    const row = await get(
      `
        SELECT
          COUNT(*) AS repayment_count,
          COALESCE(SUM(amount), 0) AS total_repayments,
          COALESCE(SUM(COALESCE(applied_amount, amount)), 0) AS total_applied,
          MIN(paid_at) AS first_repayment_at,
          MAX(paid_at) AS last_repayment_at
        FROM repayments
        WHERE loan_id = ?
      `,
      [loanId],
    );
    return {
      repayment_count: Number(row?.repayment_count || 0),
      total_repayments: Number(row?.total_repayments || 0),
      total_applied: Number(row?.total_applied || 0),
      first_repayment_at: row?.first_repayment_at ? String(row.first_repayment_at) : null,
      last_repayment_at: row?.last_repayment_at ? String(row.last_repayment_at) : null,
    };
  }

  async function getLoanScheduleDetails(loanId: number) {
    return get(
      `
        SELECT id, client_id, branch_id, expected_total, balance, status
        FROM loans
        WHERE id = ?
      `,
      [loanId],
    );
  }

  async function getLoanScheduleTotals(loanId: number) {
    return get(
      `
        SELECT
          COUNT(*) AS total_installments,
          SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid_installments,
          SUM(
            CASE
              WHEN status = 'paid' THEN 0
              WHEN COALESCE(amount_due, 0) - COALESCE(amount_paid, 0) <= 0 THEN 0
              WHEN date(due_date) < date('now') OR status = 'overdue' THEN 1
              ELSE 0
            END
          ) AS overdue_installments,
          COALESCE(SUM(amount_due), 0) AS total_due,
          COALESCE(SUM(amount_paid), 0) AS total_paid
        FROM loan_installments
        WHERE loan_id = ?
      `,
      [loanId],
    );
  }

  return {
    listLoans,
    listMyPendingLoans,
    listPendingApprovalLoans,
    listLoanInstallments,
    getLoanStatementDetails,
    listLoanAmortizationRows,
    listLoanRepaymentsDetailed,
    getLoanStatementInstallmentSummary,
    getLoanRepaymentSummary,
    getLoanScheduleDetails,
    getLoanScheduleTotals,
  };
}

export {
  createLoanReadRepository,
};


