import { z } from 'zod'

export const clientFormSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required').max(120),
  phone: z.union([z.string().trim().min(6).max(40), z.literal('')]).optional(),
  nationalId: z.union([z.string().trim().min(4).max(50), z.literal('')]).optional(),
  kraPin: z.string().trim().max(11).optional().or(z.literal('')),
  nextOfKinName: z.union([z.string().trim().min(2), z.literal('')]).optional(),
  nextOfKinPhone: z.union([z.string().trim().min(6), z.literal('')]).optional(),
  nextOfKinRelation: z.string().trim().optional().or(z.literal('')),
  businessType: z.string().trim().optional().or(z.literal('')),
  businessYears: z.number().int().min(0).optional(),
  businessLocation: z.string().trim().optional().or(z.literal('')),
  residentialAddress: z.string().trim().optional().or(z.literal('')),
  isActive: z.boolean().optional(),
  piiOverrideReason: z.union([z.string().trim().min(5).max(500), z.literal('')]).optional(),
})

export type ClientFormValues = z.infer<typeof clientFormSchema>
