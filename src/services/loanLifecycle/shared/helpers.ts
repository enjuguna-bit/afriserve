/**
 * Pure utility helpers shared across all loan lifecycle operations.
 * No deps, no side effects — safe to import anywhere.
 */
import { Decimal } from "decimal.js";
import { DomainValidationError } from "../../../domain/errors.js";

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

export function buildInstallmentAmounts(expectedTotal: number, termWeeks: number): number[] {
  const total = toMoneyDecimal(expectedTotal);
  const baseAmount = total.dividedBy(termWeeks).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const amounts = Array.from({ length: termWeeks }, () => baseAmount.toNumber());
  const assigned = baseAmount.mul(termWeeks).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const delta = total.minus(assigned).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  amounts[termWeeks - 1] = baseAmount.plus(delta).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
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
