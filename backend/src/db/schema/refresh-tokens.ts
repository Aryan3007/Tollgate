import { index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { admins } from './admins.js';

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid().primaryKey().defaultRandom(),
    adminId: uuid()
      .notNull()
      .references(() => admins.id, { onDelete: 'cascade' }),
    /** Every rotation of one login shares a family, so reuse can revoke them all. */
    familyId: uuid().notNull(),
    tokenHash: varchar({ length: 64 }).notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.adminId), index().on(t.familyId)],
);

export type RefreshToken = typeof refreshTokens.$inferSelect;
