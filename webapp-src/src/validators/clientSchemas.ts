/**
 * Client Validation Schemas
 * Centralized validation using Zod for type safety and consistency
 */

import { z } from 'zod';

// ==================== Phone Number Validation ====================

const kenyaPhoneRegex = /^(?:\+254|254|0)([17]\d{8})$/;

export const phoneNumberSchema = z
  .string()
  .min(9)
  .max(13)
  .refine(
    (val) => kenyaPhoneRegex.test(val.replace(/\s+/g, '')),
    {
      message: 'Invalid Kenyan phone number format. Expected +254XXXXXXXXX or 07XXXXXXXX',
    }
  );

// ==================== National ID Validation ====================

export const nationalIdSchema = z
  .string()
  .min(6)
  .max(9)
  .regex(/^\d{6,9}$/, 'National ID must be 6-9 digits');

// ==================== Client Creation ====================

export const createClientSchema = z.object({
  fullName: z.string().min(2).max(100).trim(),
  phone: phoneNumberSchema,
  nationalId: nationalIdSchema.optional(),
  branchId: z.number().int().positive(),
  officerId: z.number().int().positive().optional(),
  nextOfKinName: z.string().min(2).max(100).trim().optional(),
  nextOfKinPhone: phoneNumberSchema.optional(),
  nextOfKinRelation: z.string().max(50).trim().optional(),
  businessType: z.string().max(100).trim().optional(),
  businessYears: z.number().int().min(0).max(100).optional(),
  businessLocation: z.string().max(200).trim().optional(),
  residentialAddress: z.string().max(200).trim().optional(),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;

// ==================== Client Update ====================

export const updateClientSchema = z.object({
  fullName: z.string().min(2).max(100).trim().optional(),
  nextOfKinName: z.string().min(2).max(100).trim().optional(),
  nextOfKinPhone: phoneNumberSchema.optional(),
  nextOfKinRelation: z.string().max(50).trim().optional(),
  businessType: z.string().max(100).trim().optional(),
  businessYears: z.number().int().min(0).max(100).optional(),
  businessLocation: z.string().max(200).trim().optional(),
  residentialAddress: z.string().max(200).trim().optional(),
});

export type UpdateClientInput = z.infer<typeof updateClientSchema>;

// ==================== KYC Update ====================

export const updateClientKycSchema = z.object({
  photoUrl: z.string().url().optional(),
  idDocumentUrl: z.string().url().optional(),
  kraPin: z.string().max(20).optional(),
  nationalId: nationalIdSchema.optional(),
});

export type UpdateClientKycInput = z.infer<typeof updateClientKycSchema>;

// ==================== Fee Payment ====================

export const recordClientFeePaymentSchema = z.object({
  amount: z.number().positive().max(100000),
  paymentMethod: z.enum(['cash', 'mobile_money', 'bank_transfer', 'card']),
  transactionReference: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
});

export type RecordClientFeePaymentInput = z.infer<typeof recordClientFeePaymentSchema>;

// ==================== Guarantor ====================

export const createClientGuarantorSchema = z.object({
  fullName: z.string().min(2).max(100).trim(),
  phone: phoneNumberSchema,
  nationalId: nationalIdSchema.optional(),
  relationship: z.string().max(50).trim(),
  address: z.string().max(200).trim().optional(),
  employer: z.string().max(100).trim().optional(),
});

export type CreateClientGuarantorInput = z.infer<typeof createClientGuarantorSchema>;

export const updateClientGuarantorSchema = createClientGuarantorSchema.partial();

export type UpdateClientGuarantorInput = z.infer<typeof updateClientGuarantorSchema>;

// ==================== Collateral ====================

export const createClientCollateralSchema = z.object({
  assetType: z.enum(['land', 'vehicle', 'equipment', 'inventory', 'other']),
  description: z.string().min(10).max(500).trim(),
  estimatedValue: z.number().positive().max(100_000_000),
  location: z.string().max(200).trim().optional(),
  registrationNumber: z.string().max(100).trim().optional(),
  documentUrl: z.string().url().optional(),
});

export type CreateClientCollateralInput = z.infer<typeof createClientCollateralSchema>;

export const updateClientCollateralSchema = createClientCollateralSchema.partial();

export type UpdateClientCollateralInput = z.infer<typeof updateClientCollateralSchema>;

// ==================== Portfolio Reallocation ====================

export const portfolioReallocationSchema = z.object({
  clientIds: z.array(z.number().int().positive()).min(1).max(100),
  newOfficerId: z.number().int().positive(),
  reason: z.string().min(10).max(500).trim(),
});

export type PortfolioReallocationInput = z.infer<typeof portfolioReallocationSchema>;

// ==================== Potential Duplicate Check ====================

export const potentialClientDuplicateQuerySchema = z.object({
  phone: phoneNumberSchema.optional(),
  nationalId: nationalIdSchema.optional(),
  fullName: z.string().min(2).max(100).trim().optional(),
}).refine(
  (data) => data.phone || data.nationalId || data.fullName,
  {
    message: 'At least one search criterion must be provided',
  }
);

export type PotentialClientDuplicateQuery = z.infer<typeof potentialClientDuplicateQuerySchema>;
