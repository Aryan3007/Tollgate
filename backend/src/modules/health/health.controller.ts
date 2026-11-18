import { sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import type { Redis } from 'ioredis';
import { ServiceUnavailableError } from '../../common/errors/gateway-error.js';
import type { Database } from '../../db/client.js';

type CheckResult = 'up' | 'down';

export class HealthController {
  constructor(
    private readonly db: Database,
    private readonly redis: Redis,
  ) {}

  health(_req: Request, res: Response): void {
    res.json({ status: 'ok' });
  }

  async ready(_req: Request, res: Response): Promise<void> {
    const [postgres, redis] = await Promise.all([
      this.check(() => this.db.execute(sql`select 1`)),
      this.check(() => this.redis.ping()),
    ]);
    if (postgres === 'down' || redis === 'down') {
      throw new ServiceUnavailableError(
        'not_ready',
        `Dependencies unavailable: postgres=${postgres}, redis=${redis}`,
      );
    }
    res.json({ status: 'ready', checks: { postgres, redis } });
  }

  private async check(probe: () => Promise<unknown>): Promise<CheckResult> {
    try {
      await probe();
      return 'up';
    } catch {
      return 'down';
    }
  }
}
