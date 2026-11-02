import { z } from 'zod';

export const listRequestsQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  keyId: z.uuid().optional(),
  teamId: z.uuid().optional(),
  outcome: z.enum(['success', 'error']).optional(),
});
export type ListRequestsQuery = z.output<typeof listRequestsQuery>;
