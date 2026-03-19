type DbAll = (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;

interface LoanProductReadRepositoryDeps {
  all: DbAll;
}

function createLoanProductReadRepository(deps: LoanProductReadRepositoryDeps) {
  const { all } = deps;

  async function listLoanProducts(args: { includeInactive?: boolean } = {}) {
    const whereSql = args.includeInactive ? "" : "WHERE is_active = 1";
    return all(
      `
        SELECT
          id,
          name,
          interest_rate,
          interest_accrual_method,
          registration_fee,
          processing_fee,
          penalty_rate_daily,
          penalty_flat_amount,
          penalty_grace_days,
          penalty_cap_amount,
          penalty_compounding_method,
          penalty_base_amount,
          penalty_cap_percent_of_outstanding,
          pricing_strategy,
          pricing_config,
          min_principal,
          max_principal,
          min_term_weeks,
          max_term_weeks,
          is_active,
          created_at,
          updated_at
        FROM loan_products
        ${whereSql}
        ORDER BY id ASC
      `,
    );
  }

  return {
    listLoanProducts,
  };
}

export {
  createLoanProductReadRepository,
};
