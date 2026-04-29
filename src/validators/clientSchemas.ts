import { z } from "zod";
import {
  assetTypeSchema,
  kraPinSchema,
  latitudeSchema,
  locationAccuracyMetersSchema,
  longitudeSchema,
  nullableKenyanPhoneSchema,
  optionalKenyanPhoneSchema,
  ownershipTypeSchema,
} from "./shared.js";

const createClientSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: optionalKenyanPhoneSchema,
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
  latitude: latitudeSchema.optional(),
  longitude: longitudeSchema.optional(),
  locationAccuracyMeters: locationAccuracyMetersSchema.optional(),
  locationCapturedAt: z.string().datetime().optional(),
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
    latitude: latitudeSchema.nullable().optional(),
    longitude: longitudeSchema.nullable().optional(),
    locationAccuracyMeters: locationAccuracyMetersSchema.nullable().optional(),
    locationCapturedAt: z.string().datetime().nullable().optional(),
    officerId: z.number().int().positive().nullable().optional(),
    piiOverrideReason: z.string().trim().min(5).max(500).optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "Provide at least one client field to update",
  });

const updateClientKycSchema = z.object({
  status: z.enum(["pending", "in_review", "verified", "rejected", "suspended"]),
  note: z.string().trim().max(500).optional(),
});

const clientProfileRefreshPhotoSchema = z.object({
  url: z.string().url(),
  capturedAt: z.string().datetime(),
  gpsLatitude: latitudeSchema,
  gpsLongitude: longitudeSchema,
  gpsAccuracyMeters: locationAccuracyMetersSchema.optional(),
});

const clientProfileRefreshGpsSchema = z.object({
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  accuracyMeters: locationAccuracyMetersSchema.nullable().optional(),
  capturedAt: z.string().datetime().optional(),
});

const clientProfileRefreshGuarantorSchema = z.object({
  draftItemId: z.string().trim().min(2).max(80).optional(),
  sourceGuarantorId: z.number().int().positive().nullable().optional(),
  fullName: z.string().trim().min(2).max(120),
  phone: nullableKenyanPhoneSchema,
  nationalId: z.string().trim().min(4).max(50).nullable().optional(),
  physicalAddress: z.string().trim().max(255).nullable().optional(),
  occupation: z.string().trim().max(120).nullable().optional(),
  employerName: z.string().trim().max(120).nullable().optional(),
  monthlyIncome: z.number().min(0).max(100000000).nullable().optional(),
  guaranteeAmount: z.number().min(0).max(1000000000).nullable().optional(),
  idDocumentUrl: z.string().url().nullable().optional(),
});

const clientProfileRefreshCollateralSchema = z.object({
  draftItemId: z.string().trim().min(2).max(80).optional(),
  sourceCollateralId: z.number().int().positive().nullable().optional(),
  assetType: assetTypeSchema,
  description: z.string().trim().min(3).max(500),
  estimatedValue: z.number().positive().max(1000000000),
  ownershipType: ownershipTypeSchema.optional(),
  ownerName: z.string().trim().max(120).nullable().optional(),
  ownerNationalId: z.string().trim().max(50).nullable().optional(),
  registrationNumber: z.string().trim().max(80).nullable().optional(),
  logbookNumber: z.string().trim().max(80).nullable().optional(),
  titleNumber: z.string().trim().max(80).nullable().optional(),
  locationDetails: z.string().trim().max(255).nullable().optional(),
  valuationDate: z.string().datetime().nullable().optional(),
  documentUrl: z.string().url().nullable().optional(),
  imageUrls: z.array(z.string().url()).max(10).optional(),
});

const createClientProfileRefreshSchema = z.object({
  assignedToUserId: z.number().int().positive().optional(),
  note: z.string().trim().max(500).optional(),
});

const updateClientProfileRefreshDraftSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120).optional(),
    phone: z.string().trim().min(6).max(40).nullable().optional(),
    nationalId: z.string().trim().min(4).max(50).nullable().optional(),
    kraPin: z.union([kraPinSchema, z.literal(""), z.null()]).optional(),
    nextOfKinName: z.string().trim().max(120).nullable().optional(),
    nextOfKinPhone: z.string().trim().max(40).nullable().optional(),
    nextOfKinRelation: z.string().trim().max(120).nullable().optional(),
    businessType: z.string().trim().max(120).nullable().optional(),
    businessYears: z.number().int().min(0).max(100).nullable().optional(),
    businessLocation: z.string().trim().max(255).nullable().optional(),
    residentialAddress: z.string().trim().max(255).nullable().optional(),
    photo: clientProfileRefreshPhotoSchema.nullable().optional(),
    gps: clientProfileRefreshGpsSchema.nullable().optional(),
    guarantors: z.array(clientProfileRefreshGuarantorSchema).max(20).optional(),
    collaterals: z.array(clientProfileRefreshCollateralSchema).max(20).optional(),
    piiOverrideReason: z.string().trim().min(5).max(500).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "Provide at least one profile refresh field to update",
  });

const listClientProfileRefreshesQuerySchema = z.object({
  status: z.enum(["draft", "pending_review", "pushed_back", "approved"]).optional(),
  assignedToMe: z.coerce.boolean().optional(),
  priorityOnly: z.coerce.boolean().optional(),
  clientId: z.coerce.number().int().positive().optional(),
});

const clientProfileRefreshFlaggedFieldSchema = z.object({
  fieldPath: z.enum([
    "profile.photo",
    "profile.gps",
    "profile.identity.phone",
    "profile.identity.nationalId",
    "profile.identity.fullName",
    "profile.identity.kraPin",
    "profile.nextOfKin",
    "profile.business",
    "guarantors",
    "collaterals",
  ]),
  reasonCode: z.string().trim().max(80).optional(),
  comment: z.string().trim().max(255).optional(),
});

const reviewClientProfileRefreshSchema = z
  .object({
    decision: z.enum(["approve", "push_back"]),
    note: z.string().trim().max(500).optional(),
    flaggedFields: z.array(clientProfileRefreshFlaggedFieldSchema).max(20).optional(),
  })
  .superRefine((payload, ctx) => {
    if (payload.decision === "push_back" && (!Array.isArray(payload.flaggedFields) || payload.flaggedFields.length === 0)) {
      ctx.addIssue({
        code: "custom",
        message: "Provide at least one flagged field when pushing back a refresh",
        path: ["flaggedFields"],
      });
    }
  });

const createClientGuarantorSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: optionalKenyanPhoneSchema,
  nationalId: z.string().trim().min(4).max(50).optional(),
  physicalAddress: z.string().trim().max(255).optional(),
  occupation: z.string().trim().max(120).optional(),
  employerName: z.string().trim().max(120).optional(),
  monthlyIncome: z.number().min(0).max(100000000).optional(),
  guaranteeAmount: z.number().positive().max(1000000000),
  idDocumentUrl: z.string().url().optional(),
});

const updateClientGuarantorSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120).optional(),
    phone: nullableKenyanPhoneSchema,
    nationalId: z.string().trim().min(4).max(50).nullable().optional(),
    physicalAddress: z.string().trim().max(255).nullable().optional(),
    occupation: z.string().trim().max(120).nullable().optional(),
    employerName: z.string().trim().max(120).nullable().optional(),
    monthlyIncome: z.number().min(0).max(100000000).nullable().optional(),
    guaranteeAmount: z.number().min(0).max(1000000000).optional(),
    idDocumentUrl: z.string().url().nullable().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "Provide at least one guarantor field to update",
  });

const createClientCollateralSchema = z.object({
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
  documentUrl: z.string().url().optional(),
});

const updateClientCollateralSchema = z
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
    documentUrl: z.string().url().nullable().optional(),
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

export {
  createClientCollateralSchema,
  createClientGuarantorSchema,
  createClientProfileRefreshSchema,
  createClientSchema,
  listClientProfileRefreshesQuerySchema,
  portfolioReallocationSchema,
  potentialClientDuplicateQuerySchema,
  recordClientFeePaymentSchema,
  reviewClientProfileRefreshSchema,
  updateClientCollateralSchema,
  updateClientGuarantorSchema,
  updateClientKycSchema,
  updateClientProfileRefreshDraftSchema,
  updateClientSchema,
};
