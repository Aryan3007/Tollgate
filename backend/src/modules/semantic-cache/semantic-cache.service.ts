import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { APP_CONFIG } from '../../config/config.module.js';
import type { Env } from '../../config/env.schema.js';
import { REDIS } from '../../infra/redis/redis.module.js';
import type { ChatCompletionRequest } from '../completions/dto/chat-completion-request.schema.js';
import type { KeyContext } from '../keys/key-context.js';
import type { Usage } from '../providers/types.js';
import { exactCacheKey, ineligibleReason, semanticTarget, sha256 } from './cache-key.js';
import { Embedder } from './embedder.js';

const INDEX = 'idx:sc';

export interface CachedResponse {
  /** Model that produced the answer. */
  model: string;
  content: string;
  usage: Usage;
  /** What producing it cost: what each later hit saves. */
  costMicroInr: number;
}

export interface CacheHit {
  kind: 'exact' | 'semantic';
  entry: CachedResponse;
}

/**
 * Two layers, both scoped per team:
 *  1. exact:    identical request → one Redis GET.
 *  2. semantic: same team, model, parameters and earlier conversation, and a
 *               final user message whose embedding is >= CACHE_SIMILARITY close.
 *
 * Every failure here (Redis down, model still loading, slow embedding) is a
 * cache miss, never an error: the cache can only ever save money.
 */
@Injectable()
export class SemanticCacheService implements OnModuleInit {
  private readonly logger = new Logger(SemanticCacheService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly embedder: Embedder,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureIndex().catch((err: unknown) =>
      this.logger.warn({ err }, 'Could not create the vector index; semantic matching is off'),
    );
  }

  /** Null when the request may use the cache; otherwise the reason it may not. */
  ineligibleReason(req: ChatCompletionRequest, key: KeyContext, redactions: number): string | null {
    return ineligibleReason(req, key.cache, redactions);
  }

  async lookup(req: ChatCompletionRequest, key: KeyContext): Promise<CacheHit | null> {
    try {
      const exact = await this.redis.get(exactCacheKey(key.teamId, req));
      if (exact) return { kind: 'exact', entry: JSON.parse(exact) as CachedResponse };
    } catch (err) {
      this.logger.warn({ err }, 'Cache read failed; treating as a miss');
      return null;
    }

    const target = semanticTarget(key.teamId, req);
    if (!target || !this.embedder.ready) return null;
    try {
      const vector = await this.embedder.embed(target.text);
      const entry = await this.searchNearest(target.scope, vector);
      return entry ? { kind: 'semantic', entry } : null;
    } catch (err) {
      this.logger.warn({ err }, 'Semantic lookup failed; treating as a miss');
      return null;
    }
  }

  /** Stores a finished answer. Never throws; callers do not wait for it. */
  async store(req: ChatCompletionRequest, key: KeyContext, entry: CachedResponse): Promise<void> {
    try {
      const exactKey = exactCacheKey(key.teamId, req);
      const json = JSON.stringify(entry);
      await this.redis.set(exactKey, json, 'EX', key.cache.ttlSeconds);

      const target = semanticTarget(key.teamId, req);
      if (!target || !this.embedder.ready) return;
      const vector = await this.embedder.embed(target.text);
      // Derived from the exact key, so storing the same prompt twice overwrites.
      const docKey = `sc:${key.teamId}:${sha256(exactKey)}`;
      await this.redis
        .multi()
        .hset(docKey, { scope: target.scope, vec: Buffer.from(vector.buffer), response: json })
        .expire(docKey, key.cache.ttlSeconds)
        .exec();
    } catch (err) {
      this.logger.warn({ err }, 'Cache write failed');
    }
  }

  private async searchNearest(scope: string, vector: Float32Array): Promise<CachedResponse | null> {
    const search = () =>
      this.redis.call(
        'FT.SEARCH',
        INDEX,
        // Pre-filter to this scope, then take the single nearest vector.
        `(@scope:{${scope}})=>[KNN 1 @vec $q AS dist]`,
        'PARAMS', '2', 'q', Buffer.from(vector.buffer),
        'SORTBY', 'dist',
        'RETURN', '2', 'dist', 'response',
        'DIALECT', '2',
      ) as Promise<unknown[]>;

    let reply: unknown[];
    try {
      reply = await search();
    } catch (err) {
      if (!/no such index|unknown index/i.test(String(err))) throw err;
      await this.ensureIndex();
      return null;
    }

    const fields = firstResultFields(reply);
    if (!fields) return null;
    const field = (name: string) => fields[fields.indexOf(name) + 1];

    const similarity = 1 - Number(field('dist'));
    const response = field('response');
    return similarity >= this.env.CACHE_SIMILARITY && response ? (JSON.parse(response) as CachedResponse) : null;
  }

  private async ensureIndex(): Promise<void> {
    try {
      await this.redis.call(
        'FT.CREATE', INDEX, 'ON', 'HASH', 'PREFIX', '1', 'sc:',
        'SCHEMA',
        'scope', 'TAG',
        'vec', 'VECTOR', 'HNSW', '6', 'TYPE', 'FLOAT32', 'DIM', String(this.embedder.dimensions), 'DISTANCE_METRIC', 'COSINE',
      );
    } catch (err) {
      if (!/already exists/i.test(String(err))) throw err;
    }
  }
}

/**
 * The returned fields of the best result. Redis 8 replies with a map
 * (`results` → `extra_attributes`); older Redis Stack replies with
 * `[total, key, [field, value, ...]]`. Both are read here.
 */
export function firstResultFields(reply: unknown[]): string[] | null {
  const resultsAt = reply.indexOf('results');
  if (resultsAt !== -1) {
    const first = (reply[resultsAt + 1] as unknown[][] | undefined)?.[0];
    const attributesAt = first?.indexOf('extra_attributes') ?? -1;
    return first && attributesAt !== -1 ? (first[attributesAt + 1] as string[]) : null;
  }
  return Number(reply[0]) >= 1 ? (reply[2] as string[]) : null;
}
