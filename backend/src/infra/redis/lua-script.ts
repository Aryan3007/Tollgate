import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Redis } from 'ioredis';

const LUA_DIR = resolve(import.meta.dirname, 'lua');

/**
 * A Lua script run with EVALSHA, falling back to EVAL the first time a Redis
 * server sees it (or after a restart flushes its script cache).
 */
export class LuaScript<TResult> {
  private readonly source: string;
  private readonly sha: string;

  constructor(name: string) {
    this.source = readFileSync(resolve(LUA_DIR, `${name}.lua`), 'utf8');
    this.sha = createHash('sha1').update(this.source).digest('hex');
  }

  async run(
    redis: Redis,
    keys: string[],
    args: Array<string | number>,
  ): Promise<TResult> {
    try {
      return (await redis.evalsha(this.sha, keys.length, ...keys, ...args)) as TResult;
    } catch (err) {
      if (!(err instanceof Error) || !err.message.startsWith('NOSCRIPT')) throw err;
      return (await redis.eval(this.source, keys.length, ...keys, ...args)) as TResult;
    }
  }
}

export const scripts = {
  rateLimit: new LuaScript<[number, number, number]>('rate_limit'),
  budgetReserve: new LuaScript<[number, number]>('budget_reserve'),
  budgetSettle: new LuaScript<number>('budget_settle'),
  budgetSweep: new LuaScript<number>('budget_sweep'),
  budgetHydrate: new LuaScript<number>('budget_hydrate'),
};
