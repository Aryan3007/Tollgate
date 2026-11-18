import { Redis } from 'ioredis';
import type { Env } from '../../config/env.schema.js';
import { createLogger } from '../../common/logger.js';

const CONNECT_WAIT_MS = 2_000;

export async function connectRedis(env: Env): Promise<Redis> {
  const logger = createLogger('Redis');
  const client = new Redis(env.REDIS_URL, {
    // Fail fast instead of queueing: callers decide whether a Redis outage
    // fails open (cache, key lookup) or closed (budgets).
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    commandTimeout: 250,
  });
  client.on('error', (err) => logger.warn({ err }, 'Redis connection error'));

  // Without the offline queue, commands sent before the first connect fail.
  // Wait briefly so a healthy Redis is usable from the first request, but
  // still boot if it is down; /ready reports it.
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, CONNECT_WAIT_MS);
    client.once('ready', () => {
      clearTimeout(timer);
      resolve();
    });
  });
  return client;
}

export async function closeRedis(redis: Redis): Promise<void> {
  await redis.quit().catch(() => redis.disconnect());
}
