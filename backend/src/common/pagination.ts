import { z } from 'zod';

export const MAX_PAGE_SIZE = 100;

export function paginationQuery<const T extends readonly [string, ...string[]]>(
  sortFields: T,
  defaultSort: T[number],
) {
  return z.object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
    sortBy: z.enum(sortFields).default(defaultSort),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
    search: z.string().trim().min(1).max(100).optional(),
  });
}

export interface Paginated<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
}

/** Escapes LIKE wildcards so user search text matches literally. */
export function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export const uuidParam = z.uuid();

/** Postgres unique_violation. */
export function isUniqueViolation(err: unknown): boolean {
  const cause =
    err instanceof Error && 'cause' in err ? (err.cause as unknown) : err;
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    cause.code === '23505'
  );
}
