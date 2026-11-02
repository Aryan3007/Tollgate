import { Redis } from 'ioredis';
import { inject } from 'vitest';
import { scripts } from '../src/infra/redis/lua-script.js';

// The atomic building blocks, exercised directly against real Redis.

describe('Lua scripts (e2e, real Redis)', () => {
  let redis: Redis;

  beforeAll(() => {
    redis = new Redis(inject('redisUrl'));
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(async () => {
    const keys = await redis.keys('lua-test:*');
    if (keys.length > 0) await redis.del(...keys);
  });

  describe('rate_limit (GCRA)', () => {
    const perMinute = (limit: number, cost = 1) => [60_000 / limit, 60_000, cost];

    it('allows a burst up to the limit, then denies with a retry delay', async () => {
      const key = ['lua-test:rpm'];
      for (let i = 0; i < 3; i++) {
        expect((await scripts.rateLimit.run(redis, key, perMinute(3)))[0]).toBe(1);
      }

      const [allowed, retryAfterMs, deniedIndex] = await scripts.rateLimit.run(redis, key, perMinute(3));

      expect(allowed).toBe(0);
      expect(deniedIndex).toBe(1);
      expect(retryAfterMs).toBeGreaterThan(19_000);
      expect(retryAfterMs).toBeLessThanOrEqual(20_000);
    });

    it('charges no bucket when any bucket denies', async () => {
      const keyBucket = 'lua-test:key';
      const teamBucket = 'lua-test:team';
      await scripts.rateLimit.run(redis, [teamBucket], perMinute(1));

      const [allowed, , deniedIndex] = await scripts.rateLimit.run(
        redis,
        [keyBucket, teamBucket],
        [...perMinute(10), ...perMinute(1)],
      );

      expect(allowed).toBe(0);
      expect(deniedIndex).toBe(2);
      expect(await redis.exists(keyBucket)).toBe(0);
    });

    it('weights a bucket by cost (tokens per minute)', async () => {
      const key = ['lua-test:tpm'];

      expect((await scripts.rateLimit.run(redis, key, perMinute(1000, 600)))[0]).toBe(1);
      expect((await scripts.rateLimit.run(redis, key, perMinute(1000, 600)))[0]).toBe(0);
      expect((await scripts.rateLimit.run(redis, key, perMinute(1000, 400)))[0]).toBe(1);
    });
  });

  describe('budget ledger', () => {
    const ledger = 'lua-test:bud:{team}:2026-10';
    const resv = 'lua-test:bud:resv:{team}:2026-10';
    const keys = [ledger, resv];
    const future = () => Date.now() + 60_000;

    const state = async () => {
      const h = await redis.hgetall(ledger);
      return { spent: Number(h.spent), reserved: Number(h.reserved), open: await redis.zcard(resv) };
    };

    beforeEach(async () => {
      await scripts.budgetHydrate.run(redis, [ledger], [0, 3600]);
    });

    it('asks for hydration when the ledger does not exist', async () => {
      await redis.del(ledger);

      expect(await scripts.budgetReserve.run(redis, keys, [1000, 10, 'r1:10', future(), 3600])).toEqual([-1, 0]);
    });

    it('hydrates once: a second hydration does not overwrite live totals', async () => {
      await redis.del(ledger);
      expect(await scripts.budgetHydrate.run(redis, [ledger], [500, 3600])).toBe(1);
      expect(await scripts.budgetHydrate.run(redis, [ledger], [0, 3600])).toBe(0);

      expect((await state()).spent).toBe(500);
    });

    it('reserves until the cap, counting spent and outstanding reservations', async () => {
      expect(await scripts.budgetReserve.run(redis, keys, [100, 60, 'r1:60', future(), 3600])).toEqual([1, 40]);
      expect(await scripts.budgetReserve.run(redis, keys, [100, 50, 'r2:50', future(), 3600])).toEqual([0, 40]);
      expect(await state()).toEqual({ spent: 0, reserved: 60, open: 1 });
    });

    it('settles a reservation to the real cost', async () => {
      await scripts.budgetReserve.run(redis, keys, [100, 60, 'r1:60', future(), 3600]);

      expect(await scripts.budgetSettle.run(redis, keys, ['r1:60', 60, 23])).toBe(23);
      expect(await state()).toEqual({ spent: 23, reserved: 0, open: 0 });
    });

    it('releases a reservation without charging', async () => {
      await scripts.budgetReserve.run(redis, keys, [100, 60, 'r1:60', future(), 3600]);

      await scripts.budgetSettle.run(redis, keys, ['r1:60', 60, 0]);

      expect(await state()).toEqual({ spent: 0, reserved: 0, open: 0 });
    });

    it('sweeps expired reservations, and a late settle does not release them twice', async () => {
      await scripts.budgetReserve.run(redis, keys, [100, 60, 'r1:60', Date.now() - 1, 3600]);
      await scripts.budgetReserve.run(redis, keys, [100, 30, 'r2:30', future(), 3600]);

      expect(await scripts.budgetSweep.run(redis, keys, [Date.now()])).toBe(1);
      expect(await state()).toEqual({ spent: 0, reserved: 30, open: 1 });

      await scripts.budgetSettle.run(redis, keys, ['r1:60', 60, 10]);
      expect(await state()).toEqual({ spent: 10, reserved: 30, open: 1 });
    });

    it('never lets parallel reservations exceed the cap', async () => {
      const attempts = Array.from({ length: 50 }, (_, i) =>
        scripts.budgetReserve.run(redis, keys, [1000, 70, `r${i}:70`, future(), 3600]),
      );

      const results = await Promise.all(attempts);

      expect(results.filter(([status]) => status === 1)).toHaveLength(14);
      expect((await state()).reserved).toBe(980);
    });
  });
});
