import { z } from "zod";
import { normalizeKenyanPhone } from "../utils/helpers.js";
import { getAllowedRoles, normalizeRoleInput } from "../config/roles.js";

export const allowedRoles = getAllowedRoles();

export const kraPinSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z][0-9]{9}[A-Za-z]$/, "KRA PIN must match format A123456789B");

export const optionalKenyanPhoneSchema = z.preprocess(
  (value) => {
    if (value == null || value === "") return undefined;
    if (typeof value !== "string") return value;
    return normalizeKenyanPhone(value);
  },
  z.string().trim().min(9).max(15).optional(),
);

export const nullableKenyanPhoneSchema = z.preprocess(
  (value) => {
    if (value == null || value === "") return null;
    if (typeof value !== "string") return value;
    return normalizeKenyanPhone(value);
  },
  z.string().trim().min(9).max(15).nullable().optional(),
);

export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(120)
  .regex(/[a-z]/, "Password must include at least one lowercase letter")
  .regex(/[A-Z]/, "Password must include at least one uppercase letter")
  .regex(/[0-9]/, "Password must include at least one number")
  .regex(/[^A-Za-z0-9]/, "Password must include at least one special character");

export const existingPasswordSchema = z
  .string()
  .min(6, "Existing passwords must be at least 6 characters")
  .max(120);

export const MAX_LOAN_INPUT_AMOUNT = 1_000_000_000;
export const MAX_LOAN_TERM_WEEKS = 260;

export const latitudeSchema = z.number().min(-90).max(90);
export const longitudeSchema = z.number().min(-180).max(180);
export const locationAccuracyMetersSchema = z.number().min(0).max(100000);

export function loanMoneySchema(minAmount: number = 0.01) {
  return z.number().positive().min(minAmount).max(MAX_LOAN_INPUT_AMOUNT);
}

export const loanPrincipalSchema = loanMoneySchema(1);
export const loanDisbursementAmountSchema = loanMoneySchema();
export const loanTermWeeksSchema = z.number().int().positive().max(MAX_LOAN_TERM_WEEKS);

export const repaymentChannelSchema = z.preprocess(
  (value) => typeof value === "string" ? value.trim().toLowerCase() : value,
  z.string().min(2).max(50).regex(/^[a-z0-9_]+$/, "Payment channel can only include lowercase letters, numbers, and underscores"),
);

export const branchCodeSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9_-]+$/, "Branch code can only include letters, numbers, underscores, and dashes");

export const assetTypeSchema = z.enum([
  "chattel", "vehicle", "land", "equipment", "machinery", "inventory", "livestock", "savings",
]);

export const ownershipTypeSchema = z.enum(["client", "guarantor", "third_party"]);

export { normalizeRoleInput };
