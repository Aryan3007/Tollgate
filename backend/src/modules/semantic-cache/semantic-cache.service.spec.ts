import type { Redis } from 'ioredis';
import type { Env } from '../../config/env.schema.js';
import type { ChatCompletionRequest } from '../completions/dto/chat-completion-request.schema.js';
import type { KeyContext } from '../keys/key-context.js';
import { Embedder } from './embedder.js';
import { firstResultFields, SemanticCacheService } from './semantic-cache.service.js';

const request = { model: 'gpt-4o-mini', temperature: 0, messages: [{ role: 'user', content: 'hi there' }] } as ChatCompletionRequest;
const key = { teamId: 'team-1', cache: { enabled: true, maxTemperature: 0, ttlSeconds: 60 } } as KeyContext;

class StubEmbedder extends Embedder {
  readonly dimensions = 4;
  constructor(readonly ready: boolean, private readonly fail = false) {
    super();
  }
  embed(): Promise<Float32Array> {
    return this.fail ? Promise.reject(new Error('timed out')) : Promise.resolve(new Float32Array(4));
  }
}

const down = () => Promise.reject(new Error('Connection is closed'));
const redisDown = { get: vi.fn(down), set: vi.fn(down), call: vi.fn(down), multi: vi.fn(down) } as unknown as Redis;
const env = { CACHE_SIMILARITY: 0.95 } as Env;

describe('SemanticCacheService fails open', () => {
  it('treats a Redis outage as a miss, never an error', async () => {
    const cache = new SemanticCacheService(env, redisDown, new StubEmbedder(true));

    await expect(cache.lookup(request, key)).resolves.toBeNull();
  });

  it('swallows write failures so a response is never delayed or failed by the cache', async () => {
    const cache = new SemanticCacheService(env, redisDown, new StubEmbedder(true));

    await expect(
      cache.store(request, key, { model: 'm', content: 'x', usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }, costMicroInr: 1 }),
    ).resolves.toBeUndefined();
  });

  it('skips the semantic layer while the model is still loading or an embedding times out', async () => {
    const get = vi.fn(() => Promise.resolve(null));
    const call = vi.fn();
    const redis = { get, call } as unknown as Redis;

    await expect(new SemanticCacheService(env, redis, new StubEmbedder(false)).lookup(request, key)).resolves.toBeNull();
    await expect(new SemanticCacheService(env, redis, new StubEmbedder(true, true)).lookup(request, key)).resolves.toBeNull();
    expect(call).not.toHaveBeenCalled();
  });
});

describe('firstResultFields', () => {
  it('reads the Redis 8 map reply', () => {
    const reply = ['attributes', [], 'results', [['id', 'sc:1', 'extra_attributes', ['dist', '0.01', 'response', '{}']]], 'total_results', 1];

    expect(firstResultFields(reply)).toEqual(['dist', '0.01', 'response', '{}']);
  });

  it('reads the older array reply', () => {
    expect(firstResultFields([1, 'sc:1', ['dist', '0.01', 'response', '{}']])).toEqual(['dist', '0.01', 'response', '{}']);
  });

  it('returns null when nothing matched', () => {
    expect(firstResultFields(['attributes', [], 'results', [], 'total_results', 0])).toBeNull();
    expect(firstResultFields([0])).toBeNull();
  });
});
