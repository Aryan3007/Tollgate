import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { teams } from './teams.js';

export const virtualKeys = pgTable(
  'virtual_keys',
  {
    id: uuid().primaryKey().defaultRandom(),
    teamId: uuid()
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),
    name: varchar({ length: 100 }).notNull(),
    /** First characters of the key, safe to display (e.g. `tg_live_a1B2`). */
    prefix: varchar({ length: 16 }).notNull(),
    /** HMAC-SHA256(KEY_PEPPER, key), hex. The plaintext key is never stored. */
    keyHash: varchar({ length: 64 }).notNull().unique(),
    allowedModels: text().array().notNull(),
    /** Null means the team's limit applies. */
    rpmLimit: integer(),
    tpmLimit: integer(),
    expiresAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    lastUsedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.teamId), index().on(t.createdAt)],
);

export type VirtualKey = typeof virtualKeys.$inferSelect;
