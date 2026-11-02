import {
  boolean,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const providerKind = pgEnum('provider_kind', [
  'openai',
  'anthropic',
  'groq',
]);

export const providers = pgTable('providers', {
  id: uuid().primaryKey().defaultRandom(),
  kind: providerKind().notNull().unique(),
  baseUrl: varchar({ length: 255 }).notNull(),
  enabled: boolean().notNull().default(true),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export type Provider = typeof providers.$inferSelect;
