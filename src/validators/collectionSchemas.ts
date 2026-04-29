import { z } from "zod";

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

export {
  createCollectionActionSchema,
  updateCollectionActionSchema,
};
