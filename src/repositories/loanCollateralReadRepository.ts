import { getCurrentTenantId } from "../utils/tenantStore.js";
import { createSqlWhereBuilder } from "../utils/sqlBuilder.js";

type DbAll = (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
type DbGet = (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;

interface LoanCollateralReadRepositoryDeps {
  all: DbAll;
  get: DbGet;
}

interface ScopeCondition {
  sql: string;
  params: unknown[];
}

interface ListGuarantorsFilters {
  search?: string;
  scopeCondition?: ScopeCondition;
  limit: number;
  offset: number;
}

interface ListCollateralAssetsFilters {
  search?: string;
  assetType?: "chattel" | "vehicle" | "land" | "equipment" | "machinery" | "inventory" | "livestock" | "savings";
  status?: "active" | "released" | "liquidated";
  scopeCondition?: ScopeCondition;
  limit: number;
  offset: number;
}

function createLoanCollateralReadRepository(deps: LoanCollateralReadRepositoryDeps) {
  const { all, get } = deps;

  async function listGuarantors(filters: ListGuarantorsFilters) {
    const where = createSqlWhereBuilder();
    where.addEquals("g.tenant_id", getCurrentTenantId());

    if (filters.search) {
      const pattern = `%${String(filters.search).toLowerCase()}%`;
      where.addClause("(LOWER(g.full_name) LIKE ? OR LOWER(COALESCE(g.phone, '')) LIKE ? OR LOWER(COALESCE(g.national_id, '')) LIKE ?)", [pattern, pattern, pattern]);
    }

    if (filters.scopeCondition?.sql) {
      where.addCondition(filters.scopeCondition);
    }

    const whereSql = where.buildWhere();
    const queryParams = where.getParams();

    const rows = await all(
      `
        SELECT
          g.*,
          b.name AS branch_name,
          COUNT(lg.id) AS linked_loan_count
        FROM guarantors g
        LEFT JOIN branches b ON b.id = g.branch_id
        LEFT JOIN loan_guarantors lg ON lg.guarantor_id = g.id
        ${whereSql}
        GROUP BY g.id
        ORDER BY g.id DESC
        LIMIT ? OFFSET ?
      `,
      [...queryParams, filters.limit, filters.offset],
    );

    const totalRow = await get(
      `
        SELECT COUNT(*) AS total
        FROM guarantors g
        ${whereSql}
      `,
      queryParams,
    );

    return {
      rows,
      total: Number(totalRow?.total || 0),
    };
  }

  async function listCollateralAssets(filters: ListCollateralAssetsFilters) {
    const where = createSqlWhereBuilder();
    where.addEquals("ca.tenant_id", getCurrentTenantId());

    if (filters.search) {
      const pattern = `%${String(filters.search).toLowerCase()}%`;
      where.addClause(
        "(LOWER(ca.description) LIKE ? OR LOWER(COALESCE(ca.registration_number, '')) LIKE ? OR LOWER(COALESCE(ca.logbook_number, '')) LIKE ? OR LOWER(COALESCE(ca.title_number, '')) LIKE ?)",
        [pattern, pattern, pattern, pattern],
      );
    }

    if (filters.assetType) {
      where.addEquals("ca.asset_type", filters.assetType);
    }

    if (filters.status) {
      where.addEquals("ca.status", filters.status);
    }

    if (filters.scopeCondition?.sql) {
      where.addCondition(filters.scopeCondition);
    }

    const whereSql = where.buildWhere();
    const queryParams = where.getParams();

    const rows = await all(
      `
        SELECT
          ca.*,
          b.name AS branch_name,
          COUNT(lc.id) AS linked_loan_count
        FROM collateral_assets ca
        LEFT JOIN branches b ON b.id = ca.branch_id
        LEFT JOIN loan_collaterals lc ON lc.collateral_asset_id = ca.id
        ${whereSql}
        GROUP BY ca.id
        ORDER BY ca.id DESC
        LIMIT ? OFFSET ?
      `,
      [...queryParams, filters.limit, filters.offset],
    );

    const totalRow = await get(
      `
        SELECT COUNT(*) AS total
        FROM collateral_assets ca
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
    listGuarantors,
    listCollateralAssets,
  };
}

export {
  createLoanCollateralReadRepository,
};