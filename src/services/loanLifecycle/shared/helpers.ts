/**
 * Pure utility helpers shared across all loan lifecycle operations.
 * No deps, no side effects — safe to import anywhere.
 */
import { Decimal } from "decimal.js";
import { DomainValidationError } from "../../../domain/errors.js";

export type LoanRepaymentCadence = "weekly" | "business_daily";

export function toMoneyDecimal(value: Decimal.Value): Decimal {
  return new Decimal(value || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function moneyToNumber(value: Decimal.Value): number {
  return toMoneyDecimal(value).toNumber();
}

export function normalizeOptionalNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeOptionalInteger(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

export function normalizeOptionalText(value: unknown): string | null {
  const s = String(value || "").trim();
  return s ? s : null;
}

export function resolveLoanRepaymentCadence(value: unknown): LoanRepaymentCadence {
  return normalizeInterestAccrualMethod(value) === "daily_eod" ? "business_daily" : "weekly";
}

export function getInstallmentCountForTerm(termWeeks: number, cadence: LoanRepaymentCadence): number {
  const normalizedTermWeeks = Math.max(0, Math.floor(Number(termWeeks || 0)));
  if (cadence === "business_daily") {
    return normalizedTermWeeks * 6;
  }
  return normalizedTermWeeks;
}

export function addBusinessDaysIso(isoDate: string, businessDays: number): string {
  const anchor = new Date(isoDate);
  if (Number.isNaN(anchor.getTime())) {
    throw new DomainValidationError("Schedule start date is invalid");
  }

  const steps = Math.max(0, Math.floor(Number(businessDays || 0)));
  const nextDate = new Date(anchor);
  let counted = 0;

  while (counted < steps) {
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    if (nextDate.getUTCDay() === 0) {
      continue;
    }
    counted += 1;
  }

  return nextDate.toISOString();
}

export function addRepaymentIntervalIso(params: {
  startIso: string;
  intervalCount: number;
  cadence: LoanRepaymentCadence;
  addWeeksIso: (isoDate: string, weeks: number) => string;
}): string {
  const intervalCount = Math.max(0, Math.floor(Number(params.intervalCount || 0)));
  if (params.cadence === "business_daily") {
    return addBusinessDaysIso(params.startIso, intervalCount);
  }
  return params.addWeeksIso(params.startIso, intervalCount);
}

export function getScheduleMaturityIso(params: {
  startIso: string;
  termWeeks: number;
  cadence: LoanRepaymentCadence;
  addWeeksIso: (isoDate: string, weeks: number) => string;
}): string {
  const installmentCount = getInstallmentCountForTerm(params.termWeeks, params.cadence);
  return addRepaymentIntervalIso({
    startIso: params.startIso,
    intervalCount: installmentCount,
    cadence: params.cadence,
    addWeeksIso: params.addWeeksIso,
  });
}

export function buildInstallmentAmounts(expectedTotal: number, installmentCount: number): number[] {
  if (!Number.isInteger(installmentCount) || installmentCount <= 0) {
    throw new DomainValidationError("Installment count must be a positive integer");
  }
  const total = toMoneyDecimal(expectedTotal);
  const baseAmount = total.dividedBy(installmentCount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const amounts = Array.from({ length: installmentCount }, () => baseAmount.toNumber());
  const assigned = baseAmount.mul(installmentCount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const delta = total.minus(assigned).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  amounts[installmentCount - 1] = baseAmount.plus(delta).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  return amounts;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function normalizeRole(role: unknown): string {
  return String(role || "").trim().toLowerCase();
}

export function normalizeInterestAccrualMethod(value: unknown): "upfront" | "daily_eod" {
  const n = String(value || "").trim().toLowerCase();
  return n === "daily_eod" ? "daily_eod" : "upfront";
}

export function estimateOutstandingPrincipalForRepricing(loan: {
  principal: number;
  expectedTotal: number;
  balance: number;
}): number {
  const principal = toMoneyDecimal(loan.principal || 0);
  const expectedTotal = toMoneyDecimal(loan.expectedTotal || 0);
  const balance = toMoneyDecimal(loan.balance || 0);
  if (balance.lte(0) || principal.lte(0)) return 0;
  if (expectedTotal.lte(0)) {
    return Decimal.min(balance, principal).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  }
  const est = balance.mul(principal).div(expectedTotal).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return Decimal.max(0, Decimal.min(balance, principal, est))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();
}

export function parseApprovalRequestPayload(rawPayload: unknown): Record<string, any> {
  if (rawPayload && typeof rawPayload === "object") return rawPayload as Record<string, any>;
  const s = String(rawPayload || "").trim();
  if (!s) return {};
  try {
    const parsed = JSON.parse(s);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    throw new DomainValidationError("Approval request payload is invalid or corrupted");
  }
}
