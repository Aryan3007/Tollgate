import { z } from "zod";

export const spendReportSchema = z.object({
  month: z.string(),
  totals: z.object({
    requests: z.number().int(),
    errors: z.number().int(),
    cacheHits: z.number().int(),
    savedMicroInr: z.number(),
    inputTokens: z.number().int(),
    outputTokens: z.number().int(),
    costMicroInr: z.number(),
  }),
  totalBudgetMicroInr: z.number(),
  projectedMicroInr: z.number(),
  daily: z.array(
    z.object({
      date: z.string(),
      requests: z.number().int(),
      costMicroInr: z.number(),
    }),
  ),
  byTeam: z.array(
    z.object({
      teamId: z.uuid(),
      teamName: z.string(),
      requests: z.number().int(),
      costMicroInr: z.number(),
      budgetMicroInr: z.number(),
    }),
  ),
  byModel: z.array(
    z.object({
      model: z.string(),
      requests: z.number().int(),
      costMicroInr: z.number(),
    }),
  ),
});
export type SpendReport = z.infer<typeof spendReportSchema>;
