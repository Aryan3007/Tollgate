import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { providerKind } from './providers.js';

/**
 * One row per gateway request that got past authentication. No foreign keys:
 * this is an append-heavy log, and rows must outlive the keys they mention.
 */
export const requestLogs = pgTable(
  'request_logs',
  {
    id: uuid().primaryKey().defaultRandom(),
    requestId: varchar({ length: 128 }).notNull(),
    teamId: uuid().notNull(),
    keyId: uuid().notNull(),
    requestedModel: varchar({ length: 128 }).notNull(),
    provider: providerKind(),
    servedModel: varchar({ length: 128 }),
    streamed: boolean().notNull(),
    statusCode: integer().notNull(),
    errorCode: varchar({ length: 64 }),
    inputTokens: integer().notNull().default(0),
    outputTokens: integer().notNull().default(0),
    costMicroInr: bigint({ mode: 'number' }).notNull().default(0),
    latencyMs: integer().notNull(),
    ttfbMs: integer(),
    /** miss | exact | semantic | skipped (not eligible for caching). */
    cacheStatus: varchar({ length: 16 }).notNull().default('miss'),
    /** What a cache hit would have cost, in micro-rupees. */
    savedMicroInr: bigint({ mode: 'number' }).notNull().default(0),
    redactionCount: integer().notNull().default(0),
    failoverCount: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.teamId, t.createdAt.desc()),
    index().on(t.keyId, t.createdAt.desc()),
    index().on(t.createdAt.desc()),
  ],
);

export type RequestLog = typeof requestLogs.$inferSelect;
export type NewRequestLog = typeof requestLogs.$inferInsert;
