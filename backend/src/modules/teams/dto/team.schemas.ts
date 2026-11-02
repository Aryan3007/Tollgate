import { z } from 'zod';
import { paginationQuery } from '../../../common/pagination.js';
import { PII_ENTITIES } from '../../pii/detectors/index.js';

const fields = {
  name: z.string().trim().min(1).max(100),
  /** Up to ₹1 billion a month, in micro-rupees. */
  monthlyBudgetMicroInr: z.number().int().min(0).max(1_000_000_000_000_000),
  rpmLimit: z.number().int().min(1).max(100_000),
  tpmLimit: z.number().int().min(1).max(100_000_000),
  defaultMaxTokens: z.number().int().min(1).max(200_000),
  cacheEnabled: z.boolean(),
  cacheMaxTemperature: z.number().min(0).max(2),
  cacheTtlSeconds: z.number().int().min(10).max(30 * 86_400),
  piiEntities: z
    .array(z.enum(PII_ENTITIES))
    .max(PII_ENTITIES.length)
    .refine((types) => new Set(types).size === types.length, { message: 'Types must be unique' }),
};

export const createTeamSchema = z.strictObject({
  name: fields.name,
  monthlyBudgetMicroInr: fields.monthlyBudgetMicroInr,
  rpmLimit: fields.rpmLimit.optional(),
  tpmLimit: fields.tpmLimit.optional(),
  defaultMaxTokens: fields.defaultMaxTokens.optional(),
  piiEntities: fields.piiEntities.optional(),
  cacheEnabled: fields.cacheEnabled.optional(),
  cacheMaxTemperature: fields.cacheMaxTemperature.optional(),
  cacheTtlSeconds: fields.cacheTtlSeconds.optional(),
});
export type CreateTeamInput = z.output<typeof createTeamSchema>;

export const updateTeamSchema = createTeamSchema
  .partial()
  .refine((input) => Object.keys(input).length > 0, {
    message: 'Provide at least one field to update',
  });
export type UpdateTeamInput = z.output<typeof updateTeamSchema>;

export const listTeamsQuery = paginationQuery(['createdAt', 'name'], 'createdAt');
export type ListTeamsQuery = z.output<typeof listTeamsQuery>;
