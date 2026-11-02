import {
  boolean,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { providers } from './providers.js';

export const models = pgTable(
  'models',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Public name clients send as `model`. */
    alias: varchar({ length: 128 }).notNull().unique(),
    providerId: uuid()
      .notNull()
      .references(() => providers.id, { onDelete: 'restrict' }),
    upstreamName: varchar({ length: 128 }).notNull(),
    inputUsdPerMtok: numeric({ precision: 12, scale: 4, mode: 'number' }).notNull(),
    outputUsdPerMtok: numeric({ precision: 12, scale: 4, mode: 'number' }).notNull(),
    supportsJson: boolean().notNull().default(true),
    supportsTools: boolean().notNull().default(true),
    /** Aliases to try, in order, if this model's provider fails. */
    fallbackAliases: text().array().notNull().default([]),
    enabled: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.providerId)],
);

export type Model = typeof models.$inferSelect;
