import { createSqlWhereBuilder } from "../utils/sqlBuilder.js";

type DbAll = (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
type DbGet = (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;

interface ClientReadRepositoryDeps {
  all: DbAll;
  get: DbGet;
}

interface ScopeCondition {
  sql: string;
  params: unknown[];
}

interface ListClientsFilters {
  search?: string;
  branchId?: number;
  officerId?: number;
  isActive?: 0 | 1;
  kycStatus?: string;
  onboardingStatus?: string;
  feePaymentStatus?: string;
  dormantOnly?: boolean;
  scopeCondition?: ScopeCondition;
  loanOfficerUserId?: number;
  minLoans?: number | null;
  limit: number;
  offset: number;
  sortBy: "id" | "fullName" | "createdAt" | "loanCount";
  sortOrder: "asc" | "desc";
}

interface FindDuplicateCandidatesFilters {
  normalizedNationalId?: string;
  normalizedPhone?: string;
  normalizedName?: string;
  nameTokens?: string[];
  scopeCondition?: ScopeCondition;
  loanOfficerUserId?: number;
  limit: number;
}

const clientListSortColumnMap: Record<ListClientsFilters["sortBy"], string> = {
  id: "c.id",
  fullName: "c.full_name",
  createdAt: "c.created_at",
  loanCount: "loan_count",
};

function createClientReadRepository(deps: ClientReadRepositoryDeps) {
  const { all, get } = deps;

  async function listClients(filters: ListClientsFilters) {
    const where = createSqlWhereBuilder();

    if (filters.search) {
      const pattern = `%${String(filters.search).toLowerCase()}%`;
      where.addClause("(LOWER(c.full_name) LIKE ? OR LOWER(COALESCE(c.phone, '')) LIKE ? OR LOWER(COALESCE(c.national_id, '')) LIKE ?)", [pattern, pattern, pattern]);
    }

    if (Number.isInteger(filters.branchId) && Number(filters.branchId) > 0) {
      where.addEquals("c.branch_id", Number(filters.branchId));
    }

    if (Number.isInteger(filters.officerId) && Number(filters.officerId) > 0) {
      where.addClause("COALESCE(c.officer_id, c.created_by_user_id) = ?", [Number(filters.officerId)]);
    }

    if (typeof filters.isActive === "number" && (filters.isActive === 0 || filters.isActive === 1)) {
      where.addEquals("c.is_active", Number(filters.isActive));
    }

    if (filters.kycStatus) {
      where.addEquals("c.kyc_status", String(filters.kycStatus).trim().toLowerCase());
    }

    if (filters.onboardingStatus) {
      where.addEquals("c.onboarding_status", String(filters.onboardingStatus).trim().toLowerCase());
    }

    if (filters.feePaymentStatus) {
      where.addEquals("c.fee_payment_status", String(filters.feePaymentStatus).trim().toLowerCase());
    }

    if (filters.scopeCondition?.sql) {
      where.addCondition(filters.scopeCondition);
    }

    if (Number.isInteger(filters.loanOfficerUserId) && Number(filters.loanOfficerUserId) > 0) {
      where.addClause("COALESCE(c.officer_id, c.created_by_user_id) = ?", [Number(filters.loanOfficerUserId)]);
    }

    const whereSql = where.buildWhere();
    const queryParams = where.getParams();
    const havingClauses: string[] = [];
    const havingParams: unknown[] = [];

    if (filters.minLoans != null) {
      havingClauses.push("COUNT(l.id) >= ?");
      havingParams.push(filters.minLoans);
    }

    if (filters.dormantOnly) {
      havingClauses.push("SUM(CASE WHEN l.status = 'closed' THEN 1 ELSE 0 END) >= 1");
      havingClauses.push("SUM(CASE WHEN l.status IN ('active', 'restructured', 'pending_approval', 'approved') THEN 1 ELSE 0 END) = 0");
    }

    const havingSql = havingClauses.length > 0 ? `HAVING ${havingClauses.join(" AND ")}` : "";
    const paramsWithHaving = [...queryParams, ...havingParams];
    const sortColumn = clientListSortColumnMap[filters.sortBy] || clientListSortColumnMap.id;
    const sortOrder = filters.sortOrder === "asc" ? "ASC" : "DESC";

    const rows = await all(
      `
        SELECT
          c.*,
          MAX(b.name) AS branch_name,
          MAX(COALESCE(c.officer_id, c.created_by_user_id)) AS assigned_officer_id,
          MAX(COALESCE(officer.full_name, creator.full_name)) AS assigned_officer_name,
          COUNT(l.id) AS loan_count,
          SUM(CASE WHEN l.status = 'closed' THEN 1 ELSE 0 END) AS closed_loan_count,
          SUM(CASE WHEN l.status IN ('active', 'restructured', 'pending_approval', 'approved') THEN 1 ELSE 0 END) AS open_loan_count
        FROM clients c
        LEFT JOIN branches b ON b.id = c.branch_id
        LEFT JOIN users officer ON officer.id = c.officer_id
        LEFT JOIN users creator ON creator.id = c.created_by_user_id
        LEFT JOIN loans l ON l.client_id = c.id
        ${whereSql}
        GROUP BY c.id
        ${havingSql}
        ORDER BY ${sortColumn} ${sortOrder}, c.id DESC
        LIMIT ? OFFSET ?
      `,
      [...paramsWithHaving, filters.limit, filters.offset],
    );

    const totalRow = await get(
      `
        SELECT COUNT(*) AS total
        FROM (
          SELECT c.id
          FROM clients c
          LEFT JOIN branches b ON b.id = c.branch_id
          LEFT JOIN loans l ON l.client_id = c.id
          ${whereSql}
          GROUP BY c.id
          ${havingSql}
        ) filtered
      `,
      paramsWithHaving,
    );

    return {
      rows,
      total: Number(totalRow?.total || 0),
    };
  }

  async function findPotentialDuplicateCandidates(filters: FindDuplicateCandidatesFilters) {
    const where = createSqlWhereBuilder();
    const matchClauses: string[] = [];
    const matchParams: unknown[] = [];

    if (filters.normalizedNationalId) {
      matchClauses.push("REPLACE(REPLACE(LOWER(TRIM(COALESCE(c.national_id, ''))), ' ', ''), '-', '') LIKE ?");
      matchParams.push(`%${filters.normalizedNationalId}%`);
    }

    if (filters.normalizedPhone) {
      matchClauses.push(
        "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(COALESCE(c.phone, '')), ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), '.', '') LIKE ?",
      );
      matchParams.push(`%${filters.normalizedPhone}%`);
    }

    if (filters.normalizedName) {
      matchClauses.push("LOWER(TRIM(COALESCE(c.full_name, ''))) LIKE ?");
      matchParams.push(`%${filters.normalizedName}%`);
      for (const token of (filters.nameTokens || []).slice(0, 3)) {
        matchClauses.push("LOWER(TRIM(COALESCE(c.full_name, ''))) LIKE ?");
        matchParams.push(`%${token}%`);
      }
    }

    if (matchClauses.length > 0) {
      where.addClause(`(${matchClauses.join(" OR ")})`, matchParams);
    }

    if (filters.scopeCondition?.sql) {
      where.addCondition(filters.scopeCondition);
    }

    if (Number.isInteger(filters.loanOfficerUserId) && Number(filters.loanOfficerUserId) > 0) {
      where.addClause("COALESCE(c.officer_id, c.created_by_user_id) = ?", [Number(filters.loanOfficerUserId)]);
    }

    const whereSql = where.buildWhere();
    const queryParams = where.getParams();
    const fetchLimit = Math.max(1, Number(filters.limit || 25)) * 4;

    return all(
      `
        SELECT
          c.id,
          c.full_name,
          c.phone,
          c.national_id,
          c.is_active,
          c.branch_id,
          c.created_at,
          c.updated_at,
          c.officer_id,
          c.created_by_user_id,
          b.name AS branch_name
        FROM clients c
        LEFT JOIN branches b ON b.id = c.branch_id
        ${whereSql}
        ORDER BY c.updated_at DESC, c.id DESC
        LIMIT ?
      `,
      [...queryParams, fetchLimit],
    );
  }

  return {
    listClients,
    findPotentialDuplicateCandidates,
  };
}

export {
  createClientReadRepository,
};
