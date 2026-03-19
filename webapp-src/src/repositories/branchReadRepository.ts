import { createSqlWhereBuilder } from "../utils/sqlBuilder.js";

type DbAll = (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
type DbGet = (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;

interface BranchReadRepositoryDeps {
  all: DbAll;
  get: DbGet;
}

interface ScopeCondition {
  sql: string;
  params: unknown[];
}

interface ListBranchesFilters {
  search?: string;
  regionId?: number;
  isActive?: number;
  scopeCondition?: ScopeCondition;
  limit: number;
  offset: number;
  sortBy: "id" | "name" | "code" | "town" | "county" | "region" | "createdAt";
  sortOrder: "asc" | "desc";
}

const branchSortColumnMap: Record<ListBranchesFilters["sortBy"], string> = {
  id: "b.id",
  name: "b.name",
  code: "b.code",
  town: "b.town",
  county: "b.county",
  region: "r.name",
  createdAt: "b.created_at",
};

function createBranchReadRepository(deps: BranchReadRepositoryDeps) {
  const { all, get } = deps;

  async function listBranches(filters: ListBranchesFilters) {
    const where = createSqlWhereBuilder();

    if (filters.search) {
      const pattern = `%${String(filters.search).toLowerCase()}%`;
      where.addClause("(LOWER(b.name) LIKE ? OR LOWER(b.town) LIKE ? OR LOWER(b.county) LIKE ? OR LOWER(b.code) LIKE ?)", [
        pattern,
        pattern,
        pattern,
        pattern,
      ]);
    }

    if (Number.isInteger(filters.regionId) && Number(filters.regionId) > 0) {
      where.addEquals("b.region_id", Number(filters.regionId));
    }

    if (filters.isActive === 0 || filters.isActive === 1) {
      where.addEquals("b.is_active", Number(filters.isActive));
    }

    if (filters.scopeCondition?.sql) {
      where.addCondition(filters.scopeCondition);
    }

    const whereSql = where.buildWhere();
    const queryParams = where.getParams();
    const sortColumn = branchSortColumnMap[filters.sortBy] || branchSortColumnMap.name;
    const sortOrder = filters.sortOrder === "desc" ? "DESC" : "ASC";

    const rows = await all(
      `
        SELECT
          b.id,
          b.name,
          b.code,
          b.location_address,
          b.county,
          b.town,
          b.contact_phone,
          b.contact_email,
          b.region_id,
          b.is_active,
          b.created_at,
          b.updated_at,
          r.name AS region_name,
          r.code AS region_code
        FROM branches b
        INNER JOIN regions r ON r.id = b.region_id
        ${whereSql}
        ORDER BY ${sortColumn} ${sortOrder}, b.id DESC
        LIMIT ? OFFSET ?
      `,
      [...queryParams, filters.limit, filters.offset],
    );

    const totalRow = await get(
      `
        SELECT COUNT(*) AS total
        FROM branches b
        INNER JOIN regions r ON r.id = b.region_id
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
    listBranches,
  };
}

export {
  createBranchReadRepository,
};
