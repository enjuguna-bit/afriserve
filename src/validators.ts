import { z } from "zod";
import { getAllowedRoles, normalizeRoleInput } from "./config/roles.js";
const allowedRoles = getAllowedRoles();
const kraPinPattern = /^[A-Za-z][0-9]{9}[A-Za-z]$/;
const kraPinSchema = z
  .string()
  .trim()
  .regex(kraPinPattern, "KRA PIN must match format A123456789B");

const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(120)
  .regex(/[a-z]/, "Password must include at least one lowercase letter")
  .regex(/[A-Z]/, "Password must include at least one uppercase letter")
  .regex(/[0-9]/, "Password must include at least one number")
  .regex(/[^A-Za-z0-9]/, "Password must include at least one special character");

const createClientSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(40).optional(),
  nationalId: z.string().trim().min(4).max(50).optional(),
  kraPin: z.union([kraPinSchema, z.literal("")]).optional(),
  photoUrl: z.string().url().optional(),
  idDocumentUrl: z.string().url().optional(),
  nextOfKinName: z.string().trim().min(2).optional(),
  nextOfKinPhone: z.string().trim().min(6).optional(),
  nextOfKinRelation: z.string().trim().optional(),
  businessType: z.string().trim().optional(),
  businessYears: z.number().int().min(0).optional(),
  businessLocation: z.string().trim().optional(),
  residentialAddress: z.string().trim().optional(),
  officerId: z.number().int().positive().optional(),
  branchId: z.number().int().positive().optional(),
});

const updateClientSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120).optional(),
    phone: z.string().trim().min(6).max(40).nullable().optional(),
    nationalId: z.string().trim().min(4).max(50).nullable().optional(),
    isActive: z.boolean().optional(),
    kraPin: z.union([kraPinSchema, z.literal(""), z.null()]).optional(),
    photoUrl: z.string().url().nullable().optional(),
    idDocumentUrl: z.string().url().nullable().optional(),
    nextOfKinName: z.string().trim().nullable().optional(),
    nextOfKinPhone: z.string().trim().nullable().optional(),
    nextOfKinRelation: z.string().trim().nullable().optional(),
    businessType: z.string().trim().nullable().optional(),
    businessYears: z.number().int().min(0).nullable().optional(),
    businessLocation: z.string().trim().nullable().optional(),
    residentialAddress: z.string().trim().nullable().optional(),
    officerId: z.number().int().positive().nullable().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "Provide at least one client field to update",
  });

const updateClientKycSchema = z.object({
  status: z.enum(["pending", "in_review", "verified", "rejected", "suspended"]),
  note: z.string().trim().max(500).optional(),
});

const repaymentChannelSchema = z.preprocess(
  (value) => typeof value === "string" ? value.trim().toLowerCase() : value,
  z.string().min(2).max(50).regex(/^[a-z0-9_]+$/, "Payment channel can only include lowercase letters, numbers, and underscores"),
);

const createClientGuarantorSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(40).optional(),
  nationalId: z.string().trim().min(4).max(50).optional(),
  physicalAddress: z.string().trim().max(255).optional(),
  occupation: z.string().trim().max(120).optional(),
  employerName: z.string().trim().max(120).optional(),
  monthlyIncome: z.number().min(0).max(100000000).optional(),
  guaranteeAmount: z.number().positive().max(1000000000),
});

const updateClientGuarantorSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120).optional(),
    phone: z.string().trim().min(6).max(40).nullable().optional(),
    nationalId: z.string().trim().min(4).max(50).nullable().optional(),
    physicalAddress: z.string().trim().max(255).nullable().optional(),
    occupation: z.string().trim().max(120).nullable().optional(),
    employerName: z.string().trim().max(120).nullable().optional(),
    monthlyIncome: z.number().min(0).max(100000000).nullable().optional(),
    guaranteeAmount: z.number().min(0).max(1000000000).optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "Provide at least one guarantor field to update",
  });

const createClientCollateralSchema = z.object({
  assetType: z.enum(["chattel", "vehicle", "land", "equipment", "machinery", "inventory", "livestock", "savings"]),
  description: z.string().trim().min(3).max(500),
  estimatedValue: z.number().positive().max(1000000000),
  ownershipType: z.enum(["client", "guarantor", "third_party"]).optional(),
  ownerName: z.string().trim().max(120).optional(),
  ownerNationalId: z.string().trim().max(50).optional(),
  registrationNumber: z.string().trim().max(80).optional(),
  logbookNumber: z.string().trim().max(80).optional(),
  titleNumber: z.string().trim().max(80).optional(),
  locationDetails: z.string().trim().max(255).optional(),
  valuationDate: z.string().datetime().optional(),
});

