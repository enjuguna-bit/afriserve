import { createSqlWhereBuilder } from "../utils/sqlBuilder.js";

type DbAll = (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;

interface LoanApprovalRequestReadRepositoryDeps {
  all: DbAll;
}

interface ListApprovalRequestsFilters {
  status: "pending" | "approved" | "rejected" | "cancelled" | "expired";
  requestType?: "loan_restructure" | "loan_write_off" | "loan_top_up" | "loan_refinance" | "loan_term_extension";
  loanId?: number;
}

function createLoanApprovalRequestReadRepository(deps: LoanApprovalRequestReadRepositoryDeps) {
  const { all } = deps;

  async function listApprovalRequests(filters: ListApprovalRequestsFilters) {
    const where = createSqlWhereBuilder();
    where.addEquals("ar.status", filters.status);

    if (filters.requestType) {
      where.addEquals("ar.request_type", filters.requestType);
    }

    if (Number.isInteger(filters.loanId) && Number(filters.loanId) > 0) {
      where.addEquals("ar.loan_id", Number(filters.loanId));
    }

    const rows = await all(
      `
        SELECT
          ar.id,
          ar.request_type,
          ar.target_type,
          ar.target_id,
          ar.loan_id,
          l.status AS loan_status,
          l.principal AS loan_principal,
          ar.branch_id,
          b.name AS branch_name,
          b.code AS branch_code,
          c.id AS client_id,
          c.full_name AS client_name,
          ar.requested_by_user_id,
          maker.full_name AS requested_by_name,
          ar.checker_user_id,
          checker.full_name AS checker_name,
          ar.status,
          CASE
            WHEN ar.executed_at IS NOT NULL THEN 'executed'
            WHEN ar.status = 'approved' THEN 'awaiting_execution'
            WHEN ar.status = 'rejected' THEN 'rejected'
            WHEN ar.status = 'cancelled' THEN 'cancelled'
            WHEN ar.status = 'expired' THEN 'expired'
            ELSE 'pending'
          END AS execution_state,
          ar.request_payload,
          ar.request_note,
          ar.review_note,
          ar.requested_at,
          ar.reviewed_at,
          ar.approved_at,
          ar.rejected_at,
          ar.executed_at,
          ar.expires_at,
          ar.created_at,
          ar.updated_at
        FROM approval_requests ar
        INNER JOIN loans l ON l.id = ar.loan_id
        LEFT JOIN clients c ON c.id = l.client_id
        LEFT JOIN branches b ON b.id = ar.branch_id
        INNER JOIN users maker ON maker.id = ar.requested_by_user_id
        LEFT JOIN users checker ON checker.id = ar.checker_user_id
        ${where.buildWhere()}
        ORDER BY ar.id DESC
      `,
      where.getParams(),
    );

    return rows;
  }

  return {
    listApprovalRequests,
  };
}

export {
  createLoanApprovalRequestReadRepository,
};
