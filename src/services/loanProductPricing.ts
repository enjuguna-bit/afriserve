import { Decimal } from "decimal.js";

type LoanProductPricingStrategy = "flat_rate" | "graduated_weekly_income";

type GraduatedWeeklyIncomePricingConfig = {
  principalMin: number;
  principalMax: number;
  principalStep: number;
  supportedTerms: number[];
  weeklyInterestBase: number;
  weeklyInterestRate: number;
  registrationFee: number;
  processingFee: number;
};

type LoanProductPricingResult = {
  pricingStrategy: LoanProductPricingStrategy;
  interestRate: number;
  registrationFee: number;
  processingFee: number;
  expectedTotal: number;
  scheduledRepaymentTotal: number;
  totalInterest: number;
  weeklyInterestAmount: number | null;
  installmentAmount: number | null;
};

const INITIAL_PRODUCT_GUIDE_NAME = "Initial Product Guide";

const INITIAL_PRODUCT_GUIDE_CONFIG: GraduatedWeeklyIncomePricingConfig = {
  principalMin: 3000,
  principalMax: 30000,
  principalStep: 1000,
  supportedTerms: [5, 7, 10],
  weeklyInterestBase: 50,
  weeklyInterestRate: 0.05,
  registrationFee: 200,
  processingFee: 500,
};

function roundMoney(value: number) {
  return new Decimal(value || 0)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();
}

function normalizeLoanProductPricingStrategy(value: unknown): LoanProductPricingStrategy {
  return String(value || "").trim().toLowerCase() === "graduated_weekly_income"
    ? "graduated_weekly_income"
    : "flat_rate";
}

function parseGraduatedWeeklyIncomePricingConfig(value: unknown): GraduatedWeeklyIncomePricingConfig | null {
  if (!value) {
    return null;
  }

  let parsedValue: unknown = value;
  if (typeof value === "string") {
    try {
      parsedValue = JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (!parsedValue || typeof parsedValue !== "object" || Array.isArray(parsedValue)) {
    return null;
  }

  const candidate = parsedValue as Record<string, unknown>;
  const principalMin = Number(candidate.principalMin);
  const principalMax = Number(candidate.principalMax);
  const principalStep = Number(candidate.principalStep);
  const weeklyInterestBase = Number(candidate.weeklyInterestBase);
  const weeklyInterestRate = Number(candidate.weeklyInterestRate);
  const registrationFee = Number(candidate.registrationFee);
  const processingFee = Number(candidate.processingFee);
  const supportedTerms = Array.isArray(candidate.supportedTerms)
    ? candidate.supportedTerms.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)
    : [];

  if (
    !Number.isFinite(principalMin)
    || !Number.isFinite(principalMax)
    || !Number.isFinite(principalStep)
    || !Number.isFinite(weeklyInterestBase)
    || !Number.isFinite(weeklyInterestRate)
    || !Number.isFinite(registrationFee)
    || !Number.isFinite(processingFee)
    || principalMin <= 0
    || principalMax < principalMin
    || principalStep <= 0
    || weeklyInterestBase < 0
    || weeklyInterestRate < 0
    || registrationFee < 0
    || processingFee < 0
    || supportedTerms.length === 0
  ) {
    return null;
  }

  return {
    principalMin,
    principalMax,
    principalStep,
    supportedTerms,
    weeklyInterestBase,
    weeklyInterestRate,
    registrationFee,
    processingFee,
  };
}

function serializeLoanProductPricingConfig(strategy: unknown, value: unknown): string | null {
  if (normalizeLoanProductPricingStrategy(strategy) !== "graduated_weekly_income") {
    return null;
  }

  const config = parseGraduatedWeeklyIncomePricingConfig(value);
  return config ? JSON.stringify(config) : null;
}

function calculateLoanProductPricing(args: {
  product: Record<string, any>;
  principal: number;
  termWeeks: number;
  isFirstLoan: boolean;
  calculateExpectedTotal: (principal: number, interestRate: number, termWeeks: number) => number;
}): LoanProductPricingResult {
  const { product, principal, termWeeks, isFirstLoan, calculateExpectedTotal } = args;
  const pricingStrategy = normalizeLoanProductPricingStrategy(product.pricing_strategy);

  if (pricingStrategy === "graduated_weekly_income") {
    const config = parseGraduatedWeeklyIncomePricingConfig(product.pricing_config);
    if (!config) {
      throw new Error("Loan product pricing guide is not configured correctly");
    }

    if (principal < config.principalMin || principal > config.principalMax) {
      throw new Error(
        `principal must be between ${config.principalMin} and ${config.principalMax} for the selected loan product`,
      );
    }

    if ((principal - config.principalMin) % config.principalStep !== 0) {
      throw new Error(
        `principal must increase in steps of ${config.principalStep} for the selected loan product`,
      );
    }

    if (!config.supportedTerms.includes(termWeeks)) {
      throw new Error(
        `termWeeks must be one of ${config.supportedTerms.join(", ")} for the selected loan product`,
      );
    }

    const weeklyInterestAmount = roundMoney(config.weeklyInterestBase + (principal * config.weeklyInterestRate));
    const totalInterest = roundMoney(weeklyInterestAmount * termWeeks);
    const scheduledRepaymentTotal = roundMoney(principal + totalInterest);
    const registrationFee = isFirstLoan ? roundMoney(config.registrationFee) : 0;
    const processingFee = roundMoney(config.processingFee);
    const expectedTotal = scheduledRepaymentTotal;
    const interestRate = roundMoney((totalInterest * 52 * 100) / (principal * termWeeks));

    return {
      pricingStrategy,
      interestRate,
      registrationFee,
      processingFee,
      expectedTotal,
      scheduledRepaymentTotal,
      totalInterest,
      weeklyInterestAmount,
      installmentAmount: Math.round(scheduledRepaymentTotal / termWeeks),
    };
  }

  const interestRate = Number(product.interest_rate || 0);
  const registrationFee = isFirstLoan ? roundMoney(Number(product.registration_fee || 0)) : 0;
  const processingFee = roundMoney(Number(product.processing_fee || 0));
  const scheduledRepaymentTotal = roundMoney(calculateExpectedTotal(principal, interestRate, termWeeks));
  const totalInterest = roundMoney(scheduledRepaymentTotal - principal);
  const expectedTotal = scheduledRepaymentTotal;

  return {
    pricingStrategy,
    interestRate,
    registrationFee,
    processingFee,
    expectedTotal,
    scheduledRepaymentTotal,
    totalInterest,
    weeklyInterestAmount: null,
    installmentAmount: null,
  };
}

export {
  INITIAL_PRODUCT_GUIDE_CONFIG,
  INITIAL_PRODUCT_GUIDE_NAME,
  calculateLoanProductPricing,
  normalizeLoanProductPricingStrategy,
  parseGraduatedWeeklyIncomePricingConfig,
  serializeLoanProductPricingConfig,
};

export type {
  GraduatedWeeklyIncomePricingConfig,
  LoanProductPricingResult,
  LoanProductPricingStrategy,
};
