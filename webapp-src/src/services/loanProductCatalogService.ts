import { normalizeLoanProductPricingStrategy } from "./loanProductPricing.js";

type LoanProductCatalogServiceDeps = {
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  createHttpError: (status: number, message: string) => Error & { status: number };
};

type LoanProductSelectionPayload = {
  productId?: number;
};

type LoanProductCatalogService = {
  getDefaultLoanProduct: () => Promise<Record<string, any> | null | undefined>;
  getLoanProductById: (productId: number) => Promise<Record<string, any> | null | undefined>;
  resolveLoanProduct: (payload: LoanProductSelectionPayload) => Promise<Record<string, any>>;
};

function createLoanProductCatalogService(deps: LoanProductCatalogServiceDeps): LoanProductCatalogService {
  const { get, createHttpError } = deps;

  async function getDefaultLoanProduct() {
    return get(
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
          is_active
        FROM loan_products
        WHERE is_active = 1
        ORDER BY id ASC
        LIMIT 1
      `,
    );
  }

  async function getLoanProductById(productId: number) {
    return get(
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
          is_active
        FROM loan_products
        WHERE id = ?
      `,
      [productId],
    );
  }

  async function resolveLoanProduct(payload: LoanProductSelectionPayload) {
    if (payload.productId) {
      const selectedProduct = await getLoanProductById(payload.productId);
      if (!selectedProduct) {
        throw createHttpError(404, "Loan product not found");
      }
      if (Number(selectedProduct.is_active || 0) !== 1) {
        throw createHttpError(400, "Selected loan product is inactive");
      }
      selectedProduct.pricing_strategy = normalizeLoanProductPricingStrategy(selectedProduct.pricing_strategy);
      return selectedProduct;
    }

    const defaultProduct = await getDefaultLoanProduct();
    if (!defaultProduct) {
      throw createHttpError(400, "No active loan products are configured");
    }
    defaultProduct.pricing_strategy = normalizeLoanProductPricingStrategy(defaultProduct.pricing_strategy);
    return defaultProduct;
  }

  return {
    getDefaultLoanProduct,
    getLoanProductById,
    resolveLoanProduct,
  };
}

export {
  createLoanProductCatalogService,
};

export type {
  LoanProductCatalogService,
};