const updateClientCollateralSchema = z
  .object({
    assetType: z.enum(["chattel", "vehicle", "land", "equipment", "machinery", "inventory", "livestock", "savings"]).optional(),
    description: z.string().trim().min(3).max(500).optional(),
    estimatedValue: z.number().positive().max(1000000000).optional(),
    ownershipType: z.enum(["client", "guarantor", "third_party"]).optional(),
    ownerName: z.string().trim().max(120).nullable().optional(),
    ownerNationalId: z.string().trim().max(50).nullable().optional(),
    registrationNumber: z.string().trim().max(80).nullable().optional(),
    logbookNumber: z.string().trim().max(80).nullable().optional(),
    titleNumber: z.string().trim().max(80).nullable().optional(),
    locationDetails: z.string().trim().max(255).nullable().optional(),
    valuationDate: z.string().datetime().nullable().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "Provide at least one collateral field to update",
  });

const recordClientFeePaymentSchema = z.object({
  amount: z.number().min(0).max(100000000).optional(),
  paymentReference: z.string().trim().max(120).optional(),
  paidAt: z.string().datetime().optional(),
  note: z.string().trim().max(255).optional(),
});

const potentialClientDuplicateQuerySchema = z
  .object({
    nationalId: z.string().trim().min(2).max(50).optional(),
    phone: z.string().trim().min(4).max(40).optional(),
    name: z.string().trim().min(2).max(120).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .refine((payload) => Boolean(payload.nationalId || payload.phone || payload.name), {
    message: "Provide at least one search field: nationalId, phone, or name",
  });

const portfolioReallocationSchema = z.object({
  fromOfficerId: z.number().int().positive(),
  toOfficerId: z.number().int().positive(),
  note: z.string().trim().max(500).optional(),
}).refine((payload) => payload.fromOfficerId !== payload.toOfficerId, {
  message: "Source and target agent must be different",
  path: ["toOfficerId"],
});

const createLoanSchema = z.object({
  clientId: z.number().int().positive(),
  principal: z.number().positive().min(1),
  termWeeks: z.number().int().positive().max(260),
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
  amount: z.number().positive().optional(),
  finalDisbursement: z.boolean().optional(),
  mobileMoney: z.object({
    enabled: z.boolean().optional(),
    phoneNumber: z.string().trim().min(8).max(20).optional(),
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
    principal: z.number().positive().min(1).optional(),
    termWeeks: z.number().int().positive().max(260).optional(),
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
  payerPhone: z.string().trim().min(6).max(40).optional(),
  clientIdempotencyKey: z.string().trim().min(8).max(120).regex(/^[A-Za-z0-9._:-]+$/).optional(),
});

const createGuarantorSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(40).optional(),
  nationalId: z.string().trim().min(4).max(50).optional(),
  physicalAddress: z.string().trim().max(255).optional(),
  occupation: z.string().trim().max(120).optional(),
  employerName: z.string().trim().max(120).optional(),
  monthlyIncome: z.number().min(0).max(100000000).optional(),
  guaranteeAmount: z.number().positive().max(1000000000).optional(),
  branchId: z.number().int().positive().optional(),
});

const createCollateralAssetSchema = z.object({
  assetType: z.enum(["chattel", "vehicle", "land", "equipment", "machinery", "inventory", "livestock", "savings"]),
  description: z.string().trim().min(3).max(500),
  estimatedValue: z.number().positive().max(1000000000),
  ownershipType: z.enum(["client", "guarantor", "third_party"]).optional(),
  ownerName: z.string().trim().max(120).optional(),
  ownerNationalId: z.string().trim().max(50).optional(),
  registrationNumber: z.string().trim().max(80).optional(),
  logbookNumber: z.string().trim().max(80).optional(),
  titleNumber: z.string().trim().max(80).optional(),
  locationDetails: z.string().trim().max(255).optional(),
  valuationDate: z.string().datetime().optional(),
  branchId: z.number().int().positive().optional(),
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

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(6).max(120),
});

const refreshTokenSchema = z.object({
  token: z.string().trim().min(20).max(5000),
});

const createUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: passwordSchema,
  role: z.preprocess((value) => normalizeRoleInput(value), z.enum(allowedRoles)).optional(),
  roles: z.array(z.preprocess((value) => normalizeRoleInput(value), z.enum(allowedRoles))).min(1).max(10).optional(),
  branchId: z.number().int().positive().nullable().optional(),
  branchIds: z.array(z.number().int().positive()).max(200).optional(),
  branchCount: z.number().int().positive().max(200).optional(),
  primaryRegionId: z.number().int().positive().nullable().optional(),
}).refine((payload) => Boolean(payload.role) || (Array.isArray(payload.roles) && payload.roles.length > 0), {
  message: "Provide role or roles",
  path: ["role"],
});

const updateUserProfileSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().toLowerCase().email().optional(),
    isActive: z.boolean().optional(),
    branchId: z.number().int().positive().nullable().optional(),
    branchIds: z.array(z.number().int().positive()).max(200).optional(),
    branchCount: z.number().int().positive().max(200).optional(),
    primaryRegionId: z.number().int().positive().nullable().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "Provide at least one profile field to update",
  });

const allocateUserRoleSchema = z.object({
  role: z.preprocess((value) => normalizeRoleInput(value), z.enum(allowedRoles)).optional(),
  roles: z.array(z.preprocess((value) => normalizeRoleInput(value), z.enum(allowedRoles))).min(1).max(10).optional(),
  branchId: z.number().int().positive().nullable().optional(),
  branchIds: z.array(z.number().int().positive()).max(200).optional(),
  branchCount: z.number().int().positive().max(200).optional(),
  primaryRegionId: z.number().int().positive().nullable().optional(),
}).refine((payload) => Boolean(payload.role) || (Array.isArray(payload.roles) && payload.roles.length > 0), {
  message: "Provide role or roles",
  path: ["role"],
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(6).max(120),
  newPassword: passwordSchema,
});

const resetPasswordRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

const resetPasswordConfirmSchema = z.object({
  token: z.string().trim().min(20).max(200),
  newPassword: passwordSchema,
});

const adminResetPasswordSchema = z.object({
  newPassword: passwordSchema,
});

const createCollectionActionSchema = z.object({
  loanId: z.number().int().positive(),
  installmentId: z.number().int().positive().optional(),
  actionType: z.enum(["contact_attempt", "promise_to_pay", "note", "status_change"]),
  actionNote: z.string().trim().max(500).optional(),
  promiseDate: z.string().datetime().optional(),
  nextFollowUpDate: z.string().datetime().optional(),
  actionStatus: z.enum(["open", "completed", "cancelled"]).optional(),
});

const updateCollectionActionSchema = z
  .object({
    actionNote: z.string().trim().max(500).nullable().optional(),
    promiseDate: z.string().datetime().nullable().optional(),
    nextFollowUpDate: z.string().datetime().nullable().optional(),
    actionStatus: z.enum(["open", "completed", "cancelled"]).optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "Provide at least one collection action field to update",
  });

const branchCodeSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9_-]+$/, "Branch code can only include letters, numbers, underscores, and dashes");

const createBranchSchema = z.object({
  name: z.string().trim().min(2).max(120),
  locationAddress: z.string().trim().min(4).max(255),
  county: z.string().trim().min(2).max(80),
  town: z.string().trim().min(2).max(80),
  regionId: z.number().int().positive(),
  contactPhone: z.string().trim().min(6).max(40).optional(),
  contactEmail: z.string().trim().toLowerCase().email().optional(),
  branchCode: branchCodeSchema.optional(),
});

const updateBranchSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    locationAddress: z.string().trim().min(4).max(255).optional(),
    county: z.string().trim().min(2).max(80).optional(),
    town: z.string().trim().min(2).max(80).optional(),
    regionId: z.number().int().positive().optional(),
    contactPhone: z.string().trim().min(6).max(40).nullable().optional(),
    contactEmail: z.string().trim().toLowerCase().email().nullable().optional(),
    branchCode: branchCodeSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "Provide at least one branch field to update",
  });

export {
  createClientSchema,
  updateClientSchema,
  updateClientKycSchema,
  createClientGuarantorSchema,
  updateClientGuarantorSchema,
  createClientCollateralSchema,
  updateClientCollateralSchema,
  recordClientFeePaymentSchema,
  potentialClientDuplicateQuerySchema,
  portfolioReallocationSchema,
  createLoanSchema,
  updateLoanDetailsSchema,
  createRepaymentSchema,
  createGuarantorSchema,
  createCollateralAssetSchema,
  linkLoanGuarantorSchema,
  linkLoanCollateralSchema,
  loanLifecycleActionSchema,
  restructureLoanSchema,
  topUpLoanSchema,
  refinanceLoanSchema,
  extendLoanTermSchema,
  assignLoanOfficerSchema,
  createLoanProductSchema,
  updateLoanProductSchema,
  loginSchema,
  refreshTokenSchema,
  createUserSchema,
  updateUserProfileSchema,
  allocateUserRoleSchema,
  changePasswordSchema,
  resetPasswordRequestSchema,
  resetPasswordConfirmSchema,
  adminResetPasswordSchema,
  createCollectionActionSchema,
  updateCollectionActionSchema,
  createBranchSchema,
  updateBranchSchema,
  approveLoanSchema,
  disburseLoanSchema,
  rejectLoanSchema,
};
