import { pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const admins = pgTable('admins', {
  id: uuid().primaryKey().defaultRandom(),
  email: varchar({ length: 254 }).notNull().unique(),
  passwordHash: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export type Admin = typeof admins.$inferSelect;
