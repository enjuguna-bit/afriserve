import { createSqlWhereBuilder } from "../utils/sqlBuilder.js";

type DbAll = (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
type DbGet = (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;

interface SystemReadRepositoryDeps {
  all: DbAll;
  get: DbGet;
}

interface ScopeCondition {
  sql: string;
  params: unknown[];
}

interface TransactionFilters {
  txType?: string;
  clientId?: number;
  loanId?: number;
  scopeCondition?: ScopeCondition;
  limit: number;
  offset: number;
  sortBy: "id" | "occurredAt" | "amount" | "txType";
  sortOrder: "asc" | "desc";
}

interface AuditLogFilters {
  action?: string;
  targetType?: string;
  userId?: number;
  targetId?: number;
  dateFrom?: string;
  dateTo?: string;
  limit: number;
  offset: number;
  sortBy: "id" | "createdAt" | "userId" | "action" | "targetType" | "targetId";
  sortOrder: "asc" | "desc";
}

interface AuditTrailFilters {
  action?: string;
  userId?: number;
  dateFrom?: string;
  dateTo?: string;
  limit: number;
  offset: number;
  sortBy: "id" | "createdAt" | "userId" | "userName" | "action" | "targetType" | "targetId";
  sortOrder: "asc" | "desc";
}

interface HierarchyEventFilters {
  eventType?: string;
  scopeLevel?: string;
  regionId?: number;
  branchId?: number;
  actorUserId?: number;
  dateFrom?: string;
  dateTo?: string;
  limit: number;
  offset: number;
  sortBy: "id" | "createdAt" | "eventType" | "scopeLevel" | "regionId" | "branchId" | "actorUserId";
  sortOrder: "asc" | "desc";
}

const transactionSortColumnMap: Record<TransactionFilters["sortBy"], string> = {
  id: "t.id",
  occurredAt: "t.occurred_at",
  amount: "t.amount",
  txType: "t.tx_type",
};

const auditLogSortColumnMap: Record<AuditLogFilters["sortBy"], string> = {
  id: "al.id",
  createdAt: "al.created_at",
  userId: "al.user_id",
  action: "al.action",
  targetType: "al.target_type",
  targetId: "al.target_id",
};

const auditTrailSortColumnMap: Record<AuditTrailFilters["sortBy"], string> = {
  id: "al.id",
  createdAt: "al.created_at",
  userId: "al.user_id",
  userName: "u.full_name",
  action: "al.action",
  targetType: "al.target_type",
  targetId: "al.target_id",
};

const hierarchyEventSortColumnMap: Record<HierarchyEventFilters["sortBy"], string> = {
  id: "he.id",
  createdAt: "he.created_at",
  eventType: "he.event_type",
  scopeLevel: "he.scope_level",
  regionId: "he.region_id",
  branchId: "he.branch_id",
  actorUserId: "he.actor_user_id",
};

function createSystemReadRepository(deps: SystemReadRepositoryDeps) {
  const { all, get } = deps;

  async function listTransactions(filters: TransactionFilters) {
    const where = createSqlWhereBuilder();

    if (filters.txType) {
      where.addEquals("t.tx_type", filters.txType);
    }
    if (Number.isInteger(filters.clientId) && Number(filters.clientId) > 0) {
      where.addEquals("t.client_id", Number(filters.clientId));
    }
    if (Number.isInteger(filters.loanId) && Number(filters.loanId) > 0) {
      where.addEquals("t.loan_id", Number(filters.loanId));
    }
    if (filters.scopeCondition?.sql) {
      where.addCondition(filters.scopeCondition);
    }

    const whereSql = where.buildWhere();
    const queryParams = where.getParams();
    const sortColumn = transactionSortColumnMap[filters.sortBy] || transactionSortColumnMap.id;
    const sortOrder = filters.sortOrder === "asc" ? "ASC" : "DESC";

    const rows = await all(
      `
        SELECT
          t.id,
          t.tx_type,
          t.amount,
          t.occurred_at,
          t.note,
          c.full_name AS client_name,
          l.id AS loan_id
        FROM transactions t
        LEFT JOIN clients c ON c.id = t.client_id
        LEFT JOIN loans l ON l.id = t.loan_id
        ${whereSql}
        ORDER BY ${sortColumn} ${sortOrder}, t.id DESC
        LIMIT ? OFFSET ?
      `,
      [...queryParams, filters.limit, filters.offset],
    );

    const totalRow = await get(
      `
        SELECT COUNT(*) AS total
        FROM transactions t
        ${whereSql}
      `,
      queryParams,
    );

    return {
      rows,
      total: Number(totalRow?.total || 0),
    };
  }

  async function listAuditLogs(filters: AuditLogFilters) {
    const where = createSqlWhereBuilder();

    if (filters.action) {
      where.addClause("LOWER(al.action) = ?", [filters.action]);
    }
    if (filters.targetType) {
      where.addClause("LOWER(COALESCE(al.target_type, '')) = ?", [filters.targetType]);
    }
    if (Number.isInteger(filters.userId) && Number(filters.userId) > 0) {
      where.addEquals("al.user_id", Number(filters.userId));
    }
    if (Number.isInteger(filters.targetId) && Number(filters.targetId) > 0) {
      where.addEquals("al.target_id", Number(filters.targetId));
    }
    where.addDateRange("al.created_at", filters.dateFrom, filters.dateTo);

    const whereSql = where.buildWhere();
    const queryParams = where.getParams();
    const sortColumn = auditLogSortColumnMap[filters.sortBy] || auditLogSortColumnMap.id;
    const sortOrder = filters.sortOrder === "asc" ? "ASC" : "DESC";
    const rows = await all(
      `
        SELECT al.id, al.user_id, al.action, al.target_type, al.target_id, al.details, al.ip_address, al.created_at
        FROM audit_logs al
        ${whereSql}
        ORDER BY ${sortColumn} ${sortOrder}, al.id DESC
        LIMIT ? OFFSET ?
      `,
      [...queryParams, filters.limit, filters.offset],
    );

    const totalRow = await get(
      `
        SELECT COUNT(*) AS total
        FROM audit_logs al
        ${whereSql}
      `,
      queryParams,
    );

    return {
      rows,
      total: Number(totalRow?.total || 0),
    };
  }

  async function listAuditTrail(filters: AuditTrailFilters) {
    const where = createSqlWhereBuilder();

    if (filters.action) {
      where.addClause("LOWER(al.action) = ?", [filters.action]);
    }
    if (Number.isInteger(filters.userId) && Number(filters.userId) > 0) {
      where.addEquals("al.user_id", Number(filters.userId));
    }
    where.addDateRange("al.created_at", filters.dateFrom, filters.dateTo);

    const whereSql = where.buildWhere();
    const queryParams = where.getParams();
    const sortColumn = auditTrailSortColumnMap[filters.sortBy] || auditTrailSortColumnMap.id;
    const sortOrder = filters.sortOrder === "asc" ? "ASC" : "DESC";
    const rows = await all(
      `
        SELECT
          al.id,
          al.user_id,
          u.full_name AS user_name,
          u.email AS user_email,
          al.action,
          al.target_type,
          al.target_id,
          al.details,
          al.ip_address,
          al.created_at
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.user_id
        ${whereSql}
        ORDER BY ${sortColumn} ${sortOrder}, al.id DESC
        LIMIT ? OFFSET ?
      `,
      [...queryParams, filters.limit, filters.offset],
    );

    const totalRow = await get(
      `
        SELECT COUNT(*) AS total
        FROM audit_logs al
        ${whereSql}
      `,
      queryParams,
    );

    return {
      rows,
      total: Number(totalRow?.total || 0),
    };
  }

  async function listHierarchyEvents(filters: HierarchyEventFilters) {
    const where = createSqlWhereBuilder();

    if (filters.eventType) {
      where.addClause("LOWER(he.event_type) = ?", [filters.eventType]);
    }
    if (filters.scopeLevel) {
      where.addEquals("he.scope_level", filters.scopeLevel);
    }
    if (Number.isInteger(filters.regionId) && Number(filters.regionId) > 0) {
      where.addEquals("he.region_id", Number(filters.regionId));
    }
    if (Number.isInteger(filters.branchId) && Number(filters.branchId) > 0) {
      where.addEquals("he.branch_id", Number(filters.branchId));
    }
    if (Number.isInteger(filters.actorUserId) && Number(filters.actorUserId) > 0) {
      where.addEquals("he.actor_user_id", Number(filters.actorUserId));
    }
    where.addDateRange("he.created_at", filters.dateFrom, filters.dateTo);

    const whereSql = where.buildWhere();
    const queryParams = where.getParams();
    const sortColumn = hierarchyEventSortColumnMap[filters.sortBy] || hierarchyEventSortColumnMap.id;
    const sortOrder = filters.sortOrder === "asc" ? "ASC" : "DESC";
    const rows = await all(
      `
        SELECT
          he.id,
          he.event_type,
          he.scope_level,
          he.region_id,
          r.name AS region_name,
          he.branch_id,
          b.name AS branch_name,
          he.actor_user_id,
          u.full_name AS actor_user_name,
          u.email AS actor_user_email,
          he.details,
          he.created_at
        FROM hierarchy_events he
        LEFT JOIN regions r ON r.id = he.region_id
        LEFT JOIN branches b ON b.id = he.branch_id
        LEFT JOIN users u ON u.id = he.actor_user_id
        ${whereSql}
        ORDER BY ${sortColumn} ${sortOrder}, he.id DESC
        LIMIT ? OFFSET ?
      `,
      [...queryParams, filters.limit, filters.offset],
    );

    const totalRow = await get(
      `
        SELECT COUNT(*) AS total
        FROM hierarchy_events he
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
    listTransactions,
    listAuditLogs,
    listAuditTrail,
    listHierarchyEvents,
  };
}

export {
  createSystemReadRepository,
};
