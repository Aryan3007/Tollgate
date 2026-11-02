import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import {
  GatewayError,
  RateLimitedError,
  ServiceUnavailableError,
} from '../../common/errors/gateway-error.js';
import { scripts } from '../../infra/redis/lua-script.js';
import { REDIS } from '../../infra/redis/redis.module.js';
import type { KeyContext } from '../keys/key-context.js';

const MINUTE_MS = 60_000;

interface Bucket {
  key: string;
  limit: number;
  cost: number;
  description: string;
}

/**
 * Requests-per-minute and tokens-per-minute limits for the key and its team,
 * checked in one atomic Lua call. Like budgets, this fails closed when Redis
 * is unreachable.
 */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async consume(key: KeyContext, tokens: number): Promise<void> {
    const buckets: Bucket[] = [
      { key: `rl:key:${key.keyId}:rpm`, limit: key.rpmLimit, cost: 1, description: "this key's requests-per-minute limit" },
      { key: `rl:key:${key.keyId}:tpm`, limit: key.tpmLimit, cost: tokens, description: "this key's tokens-per-minute limit" },
      { key: `rl:team:${key.teamId}:rpm`, limit: key.teamRpmLimit, cost: 1, description: "the team's requests-per-minute limit" },
      { key: `rl:team:${key.teamId}:tpm`, limit: key.teamTpmLimit, cost: tokens, description: "the team's tokens-per-minute limit" },
    ];

    // A request bigger than a whole minute's token allowance can never fit;
    // say so instead of telling the client to retry.
    const tooLarge = buckets.find((b) => b.cost > b.limit);
    if (tooLarge) {
      throw new GatewayError(
        429,
        'rate_limit_error',
        'request_too_large',
        `This request needs about ${tokens} tokens, more than ${tooLarge.description} (${tooLarge.limit}). Lower max_tokens or shorten the prompt.`,
      );
    }

    let result: [number, number, number];
    try {
      result = await scripts.rateLimit.run(
        this.redis,
        buckets.map((b) => b.key),
        buckets.flatMap((b) => [MINUTE_MS / b.limit, MINUTE_MS, b.cost]),
      );
    } catch (err) {
      this.logger.error({ err }, 'Rate limit check failed');
      throw new ServiceUnavailableError('rate_limit_unavailable', 'Rate limiting is unavailable; request refused');
    }

    const [allowed, retryAfterMs, deniedIndex] = result;
    if (allowed !== 1) {
      const bucket = buckets[deniedIndex - 1]!;
      throw new RateLimitedError(
        `Rate limit reached: ${bucket.description} (${bucket.limit}). Retry in ${Math.ceil(retryAfterMs / 1000)}s.`,
        Math.max(1, Math.ceil(retryAfterMs / 1000)),
      );
    }
  }
}
