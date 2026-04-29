import type { RouteRegistrar } from "../../types/routeDeps.js";
import { getCurrentTenantId } from "../../utils/tenantStore.js";
import { createLoanProductReadRepository } from "../../repositories/loanProductReadRepository.js";
import {
  normalizeLoanProductPricingStrategy,
  parseGraduatedWeeklyIncomePricingConfig,
  serializeLoanProductPricingConfig,
} from "../../services/loanProductPricing.js";

type LoanProductRouteOptions = {
  app: RouteRegistrar;
  authenticate: (...args: any[]) => any;
  authorize: (...roles: string[]) => (...args: any[]) => any;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  run: (sql: string, params?: unknown[]) => Promise<{ lastID?: number; changes?: number; [key: string]: unknown }>;
  parseId: (value: unknown) => number | null;
  createLoanProductSchema: { parse: (value: unknown) => any };
  updateLoanProductSchema: { parse: (value: unknown) => any };
  writeAuditLog: (payload: Record<string, any>) => Promise<void> | void;
};

function registerLoanProductRoutes(options: LoanProductRouteOptions) {
  const {
    app,
    authenticate,
    authorize,
    all,
    get,
    run,
    parseId,
    createLoanProductSchema,
    updateLoanProductSchema,
    writeAuditLog,
  } = options;
  const loanProductReadRepository = createLoanProductReadRepository({ all });
  const DEFAULT_MIN_PRINCIPAL = 1;
  const DEFAULT_MAX_PRINCIPAL = 1_000_000;

  function normalizeInterestAccrualMethod(value: unknown) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "daily" || normalized === "daily_eod") {
      return "daily_eod";
    }
    if (normalized === "flat") {
      return "upfront";
    }
    return "upfront";
  }

  function normalizePenaltyBaseAmount(value: unknown) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "principal_outstanding") {
      return "principal_outstanding";
    }
    if (normalized === "full_balance") {
      return "full_balance";
    }
    return "installment_outstanding";
  }

  function normalizePricingFields(payload: Record<string, any>) {
    const pricingStrategy = normalizeLoanProductPricingStrategy(payload.pricingStrategy);
    const pricingConfig = serializeLoanProductPricingConfig(pricingStrategy, payload.pricingConfig);
    if (pricingStrategy === "graduated_weekly_income" && !parseGraduatedWeeklyIncomePricingConfig(payload.pricingConfig)) {
      throw new Error("A valid pricing guide is required for graduated weekly income products");
    }
    return {
      pricingStrategy,
      pricingConfig,
    };
  }

  app.get("/api/loan-products", authenticate, authorize("admin", "branch_manager", "area_manager", "loan_officer"), async (req, res, next) => {
    try {
      const canViewInactive = String(req.user?.role || "").trim().toLowerCase() === "admin";
      const includeInactive = canViewInactive && ["1", "true", "yes"].includes(String(req.query.includeInactive || "").toLowerCase());
      const products = await loanProductReadRepository.listLoanProducts({ includeInactive });
      res.status(200).json(products);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/loan-products", authenticate, authorize("admin"), async (req, res, next) => {
    try {
      const payload = createLoanProductSchema.parse(req.body || {});
      const interestAccrualMethod = normalizeInterestAccrualMethod(payload.interestAccrualMethod);
      const penaltyBaseAmount = normalizePenaltyBaseAmount(payload.penaltyBaseAmount);
      const { pricingStrategy, pricingConfig } = normalizePricingFields(payload);
      const minPrincipal = typeof payload.minPrincipal === "number" ? payload.minPrincipal : DEFAULT_MIN_PRINCIPAL;
      const maxPrincipal = typeof payload.maxPrincipal === "number" ? payload.maxPrincipal : DEFAULT_MAX_PRINCIPAL;

      if (minPrincipal > maxPrincipal) {
        res.status(400).json({ message: "minPrincipal cannot exceed maxPrincipal" });
        return;
      }

      const duplicate = await get(
        "SELECT id FROM loan_products WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND tenant_id = ?",
        [payload.name, getCurrentTenantId()],
      );
      if (duplicate) {
        res.status(409).json({ message: "A loan product with this name already exists" });
        return;
      }

      const insertResult = await run(
        `
          INSERT INTO loan_products (
            tenant_id,
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
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `,
        [
          getCurrentTenantId(),
          payload.name,
          payload.interestRate,
          interestAccrualMethod,
          payload.registrationFee,
          payload.processingFee,
          typeof payload.penaltyRateDaily === "number" ? payload.penaltyRateDaily : 0,
          typeof payload.penaltyFlatAmount === "number" ? payload.penaltyFlatAmount : 0,
          typeof payload.penaltyGraceDays === "number" ? payload.penaltyGraceDays : 0,
          typeof payload.penaltyCapAmount === "number" ? payload.penaltyCapAmount : null,
          payload.penaltyCompoundingMethod || "simple",
          penaltyBaseAmount,
          typeof payload.penaltyCapPercentOfOutstanding === "number" ? payload.penaltyCapPercentOfOutstanding : null,
          pricingStrategy,
          pricingConfig,
          minPrincipal,
          maxPrincipal,
          payload.minTermWeeks,
          payload.maxTermWeeks,
          payload.isActive === false ? 0 : 1,
        ],
      );

      const createdProduct = await get("SELECT * FROM loan_products WHERE id = ? AND tenant_id = ?", [insertResult.lastID, getCurrentTenantId()]);
      await writeAuditLog({
        userId: req.user.sub,
        action: "loan_product.created",
        targetType: "loan_product",
        targetId: insertResult.lastID,
        details: JSON.stringify({
          name: payload.name,
          interestRate: payload.interestRate,
          registrationFee: payload.registrationFee,
          processingFee: payload.processingFee,
          interestAccrualMethod,
          penaltyRateDaily: typeof payload.penaltyRateDaily === "number" ? payload.penaltyRateDaily : 0,
          penaltyFlatAmount: typeof payload.penaltyFlatAmount === "number" ? payload.penaltyFlatAmount : 0,
          penaltyGraceDays: typeof payload.penaltyGraceDays === "number" ? payload.penaltyGraceDays : 0,
          penaltyCapAmount: typeof payload.penaltyCapAmount === "number" ? payload.penaltyCapAmount : null,
          penaltyCompoundingMethod: payload.penaltyCompoundingMethod || "simple",
          penaltyBaseAmount,
          penaltyCapPercentOfOutstanding: typeof payload.penaltyCapPercentOfOutstanding === "number"
            ? payload.penaltyCapPercentOfOutstanding
            : null,
          pricingStrategy,
          minPrincipal,
          maxPrincipal,
          minTermWeeks: payload.minTermWeeks,
          maxTermWeeks: payload.maxTermWeeks,
          isActive: payload.isActive === false ? 0 : 1,
        }),
        ipAddress: req.ip,
      });

      res.status(201).json(createdProduct);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/loan-products/:id", authenticate, authorize("admin"), async (req, res, next) => {
    try {
      const productId = parseId(req.params.id);
      if (!productId) {
        res.status(400).json({ message: "Invalid loan product id" });
        return;
      }

      const payload = updateLoanProductSchema.parse(req.body || {});
      const existingProduct = await get("SELECT * FROM loan_products WHERE id = ? AND tenant_id = ?", [productId, getCurrentTenantId()]);
      if (!existingProduct) {
        res.status(404).json({ message: "Loan product not found" });
        return;
      }

      const nextMinTermWeeks = typeof payload.minTermWeeks === "number"
        ? payload.minTermWeeks
        : Number(existingProduct.min_term_weeks || 0);
      const nextMaxTermWeeks = typeof payload.maxTermWeeks === "number"
        ? payload.maxTermWeeks
        : Number(existingProduct.max_term_weeks || 0);
      const nextMinPrincipal = typeof payload.minPrincipal === "number"
        ? payload.minPrincipal
        : Number(existingProduct.min_principal || DEFAULT_MIN_PRINCIPAL);
      const nextMaxPrincipal = typeof payload.maxPrincipal === "number"
        ? payload.maxPrincipal
        : Number(existingProduct.max_principal || DEFAULT_MAX_PRINCIPAL);
      if (nextMinTermWeeks > nextMaxTermWeeks) {
        res.status(400).json({ message: "minTermWeeks cannot exceed maxTermWeeks" });
        return;
      }
      if (nextMinPrincipal > nextMaxPrincipal) {
        res.status(400).json({ message: "minPrincipal cannot exceed maxPrincipal" });
        return;
      }

      if (payload.name) {
        const duplicate = await get(
          "SELECT id FROM loan_products WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id != ? AND tenant_id = ?",
          [payload.name, productId, getCurrentTenantId()],
        );
        if (duplicate) {
          res.status(409).json({ message: "A loan product with this name already exists" });
          return;
        }
      }

      const setClauses = [];
      const updateParams = [];
      const hasPricingStrategy = typeof payload.pricingStrategy === "string";
      const hasPricingConfig = Object.prototype.hasOwnProperty.call(payload, "pricingConfig");

      if (hasPricingStrategy || hasPricingConfig) {
        const { pricingStrategy, pricingConfig } = normalizePricingFields({
          pricingStrategy: hasPricingStrategy ? payload.pricingStrategy : existingProduct.pricing_strategy,
          pricingConfig: hasPricingConfig ? payload.pricingConfig : existingProduct.pricing_config,
        });
        setClauses.push("pricing_strategy = ?");
        updateParams.push(pricingStrategy);
        setClauses.push("pricing_config = ?");
        updateParams.push(pricingConfig);
      }

      if (payload.name) {
        setClauses.push("name = ?");
        updateParams.push(payload.name);
      }
      if (typeof payload.interestRate === "number") {
        setClauses.push("interest_rate = ?");
        updateParams.push(payload.interestRate);
      }
      if (typeof payload.registrationFee === "number") {
        setClauses.push("registration_fee = ?");
        updateParams.push(payload.registrationFee);
      }
      if (typeof payload.processingFee === "number") {
        setClauses.push("processing_fee = ?");
        updateParams.push(payload.processingFee);
      }
      if (typeof payload.interestAccrualMethod === "string") {
        setClauses.push("interest_accrual_method = ?");
        updateParams.push(normalizeInterestAccrualMethod(payload.interestAccrualMethod));
      }
      if (typeof payload.penaltyRateDaily === "number") {
        setClauses.push("penalty_rate_daily = ?");
        updateParams.push(payload.penaltyRateDaily);
      }
      if (typeof payload.penaltyFlatAmount === "number") {
        setClauses.push("penalty_flat_amount = ?");
        updateParams.push(payload.penaltyFlatAmount);
      }
      if (typeof payload.penaltyGraceDays === "number") {
        setClauses.push("penalty_grace_days = ?");
        updateParams.push(payload.penaltyGraceDays);
      }
      if (typeof payload.penaltyCapAmount === "number" || payload.penaltyCapAmount === null) {
        setClauses.push("penalty_cap_amount = ?");
        updateParams.push(payload.penaltyCapAmount);
      }
      if (typeof payload.penaltyCompoundingMethod === "string") {
        setClauses.push("penalty_compounding_method = ?");
        updateParams.push(payload.penaltyCompoundingMethod);
      }
      if (typeof payload.penaltyBaseAmount === "string") {
        setClauses.push("penalty_base_amount = ?");
        updateParams.push(normalizePenaltyBaseAmount(payload.penaltyBaseAmount));
      }
      if (typeof payload.penaltyCapPercentOfOutstanding === "number" || payload.penaltyCapPercentOfOutstanding === null) {
        setClauses.push("penalty_cap_percent_of_outstanding = ?");
        updateParams.push(payload.penaltyCapPercentOfOutstanding);
      }
      if (typeof payload.minTermWeeks === "number") {
        setClauses.push("min_term_weeks = ?");
        updateParams.push(payload.minTermWeeks);
      }
      if (typeof payload.maxTermWeeks === "number") {
        setClauses.push("max_term_weeks = ?");
        updateParams.push(payload.maxTermWeeks);
      }
      if (typeof payload.minPrincipal === "number") {
        setClauses.push("min_principal = ?");
        updateParams.push(payload.minPrincipal);
      }
      if (typeof payload.maxPrincipal === "number") {
        setClauses.push("max_principal = ?");
        updateParams.push(payload.maxPrincipal);
      }
      if (typeof payload.isActive === "boolean") {
        setClauses.push("is_active = ?");
        updateParams.push(payload.isActive ? 1 : 0);
      }

      setClauses.push("updated_at = datetime('now')");
      updateParams.push(productId);

      await run(
        `
          UPDATE loan_products
          SET ${setClauses.join(", ")}
          WHERE id = ?
        `,
        updateParams,
      );

      const updatedProduct = await get("SELECT * FROM loan_products WHERE id = ? AND tenant_id = ?", [productId, getCurrentTenantId()]);
      await writeAuditLog({
        userId: req.user.sub,
        action: "loan_product.updated",
        targetType: "loan_product",
        targetId: productId,
        details: JSON.stringify(payload),
        ipAddress: req.ip,
      });

      res.status(200).json(updatedProduct);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/loan-products/:id/deactivate", authenticate, authorize("admin"), async (req, res, next) => {
    try {
      const productId = parseId(req.params.id);
      if (!productId) {
        res.status(400).json({ message: "Invalid loan product id" });
        return;
      }

      const existingProduct = await get("SELECT * FROM loan_products WHERE id = ? AND tenant_id = ?", [productId, getCurrentTenantId()]);
      if (!existingProduct) {
        res.status(404).json({ message: "Loan product not found" });
        return;
      }

      await run(
        `
          UPDATE loan_products
          SET is_active = 0, updated_at = datetime('now')
          WHERE id = ?
        `,
        [productId],
      );

      const updatedProduct = await get("SELECT * FROM loan_products WHERE id = ? AND tenant_id = ?", [productId, getCurrentTenantId()]);
      await writeAuditLog({
        userId: req.user.sub,
        action: "loan_product.deactivated",
        targetType: "loan_product",
        targetId: productId,
        details: JSON.stringify({ previousIsActive: Number(existingProduct.is_active || 0) }),
        ipAddress: req.ip,
      });

      res.status(200).json(updatedProduct);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/loan-products/:id/activate", authenticate, authorize("admin"), async (req, res, next) => {
    try {
      const productId = parseId(req.params.id);
      if (!productId) {
        res.status(400).json({ message: "Invalid loan product id" });
        return;
      }

      const existingProduct = await get("SELECT * FROM loan_products WHERE id = ? AND tenant_id = ?", [productId, getCurrentTenantId()]);
      if (!existingProduct) {
        res.status(404).json({ message: "Loan product not found" });
        return;
      }

      await run(
        `
          UPDATE loan_products
          SET is_active = 1, updated_at = datetime('now')
          WHERE id = ?
        `,
        [productId],
      );

      const updatedProduct = await get("SELECT * FROM loan_products WHERE id = ? AND tenant_id = ?", [productId, getCurrentTenantId()]);
      await writeAuditLog({
        userId: req.user.sub,
        action: "loan_product.activated",
        targetType: "loan_product",
        targetId: productId,
        details: JSON.stringify({ previousIsActive: Number(existingProduct.is_active || 0) }),
        ipAddress: req.ip,
      });

      res.status(200).json(updatedProduct);
    } catch (error) {
      next(error);
    }
  });
}

export {
  registerLoanProductRoutes,
};

