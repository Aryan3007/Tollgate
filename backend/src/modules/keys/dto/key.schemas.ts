import { z } from 'zod';
import { paginationQuery } from '../../../common/pagination.js';

const name = z.string().trim().min(1).max(100);
const allowedModels = z
  .array(z.string().trim().min(1).max(128))
  .min(1)
  .max(50)
  .refine((models) => new Set(models).size === models.length, {
    message: 'Model names must be unique',
  });
const rpmLimit = z.number().int().min(1).max(100_000);
const tpmLimit = z.number().int().min(1).max(100_000_000);
const futureDate = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value))
  .refine((date) => date.getTime() > Date.now(), {
    message: 'Must be in the future',
  });

export const createKeySchema = z.strictObject({
  teamId: z.uuid(),
  name,
  allowedModels,
  rpmLimit: rpmLimit.optional(),
  tpmLimit: tpmLimit.optional(),
  expiresAt: futureDate.optional(),
});
export type CreateKeyInput = z.output<typeof createKeySchema>;

export const updateKeySchema = z
  .strictObject({
    name: name.optional(),
    allowedModels: allowedModels.optional(),
    rpmLimit: rpmLimit.nullable().optional(),
    tpmLimit: tpmLimit.nullable().optional(),
    expiresAt: futureDate.nullable().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: 'Provide at least one field to update',
  });
export type UpdateKeyInput = z.output<typeof updateKeySchema>;

export const KEY_STATUSES = ['active', 'revoked', 'expired'] as const;
export type KeyStatus = (typeof KEY_STATUSES)[number];

export const listKeysQuery = paginationQuery(
  ['createdAt', 'name', 'lastUsedAt'],
  'createdAt',
).extend({
  teamId: z.uuid().optional(),
  status: z.enum(KEY_STATUSES).optional(),
});
export type ListKeysQuery = z.output<typeof listKeysQuery>;
