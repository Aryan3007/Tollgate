import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import { APP_CONFIG } from '../../config/config.module.js';
import type { Env } from '../../config/env.schema.js';

export const REDIS = Symbol('REDIS');
const CONNECT_WAIT_MS = 2_000;

@Injectable()
class RedisShutdown implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}

async function connect(env: Env): Promise<Redis> {
  const logger = new Logger('Redis');
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

@Global()
@Module({
  providers: [
    { provide: REDIS, inject: [APP_CONFIG], useFactory: connect },
    RedisShutdown,
  ],
  exports: [REDIS],
})
export class RedisModule {}
