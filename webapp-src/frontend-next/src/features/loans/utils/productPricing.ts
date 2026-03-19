import type { LoanProductRecord } from '../../../types/risk'

export type GuidePricingConfig = {
  principalMin: number
  principalMax: number
  principalStep: number
  supportedTerms: number[]
  weeklyInterestBase: number
  weeklyInterestRate: number
  registrationFee: number
  processingFee: number
}

export function parseGuidePricingConfig(product?: LoanProductRecord | null): GuidePricingConfig | null {
  if (!product || String(product.pricing_strategy || '') !== 'graduated_weekly_income' || !product.pricing_config) {
    return null
  }

  try {
    const parsed = JSON.parse(product.pricing_config) as Partial<GuidePricingConfig>
    if (
      typeof parsed.principalMin !== 'number'
      || typeof parsed.principalMax !== 'number'
      || typeof parsed.principalStep !== 'number'
      || !Array.isArray(parsed.supportedTerms)
      || typeof parsed.weeklyInterestBase !== 'number'
      || typeof parsed.weeklyInterestRate !== 'number'
      || typeof parsed.registrationFee !== 'number'
      || typeof parsed.processingFee !== 'number'
    ) {
      return null
    }

    return {
      principalMin: parsed.principalMin,
      principalMax: parsed.principalMax,
      principalStep: parsed.principalStep,
      supportedTerms: parsed.supportedTerms.map(Number).filter((item) => Number.isInteger(item) && item > 0),
      weeklyInterestBase: parsed.weeklyInterestBase,
      weeklyInterestRate: parsed.weeklyInterestRate,
      registrationFee: parsed.registrationFee,
      processingFee: parsed.processingFee,
    }
  } catch {
    return null
  }
}

export function calculateGuidePricingPreview(config: GuidePricingConfig, principal: number, termWeeks: number) {
  if (
    !Number.isFinite(principal)
    || !Number.isFinite(termWeeks)
    || principal < config.principalMin
    || principal > config.principalMax
    || (principal - config.principalMin) % config.principalStep !== 0
    || !config.supportedTerms.includes(termWeeks)
  ) {
    return null
  }

  const weeklyInterestAmount = Number((config.weeklyInterestBase + (principal * config.weeklyInterestRate)).toFixed(2))
  const totalInterest = Number((weeklyInterestAmount * termWeeks).toFixed(2))
  const scheduledRepaymentTotal = Number((principal + totalInterest).toFixed(2))

  return {
    weeklyInterestAmount,
    totalInterest,
    scheduledRepaymentTotal,
    installmentAmount: Math.round(scheduledRepaymentTotal / termWeeks),
    processingFee: config.processingFee,
    registrationFee: config.registrationFee,
  }
}