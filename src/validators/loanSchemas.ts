import { z } from "zod";
import {
  assetTypeSchema,
  loanDisbursementAmountSchema,
  loanPrincipalSchema,
  loanTermWeeksSchema,
  optionalKenyanPhoneSchema,
  ownershipTypeSchema,
  repaymentChannelSchema,
} from "./shared.js";

const createLoanSchema = z.object({
  clientId: z.number().int().positive(),
  principal: loanPrincipalSchema,
  termWeeks: loanTermWeeksSchema,
  productId: z.number().int().positive().optional(),
  interestRate: z.number().min(0).max(1000).optional(),
  registrationFee: z.number().min(0).max(1000000).optional(),
  processingFee: z.number().min(0).max(1000000).optional(),
  branchId: z.number().int().positive().optional(),
  officerId: z.number().int().positive().optional(),
  purpose: z.string().trim().max(500).optional(),
});

const approveLoanSchema = z.object({
  notes: z.string().trim().max(500).optional(),
});

const disburseLoanSchema = z.object({
  notes: z.string().trim().max(500).optional(),
  amount: loanDisbursementAmountSchema.optional(),
  finalDisbursement: z.boolean().optional(),
  mobileMoney: z.object({
    enabled: z.boolean().optional(),
    phoneNumber: optionalKenyanPhoneSchema,
    accountReference: z.string().trim().min(1).max(64).optional(),
    narration: z.string().trim().max(255).optional(),
  }).optional(),
});

const rejectLoanSchema = z.object({
  reason: z.string().trim().min(5).max(500),
});

const assignLoanOfficerSchema = z.object({
  officerId: z.number().int().positive(),
});

const updateLoanDetailsSchema = z
  .object({
    principal: loanPrincipalSchema.optional(),
    termWeeks: loanTermWeeksSchema.optional(),
    interestRate: z.number().min(0).max(1000).optional(),
    registrationFee: z.number().min(0).max(1000000).optional(),
    processingFee: z.number().min(0).max(1000000).optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "Provide at least one loan detail field to update",
  });

const createRepaymentSchema = z.object({
  amount: z.number().positive(),
  note: z.string().trim().max(255).optional(),
  paymentChannel: repaymentChannelSchema.optional(),
  paymentProvider: z.string().trim().max(80).optional(),
  externalReceipt: z.string().trim().max(120).optional(),
  externalReference: z.string().trim().max(120).optional(),
  payerPhone: optionalKenyanPhoneSchema,
  clientIdempotencyKey: z.string().trim().min(8).max(120).regex(/^[A-Za-z0-9._:-]+$/).optional(),
});

const createGuarantorSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: optionalKenyanPhoneSchema,
  nationalId: z.string().trim().min(4).max(50).optional(),
  physicalAddress: z.string().trim().max(255).optional(),
  occupation: z.string().trim().max(120).optional(),
  employerName: z.string().trim().max(120).optional(),
  monthlyIncome: z.number().min(0).max(100000000).optional(),
  guaranteeAmount: z.number().positive().max(1000000000).optional(),
  branchId: z.number().int().positive().optional(),
});

const createCollateralAssetSchema = z.object({
  assetType: assetTypeSchema,
  description: z.string().trim().min(3).max(500),
  estimatedValue: z.number().positive().max(1000000000),
  ownershipType: ownershipTypeSchema.optional(),
  ownerName: z.string().trim().max(120).optional(),
  ownerNationalId: z.string().trim().max(50).optional(),
  registrationNumber: z.string().trim().max(80).optional(),
  logbookNumber: z.string().trim().max(80).optional(),
  titleNumber: z.string().trim().max(80).optional(),
  locationDetails: z.string().trim().max(255).optional(),
  valuationDate: z.string().datetime().optional(),
  branchId: z.number().int().positive().optional(),
});

// Used by PATCH /api/collateral-assets/:id.
// All three CollateralStatus values are accepted at the schema layer, and
// migration 0020 enforces the same constraint at the database layer.
const updateCollateralAssetSchema = z
  .object({
    assetType: assetTypeSchema.optional(),
    description: z.string().trim().min(3).max(500).optional(),
    estimatedValue: z.number().positive().max(1000000000).optional(),
    ownershipType: ownershipTypeSchema.optional(),
    ownerName: z.string().trim().max(120).nullable().optional(),
    ownerNationalId: z.string().trim().max(50).nullable().optional(),
    registrationNumber: z.string().trim().max(80).nullable().optional(),
    logbookNumber: z.string().trim().max(80).nullable().optional(),
    titleNumber: z.string().trim().max(80).nullable().optional(),
    locationDetails: z.string().trim().max(255).nullable().optional(),
    valuationDate: z.string().datetime().nullable().optional(),
    status: z.enum(["active", "released", "liquidated"]).optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "Provide at least one collateral asset field to update",
  });

const linkLoanGuarantorSchema = z.object({
  guarantorId: z.number().int().positive(),
  guaranteeAmount: z.number().min(0).max(100000000).optional(),
  relationshipToClient: z.string().trim().max(120).optional(),
  liabilityType: z.enum(["individual", "corporate", "joint"]).optional(),
  note: z.string().trim().max(255).optional(),
});

