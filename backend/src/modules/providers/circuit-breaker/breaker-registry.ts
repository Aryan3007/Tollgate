import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../../../infra/redis/redis.module.js';
import type { ProviderKind } from '../types.js';
import { CircuitBreaker, type BreakerState } from './circuit-breaker.js';

const redisKey = (kind: ProviderKind) => `cb:${kind}`;

/**
 * One in-memory breaker per provider, per instance: each instance protects
 * itself with no coordination on the hot path. State changes are mirrored to
 * Redis only so the dashboard can show them.
 */
@Injectable()
export class BreakerRegistry {
  private readonly logger = new Logger(BreakerRegistry.name);
  private readonly breakers = new Map<ProviderKind, CircuitBreaker>();

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  for(kind: ProviderKind): CircuitBreaker {
    let breaker = this.breakers.get(kind);
    if (!breaker) {
      breaker = new CircuitBreaker((state) => this.onChange(kind, state));
      this.breakers.set(kind, breaker);
    }
    return breaker;
  }

  async stateOf(kind: ProviderKind): Promise<BreakerState> {
    const local = this.for(kind).current;
    try {
      const mirrored = await this.redis.get(redisKey(kind));
      return (mirrored as BreakerState | null) ?? local;
    } catch {
      return local;
    }
  }

  /** Forgets all breakers. Used by tests between cases. */
  reset(): void {
    this.breakers.clear();
  }

  private onChange(kind: ProviderKind, state: BreakerState): void {
    this.logger.warn({ provider: kind, state }, 'Circuit breaker changed state');
    this.redis
      .set(redisKey(kind), state)
      .catch((err: unknown) => this.logger.warn({ err }, 'Could not mirror breaker state'));
  }
}
