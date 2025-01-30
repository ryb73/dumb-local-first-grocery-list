import { z } from "zod";

export const activeItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  checked: z
    .number()
    .int()
    .min(0)
    .max(1)
    .transform((n) => Boolean(n)),
  created_at: z.number().int().positive(),
  last_unchecked_at: z.number().int().positive().nullable(),
});

export const removedItemSchema = z.object({
  name: z.string(),
  last_removed_at: z.number().int().positive(),
});

export type ActiveItem = z.infer<typeof activeItemSchema>;
export type RemovedItem = z.infer<typeof removedItemSchema>;
