import { z } from "zod";

export const itemSchema = z.object({
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

export type Item = z.infer<typeof itemSchema>;
