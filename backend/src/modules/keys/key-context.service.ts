import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { APP_CONFIG } from '../../config/config.module.js';
import type { Env } from '../../config/env.schema.js';
import { REDIS } from '../../infra/redis/redis.module.js';
import type { KeyContext } from './key-context.js';
import { hashKeySecret, looksLikeKeySecret } from './key-secret.js';
import { KeysRepository } from './keys.repository.js';

const CACHE_TTL_SECONDS = 60;
/** Short negative cache so a flood of bad keys does not reach Postgres. */
const MISS_TTL_SECONDS = 10;
const MISS = 'none';
const TOUCH_INTERVAL_SECONDS = 60;

// Bump the version whenever KeyContext changes shape, so entries cached by an
// older build are never read as the new shape.
const cacheKey = (hash: string) => `vk:v4:${hash}`;

/**
 * Resolves a presented key to its context, with Redis in front of Postgres.
 * Redis is shared by every instance, so deleting the cache entry on revoke
 * takes effect everywhere at once. If Redis is down, lookups fall back to
 * Postgres (fail open for auth).
 */
@Injectable()
export class KeyContextService {
  private readonly logger = new Logger(KeyContextService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly keys: KeysRepository,
  ) {}

  async resolve(secret: string): Promise<KeyContext | null> {
    if (!looksLikeKeySecret(secret)) return null;
    const hash = hashKeySecret(this.env.KEY_PEPPER, secret);

    const cached = await this.cacheGet(hash);
    if (cached === MISS) return null;
    if (cached) return this.usable(JSON.parse(cached) as KeyContext);

    const context = await this.keys.findActiveContextByHash(hash);
    await this.cacheSet(
      hash,
      context ? JSON.stringify(context) : MISS,
      context ? CACHE_TTL_SECONDS : MISS_TTL_SECONDS,
    );
    return context && this.usable(context);
  }

  async invalidate(keyHash: string): Promise<void> {
    try {
      await this.redis.del(cacheKey(keyHash));
    } catch (err) {
      // The 60 s TTL bounds how long a stale entry can survive.
      this.logger.error({ err }, 'Failed to invalidate key cache');
    }
  }

  /** Records last use at most once a minute per key, off the request path. */
  touch(context: KeyContext): void {
    this.redis
      .set(`vk:touch:${context.keyId}`, '1', 'EX', TOUCH_INTERVAL_SECONDS, 'NX')
      .then((set) => (set ? this.keys.touchLastUsed(context.keyId) : undefined))
      .catch((err: unknown) =>
        this.logger.warn({ err }, 'Failed to record key last use'),
      );
  }

  private usable(context: KeyContext): KeyContext | null {
    return context.expiresAt !== null && context.expiresAt <= Date.now()
      ? null
      : context;
  }

  private async cacheGet(hash: string): Promise<string | null> {
    try {
      return await this.redis.get(cacheKey(hash));
    } catch (err) {
      this.logger.warn({ err }, 'Key cache read failed; using Postgres');
      return null;
    }
  }

  private async cacheSet(hash: string, value: string, ttl: number) {
    try {
      await this.redis.set(cacheKey(hash), value, 'EX', ttl);
    } catch (err) {
      this.logger.warn({ err }, 'Key cache write failed');
    }
  }
}
