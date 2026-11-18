import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { Env } from '../config/env.schema.js';
import * as schema from './schema/index.js';

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseHandle {
  db: Database;
  /** Waits for in-flight queries, then closes every connection. */
  close(): Promise<void>;
}

export function createDatabase(env: Env): DatabaseHandle {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX,
  });
  return {
    db: drizzle({ client: pool, schema, casing: 'snake_case' }),
    close: () => pool.end(),
  };
}
