import { createSqlWhereBuilder } from "../utils/sqlBuilder.js";
import { getCurrentTenantId } from "../utils/tenantStore.js";

type DbAll = (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
type DbGet = (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;

interface CollectionReadRepositoryDeps {
  all: DbAll;
  get: DbGet;
}

interface ScopeCondition {
  sql: string;
  params: unknown[];
}

interface ListOverdueFilters {
  scopeCondition?: ScopeCondition;
  officerId?: number;
  minDaysOverdue: number;
  limit: number;
  offset: number;
  sortBy: "loanId" | "dueDate" | "overdueAmount" | "daysOverdue" | "clientName";
  sortOrder: "asc" | "desc";
}

interface ListCollectionActionsFilters {
  loanId?: number;
  status?: "open" | "completed" | "cancelled";
  officerId?: number;
  scopeCondition?: ScopeCondition;
  limit: number;
  offset: number;
}

const overdueSortColumnMap: Record<ListOverdueFilters["sortBy"], string> = {
  loanId: "l.id",
  dueDate: "oldest_due_date",
  overdueAmount: "overdue_amount",
  daysOverdue: "days_overdue",
  clientName: "c.full_name",
};

function createCollectionReadRepository(deps: CollectionReadRepositoryDeps) {
  const { all, get } = deps;

  async function listOverdueLoans(filters: ListOverdueFilters) {
    const where = createSqlWhereBuilder();
    where.addEquals("l.tenant_id", getCurrentTenantId());
    where.addClause("i.status != 'paid'");
    where.addClause("l.status IN ('active', 'restructured', 'overdue')");
    where.addClause("date(i.due_date) < date('now')");

    if (filters.scopeCondition?.sql) {
      where.addCondition(filters.scopeCondition);
    }

    if (Number.isInteger(filters.officerId) && Number(filters.officerId) > 0) {
      where.addEquals("l.officer_id", Number(filters.officerId));
    }

    const whereSql = where.buildWhere();
    const queryParams = where.getParams();
    const sortColumn = overdueSortColumnMap[filters.sortBy] || overdueSortColumnMap.daysOverdue;
    const sortOrder = filters.sortOrder === "asc" ? "ASC" : "DESC";

    const rows = await all(
      `
        SELECT
          l.id AS loan_id,
          l.client_id,
          c.full_name AS client_name,
          c.phone AS client_phone,
          l.balance,
          COUNT(i.id) AS overdue_installments,
          ROUND(COALESCE(SUM(i.amount_due - i.amount_paid), 0), 2) AS overdue_amount,
          MIN(i.due_date) AS oldest_due_date,
          CAST(julianday(date('now')) - julianday(date(MIN(i.due_date))) AS INTEGER) AS days_overdue,
          (
            SELECT i2.id
            FROM loan_installments i2
            WHERE i2.loan_id = l.id
              AND i2.status != 'paid'
              AND date(i2.due_date) < date('now')
            ORDER BY date(i2.due_date) ASC, i2.id ASC
            LIMIT 1
          ) AS oldest_overdue_installment_id,
          (
            SELECT COUNT(*)
            FROM collection_actions ca
            WHERE ca.loan_id = l.id AND ca.action_status = 'open'
          ) AS open_collection_actions
        FROM loans l
        INNER JOIN clients c ON c.id = l.client_id
        INNER JOIN loan_installments i ON i.loan_id = l.id
        ${whereSql}
        GROUP BY l.id, l.client_id, c.full_name, c.phone, l.balance
        HAVING CAST(julianday(date('now')) - julianday(date(MIN(i.due_date))) AS INTEGER) >= ?
        ORDER BY ${sortColumn} ${sortOrder}, l.id DESC
        LIMIT ? OFFSET ?
      `,
      [...queryParams, filters.minDaysOverdue, filters.limit, filters.offset],
    );

    const totalRow = await get(
      `
        SELECT COUNT(*) AS total
        FROM (
          SELECT l.id
          FROM loans l
          INNER JOIN loan_installments i ON i.loan_id = l.id
          ${whereSql}
          GROUP BY l.id
          HAVING CAST(julianday(date('now')) - julianday(date(MIN(i.due_date))) AS INTEGER) >= ?
        ) overdue_loans
      `,
      [...queryParams, filters.minDaysOverdue],
    );

    return {
      rows,
      total: Number(totalRow?.total || 0),
    };
  }

  async function listCollectionActions(filters: ListCollectionActionsFilters) {
    const where = createSqlWhereBuilder();
    where.addEquals("l.tenant_id", getCurrentTenantId());

    if (Number.isInteger(filters.loanId) && Number(filters.loanId) > 0) {
      where.addEquals("ca.loan_id", Number(filters.loanId));
    }

    if (filters.status) {
      where.addEquals("ca.action_status", filters.status);
    }

    if (Number.isInteger(filters.officerId) && Number(filters.officerId) > 0) {
      where.addEquals("l.officer_id", Number(filters.officerId));
    }

    if (filters.scopeCondition?.sql) {
      where.addCondition(filters.scopeCondition);
    }

    const whereSql = where.buildWhere();
    const queryParams = where.getParams();

    const rows = await all(
      `
        SELECT
          ca.id,
          ca.loan_id,
          ca.installment_id,
          ca.action_type,
          ca.action_note,
          ca.promise_date,
          ca.next_follow_up_date,
          ca.action_status,
          ca.created_by_user_id,
          ca.created_at,
          u.full_name AS created_by_name
        FROM collection_actions ca
        INNER JOIN loans l ON l.id = ca.loan_id
        LEFT JOIN users u ON u.id = ca.created_by_user_id
        ${whereSql}
        ORDER BY ca.id DESC
        LIMIT ? OFFSET ?
      `,
      [...queryParams, filters.limit, filters.offset],
    );

    const totalRow = await get(
      `
        SELECT COUNT(*) AS total
        FROM collection_actions ca
        INNER JOIN loans l ON l.id = ca.loan_id
        ${whereSql}
      `,
      queryParams,
    );

    return {
      rows,
      total: Number(totalRow?.total || 0),
    };
  }

  return {
    listOverdueLoans,
    listCollectionActions,
  };
}

export {
  createCollectionReadRepository,
};
