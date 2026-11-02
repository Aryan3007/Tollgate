import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import type { TestProject } from 'vitest/node';
import { runMigrations } from '../../src/db/migrate.js';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    redisUrl: string;
  }
}

let postgres: StartedPostgreSqlContainer | undefined;
let redis: StartedRedisContainer | undefined;

/** One real Postgres and Redis for the whole e2e run; tests reset state between cases. */
export async function setup(project: TestProject): Promise<void> {
  [postgres, redis] = await Promise.all([
    new PostgreSqlContainer('postgres:17.6-alpine').start(),
    new RedisContainer('redis:8.2.2').start(),
  ]);
  await runMigrations(postgres.getConnectionUri());

  project.provide('databaseUrl', postgres.getConnectionUri());
  project.provide('redisUrl', redis.getConnectionUrl());
}

export async function teardown(): Promise<void> {
  await Promise.all([postgres?.stop(), redis?.stop()]);
}
