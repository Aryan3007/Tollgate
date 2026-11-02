import type { AddressInfo } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import argon2 from 'argon2';
import { sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import request from 'supertest';
import { inject } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { DB, type Database } from '../../src/db/database.module.js';
import { admins, models, providers } from '../../src/db/schema/index.js';
import { REDIS } from '../../src/infra/redis/redis.module.js';
import { BreakerRegistry } from '../../src/modules/providers/circuit-breaker/breaker-registry.js';
import { ModelCatalogService } from '../../src/modules/providers/model-catalog.service.js';
import { RequestLogWriter } from '../../src/modules/request-logs/request-log.writer.js';
import { Embedder } from '../../src/modules/semantic-cache/embedder.js';
import { HashEmbedder } from './hash-embedder.js';
import { startMockProvider, type MockProvider } from '../mock-provider/server.js';

export const TEST_ADMIN = {
  email: 'admin@tollgate.test',
  password: 'correct-horse-battery-staple',
};
export const TTFB_TIMEOUT_MS = 300;
export const USD_INR_RATE = 100;

export interface TestApp {
  app: NestExpressApplication;
  baseURL: string;
  db: Database;
  redis: Redis;
  mock: MockProvider;
  /** Second upstream: serves the groq and anthropic catalog entries. */
  backup: MockProvider;
  embedder: HashEmbedder;
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const mock = await startMockProvider();
  const backup = await startMockProvider();
  Object.assign(process.env, {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: inject('databaseUrl'),
    REDIS_URL: inject('redisUrl'),
    KEY_PEPPER: 'test-pepper-0123456789abcdefghijklmnop',
    JWT_ACCESS_SECRET: 'test-jwt-secret-0123456789abcdefghijkl',
    AUTH_RATE_LIMIT_MAX: '10000',
    PROVIDER_KEY_OPENAI: 'sk-mock',
    PROVIDER_KEY_ANTHROPIC: 'sk-ant-mock',
    PROVIDER_KEY_GROQ: 'gsk-mock',
    UPSTREAM_TTFB_TIMEOUT_MS: String(TTFB_TIMEOUT_MS),
    USD_INR_RATE: String(USD_INR_RATE),
    LOG_FLUSH_INTERVAL_MS: '20',
    // The fake embedder's cosine scores run lower than the real model's.
    CACHE_SIMILARITY: '0.9',
  });

  const embedder = new HashEmbedder();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Embedder)
    .useValue(embedder)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;

  return {
    app,
    baseURL: `http://127.0.0.1:${port}`,
    db: app.get<Database>(DB),
    redis: app.get<Redis>(REDIS),
    mock,
    backup,
    embedder,
    http: () => request(app.getHttpServer()),
    close: async () => {
      await app.close();
      await mock.close();
      await backup.close();
    },
  };
}

/** Empties every table and Redis, then seeds one admin and a catalog pointing at the mock provider. */
export async function resetState(t: TestApp): Promise<void> {
  // Let in-flight log batches land first so they cannot leak into the next test.
  await t.app.get(RequestLogWriter).drain();
  await t.db.execute(
    sql`truncate request_logs, refresh_tokens, admins, virtual_keys, teams, models, providers restart identity cascade`,
  );
  await deleteKeys(t.redis, ['vk:*', 'rl:*', 'bud:*', 'cb:*', 'ce:*', 'sc:*']);
  t.app.get(BreakerRegistry).reset();
  t.embedder.calls.length = 0;

  await t.db.insert(admins).values({
    email: TEST_ADMIN.email,
    passwordHash: await argon2.hash(TEST_ADMIN.password),
  });
  const [openai] = await t.db
    .insert(providers)
    .values([
      { kind: 'openai', baseUrl: t.mock.url },
      { kind: 'anthropic', baseUrl: t.backup.url },
      { kind: 'groq', baseUrl: t.backup.url },
    ])
    .returning();
  const all = await t.db.select().from(providers);
  const anthropic = all.find((p) => p.kind === 'anthropic')!;
  const groq = all.find((p) => p.kind === 'groq')!;
  await t.db.insert(models).values([
    { alias: 'gpt-4o-mini', providerId: openai!.id, upstreamName: 'gpt-4o-mini-2024-07-18', inputUsdPerMtok: 0.15, outputUsdPerMtok: 0.6, fallbackAliases: ['llama-3.3-70b', 'claude-haiku-4-5'] },
    { alias: 'gpt-4o', providerId: openai!.id, upstreamName: 'gpt-4o', inputUsdPerMtok: 2.5, outputUsdPerMtok: 10 },
    { alias: 'claude-haiku-4-5', providerId: anthropic.id, upstreamName: 'claude-haiku-4-5', inputUsdPerMtok: 1, outputUsdPerMtok: 5 },
    { alias: 'llama-3.3-70b', providerId: groq.id, upstreamName: 'llama-3.3-70b-versatile', inputUsdPerMtok: 0.59, outputUsdPerMtok: 0.79 },
  ]);
  t.app.get(ModelCatalogService).invalidate();

  for (const mock of [t.mock, t.backup]) {
    mock.behavior = {
      latencyMs: 0,
      chunkDelayMs: 0,
      chunkSize: 4,
      failStatus: null,
      reply: 'Hello from the mock provider.',
    };
    mock.requests.length = 0;
    mock.aborted = 0;
  }
}

/** Deletes Tollgate's keys only; BullMQ's own keys must survive between tests. */
async function deleteKeys(redis: Redis, patterns: string[]): Promise<void> {
  for (const pattern of patterns) {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
      cursor = next;
      if (keys.length > 0) await redis.del(...keys);
    } while (cursor !== '0');
  }
}

export async function loginAsAdmin(t: TestApp): Promise<string> {
  const res = await t.http().post('/v1/admin/auth/login').send(TEST_ADMIN).expect(200);
  return (res.body as { accessToken: string }).accessToken;
}

export async function createTeam(
  t: TestApp,
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; name: string }> {
  const res = await t
    .http()
    .post('/v1/admin/teams')
    .auth(token, { type: 'bearer' })
    .send({ name: 'Customer Support', monthlyBudgetMicroInr: 5_000_000_000, ...overrides })
    .expect(201);
  return res.body as { id: string; name: string };
}

export async function createKey(
  t: TestApp,
  token: string,
  teamId: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; secret: string }> {
  const res = await t
    .http()
    .post('/v1/admin/keys')
    .auth(token, { type: 'bearer' })
    .send({ teamId, name: 'support-bot', allowedModels: ['gpt-4o-mini'], ...overrides })
    .expect(201);
  const body = res.body as { key: { id: string }; secret: string };
  return { id: body.key.id, secret: body.secret };
}
