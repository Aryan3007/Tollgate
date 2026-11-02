import {
  bigint,
  boolean,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const teams = pgTable('teams', {
  id: uuid().primaryKey().defaultRandom(),
  name: varchar({ length: 100 }).notNull().unique(),
  /** ₹1 = 1,000,000 micro-rupees; integers keep budget maths exact. */
  monthlyBudgetMicroInr: bigint({ mode: 'number' }).notNull(),
  rpmLimit: integer().notNull().default(600),
  tpmLimit: integer().notNull().default(200_000),
  defaultMaxTokens: integer().notNull().default(1024),
  /** PII types masked before a request leaves the gateway. */
  piiEntities: text()
    .array()
    .notNull()
    .default(['aadhaar', 'pan', 'phone', 'card', 'email']),
  /** Serve repeated prompts from the cache. */
  cacheEnabled: boolean().notNull().default(true),
  /** Cache only requests at or below this temperature (omitted = the provider default, 1). */
  cacheMaxTemperature: real().notNull().default(0),
  cacheTtlSeconds: integer().notNull().default(3600),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Team = typeof teams.$inferSelect;
