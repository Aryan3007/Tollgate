import { z } from 'zod';

export const spendQuery = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM')
    .optional(),
});
export type SpendQuery = z.output<typeof spendQuery>;
