import type { Redis } from 'ioredis';
import type { Env } from '../../config/env.schema.js';
import type { KeyContext } from './key-context.js';
import { KeyContextService } from './key-context.service.js';
import { generateKeySecret, hashKeySecret } from './key-secret.js';
import type { KeysRepository } from './keys.repository.js';

const PEPPER = 'unit-test-pepper-0123456789abcdefghij';
const env = { KEY_PEPPER: PEPPER } as Env;

function context(overrides: Partial<KeyContext> = {}): KeyContext {
  return {
    keyId: 'key-1',
    keyHash: 'hash',
    teamId: 'team-1',
    allowedModels: ['gpt-4o-mini'],
    rpmLimit: 60,
    tpmLimit: 1000,
    teamRpmLimit: 600,
    teamTpmLimit: 200_000,
    monthlyBudgetMicroInr: 1_000_000_000,
    defaultMaxTokens: 512,
    piiEntities: ['phone'],
    cache: { enabled: true, maxTemperature: 0, ttlSeconds: 3600 },
    expiresAt: null,
    ...overrides,
  };
}

function setup(redisImpl: Partial<Record<'get' | 'set' | 'del', (...args: unknown[]) => Promise<unknown>>>) {
  const store = new Map<string, string>();
  const redis = {
    get: vi.fn(redisImpl.get ?? ((key: unknown) => Promise.resolve(store.get(key as string) ?? null))),
    set: vi.fn(
      redisImpl.set ??
        ((key: unknown, value: unknown) => {
          store.set(key as string, value as string);
          return Promise.resolve('OK');
        }),
    ),
    del: vi.fn(redisImpl.del ?? (() => Promise.resolve(1))),
  };
  const repo = {
    findActiveContextByHash: vi.fn<KeysRepository['findActiveContextByHash']>(),
    touchLastUsed: vi.fn(() => Promise.resolve()),
  };
  const service = new KeyContextService(env, redis as unknown as Redis, repo as unknown as KeysRepository);
  return { service, redis, repo, store };
}

describe('KeyContextService', () => {
  it('rejects values that are not Tollgate keys without any lookup', async () => {
    const { service, repo, redis } = setup({});

    expect(await service.resolve('sk-openai-key')).toBeNull();
    expect(repo.findActiveContextByHash).not.toHaveBeenCalled();
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('caches a found key so the second lookup skips Postgres', async () => {
    const { service, repo } = setup({});
    const secret = generateKeySecret();
    repo.findActiveContextByHash.mockResolvedValue(context());

    await service.resolve(secret);
    await service.resolve(secret);

    expect(repo.findActiveContextByHash).toHaveBeenCalledTimes(1);
    expect(repo.findActiveContextByHash).toHaveBeenCalledWith(hashKeySecret(PEPPER, secret));
  });

  it('caches misses briefly so bad keys do not hammer Postgres', async () => {
    const { service, repo, redis } = setup({});
    const secret = generateKeySecret();
    repo.findActiveContextByHash.mockResolvedValue(null);

    expect(await service.resolve(secret)).toBeNull();
    expect(await service.resolve(secret)).toBeNull();

    expect(repo.findActiveContextByHash).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith(expect.any(String), 'none', 'EX', 10);
  });

  it('treats a cached key that has since expired as invalid', async () => {
    const { service, repo } = setup({});
    const secret = generateKeySecret();
    repo.findActiveContextByHash.mockResolvedValue(context({ expiresAt: Date.now() - 1 }));

    expect(await service.resolve(secret)).toBeNull();
  });

  it('falls back to Postgres when Redis is down', async () => {
    const down = () => Promise.reject(new Error('Connection is closed'));
    const { service, repo } = setup({ get: down, set: down });
    repo.findActiveContextByHash.mockResolvedValue(context());

    expect(await service.resolve(generateKeySecret())).toMatchObject({ keyId: 'key-1' });
  });

  it('does not throw when cache invalidation fails', async () => {
    const { service } = setup({ del: () => Promise.reject(new Error('down')) });

    await expect(service.invalidate('hash')).resolves.toBeUndefined();
  });
});