const linkLoanCollateralSchema = z.object({
  collateralAssetId: z.number().int().positive(),
  forcedSaleValue: z.number().positive().max(1000000000).optional(),
  lienRank: z.number().int().positive().max(20).optional(),
  note: z.string().trim().max(255).optional(),
});

const loanLifecycleActionSchema = z.object({
  note: z.string().trim().max(255).optional(),
});

const restructureLoanSchema = z.object({
  newTermWeeks: z.number().int().positive().max(260),
  note: z.string().trim().max(255).optional(),
  waiveInterest: z.boolean().optional(),
});

const topUpLoanSchema = z.object({
  additionalPrincipal: z.number().positive().max(1000000000),
  newTermWeeks: z.number().int().positive().max(260).optional(),
  note: z.string().trim().max(255).optional(),
});

const refinanceLoanSchema = z.object({
  newInterestRate: z.number().min(0).max(1000),
  newTermWeeks: z.number().int().positive().max(260),
  additionalPrincipal: z.number().min(0).max(1000000000).optional(),
  note: z.string().trim().max(255).optional(),
});

const extendLoanTermSchema = z.object({
  newTermWeeks: z.number().int().positive().max(260),
  note: z.string().trim().max(255).optional(),
});

const createLoanProductSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    interestRate: z.number().min(0).max(1000),
    registrationFee: z.number().min(0).max(1000000),
    processingFee: z.number().min(0).max(1000000),
    pricingStrategy: z.enum(["flat_rate", "graduated_weekly_income"]).optional(),
    pricingConfig: z.unknown().nullable().optional(),
    interestAccrualMethod: z.enum(["upfront", "flat", "daily", "daily_eod"]).optional(),
    penaltyRateDaily: z.number().min(0).max(1000).optional(),
    penaltyFlatAmount: z.number().min(0).max(1000000).optional(),
    penaltyGraceDays: z.number().int().min(0).max(365).optional(),
    penaltyCapAmount: z.number().min(0).max(1000000000).nullable().optional(),
    penaltyCompoundingMethod: z.enum(["simple", "compound"]).optional(),
    penaltyBaseAmount: z.enum(["installment_outstanding", "principal_outstanding", "full_balance"]).optional(),
    penaltyCapPercentOfOutstanding: z.number().min(0).max(100).nullable().optional(),
    minPrincipal: z.number().positive().max(1000000000).optional(),
    maxPrincipal: z.number().positive().max(1000000000).optional(),
    minTermWeeks: z.number().int().positive().max(260),
    maxTermWeeks: z.number().int().positive().max(260),
    isActive: z.boolean().optional(),
  })
  .refine(
    (payload) => (typeof payload.minPrincipal !== "number" || typeof payload.maxPrincipal !== "number")
      || payload.minPrincipal <= payload.maxPrincipal,
    {
      message: "minPrincipal cannot exceed maxPrincipal",
      path: ["minPrincipal"],
    },
  )
  .refine((payload) => payload.minTermWeeks <= payload.maxTermWeeks, {
    message: "minTermWeeks cannot exceed maxTermWeeks",
    path: ["minTermWeeks"],
  });

const updateLoanProductSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    interestRate: z.number().min(0).max(1000).optional(),
    registrationFee: z.number().min(0).max(1000000).optional(),
    processingFee: z.number().min(0).max(1000000).optional(),
    pricingStrategy: z.enum(["flat_rate", "graduated_weekly_income"]).optional(),
    pricingConfig: z.unknown().nullable().optional(),
    interestAccrualMethod: z.enum(["upfront", "flat", "daily", "daily_eod"]).optional(),
    penaltyRateDaily: z.number().min(0).max(1000).optional(),
    penaltyFlatAmount: z.number().min(0).max(1000000).optional(),
    penaltyGraceDays: z.number().int().min(0).max(365).optional(),
    penaltyCapAmount: z.number().min(0).max(1000000000).nullable().optional(),
    penaltyCompoundingMethod: z.enum(["simple", "compound"]).optional(),
    penaltyBaseAmount: z.enum(["installment_outstanding", "principal_outstanding", "full_balance"]).optional(),
    penaltyCapPercentOfOutstanding: z.number().min(0).max(100).nullable().optional(),
    minPrincipal: z.number().positive().max(1000000000).optional(),
    maxPrincipal: z.number().positive().max(1000000000).optional(),
    minTermWeeks: z.number().int().positive().max(260).optional(),
    maxTermWeeks: z.number().int().positive().max(260).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "Provide at least one loan product field to update",
  });

export {
  approveLoanSchema,
  assignLoanOfficerSchema,
  createCollateralAssetSchema,
  createGuarantorSchema,
  createLoanProductSchema,
  createLoanSchema,
  createRepaymentSchema,
  disburseLoanSchema,
  extendLoanTermSchema,
  linkLoanCollateralSchema,
  linkLoanGuarantorSchema,
  loanLifecycleActionSchema,
  refinanceLoanSchema,
  rejectLoanSchema,
  restructureLoanSchema,
  topUpLoanSchema,
  updateCollateralAssetSchema,
  updateLoanDetailsSchema,
  updateLoanProductSchema,
};
