import { z } from "zod";
import { branchCodeSchema } from "./shared.js";

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
  createBranchSchema,
  updateBranchSchema,
};
