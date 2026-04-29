import { z } from "zod";
import { getAllowedRoles, normalizeRoleInput } from "../config/roles.js";
import { existingPasswordSchema, passwordSchema } from "./shared.js";

const allowedRoles = getAllowedRoles();

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: existingPasswordSchema,
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
  currentPassword: existingPasswordSchema,
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

export {
  adminResetPasswordSchema,
  allocateUserRoleSchema,
  changePasswordSchema,
  createUserSchema,
  loginSchema,
  refreshTokenSchema,
  resetPasswordConfirmSchema,
  resetPasswordRequestSchema,
  updateUserProfileSchema,
};
