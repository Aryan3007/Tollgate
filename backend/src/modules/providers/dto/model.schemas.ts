import { z } from 'zod';

export const listModelsQuery = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});
export type ListModelsQuery = z.output<typeof listModelsQuery>;
