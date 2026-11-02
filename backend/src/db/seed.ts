import { existsSync } from 'node:fs';
import argon2 from 'argon2';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { z } from 'zod';
import { admins, models, providers } from './schema/index.js';

// Idempotent: safe to run on every deploy. Creates the first admin and the
// provider/model catalog. Existing rows are kept, except that fallback chains
// are refreshed from CATALOG.

const seedEnv = z.object({
  DATABASE_URL: z.url(),
  ADMIN_EMAIL: z.email().max(254),
  ADMIN_PASSWORD: z.string().min(12).max(128),
  OPENAI_BASE_URL: z.url().default('https://api.openai.com/v1'),
  ANTHROPIC_BASE_URL: z.url().default('https://api.anthropic.com/v1'),
  GROQ_BASE_URL: z.url().default('https://api.groq.com/openai/v1'),
});

/** List prices in USD per 1M tokens. Verify against provider pricing pages. */
const CATALOG = [
  { kind: 'openai', alias: 'gpt-4o-mini', upstream: 'gpt-4o-mini', input: 0.15, output: 0.6, fallbacks: ['llama-3.3-70b', 'claude-haiku-4-5'] },
  { kind: 'openai', alias: 'gpt-4o', upstream: 'gpt-4o', input: 2.5, output: 10, fallbacks: ['claude-sonnet-4-5', 'gpt-4o-mini'] },
  { kind: 'anthropic', alias: 'claude-haiku-4-5', upstream: 'claude-haiku-4-5', input: 1, output: 5, fallbacks: ['gpt-4o-mini'] },
  { kind: 'anthropic', alias: 'claude-sonnet-4-5', upstream: 'claude-sonnet-4-5', input: 3, output: 15, fallbacks: ['gpt-4o'] },
  { kind: 'groq', alias: 'llama-3.3-70b', upstream: 'llama-3.3-70b-versatile', input: 0.59, output: 0.79, fallbacks: ['gpt-4o-mini'] },
  { kind: 'groq', alias: 'llama-3.1-8b', upstream: 'llama-3.1-8b-instant', input: 0.05, output: 0.08, fallbacks: ['llama-3.3-70b'] },
] as const;

async function seed(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const env = seedEnv.parse(process.env);
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1 });
  const db = drizzle({ client: pool, casing: 'snake_case' });

  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(admins)
        .values({
          email: env.ADMIN_EMAIL.toLowerCase(),
          passwordHash: await argon2.hash(env.ADMIN_PASSWORD),
        })
        .onConflictDoNothing();

      const baseUrls = {
        openai: env.OPENAI_BASE_URL,
        anthropic: env.ANTHROPIC_BASE_URL,
        groq: env.GROQ_BASE_URL,
      };
      await tx
        .insert(providers)
        .values(
          (['openai', 'anthropic', 'groq'] as const).map((kind) => ({
            kind,
            baseUrl: baseUrls[kind],
          })),
        )
        .onConflictDoNothing();

      const rows = await tx.select().from(providers);
      const providerId = new Map(rows.map((row) => [row.kind, row.id]));
      await tx
        .insert(models)
        .values(
          CATALOG.map((m) => ({
            alias: m.alias,
            providerId: providerId.get(m.kind)!,
            upstreamName: m.upstream,
            inputUsdPerMtok: m.input,
            outputUsdPerMtok: m.output,
            fallbackAliases: [...m.fallbacks],
          })),
        )
        .onConflictDoUpdate({
          target: models.alias,
          set: { fallbackAliases: sql`excluded.fallback_aliases` },
        });
    });
    console.log(`Seeded admin ${env.ADMIN_EMAIL} and ${CATALOG.length} models`);
  } finally {
    await pool.end();
  }
}

await seed();
