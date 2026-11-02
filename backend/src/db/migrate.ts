import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

// Runs before the app starts (locally via `pnpm db:migrate`, in Docker as the
// container's first step), so the app never serves traffic on an old schema.

export async function runMigrations(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: resolve(import.meta.dirname, '../../drizzle'),
    });
  } finally {
    await pool.end();
  }
}

if (process.argv[1] === import.meta.filename) {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  await runMigrations(url);
  console.log('Migrations applied');
}
