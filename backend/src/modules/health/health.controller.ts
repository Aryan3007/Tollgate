import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { ServiceUnavailableError } from '../../common/errors/gateway-error.js';
import { DB, type Database } from '../../db/database.module.js';
import { REDIS } from '../../infra/redis/redis.module.js';

type CheckResult = 'up' | 'down';

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Liveness: the process is up' })
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness: Postgres and Redis are reachable (503 otherwise)' })
  async ready(): Promise<{ status: 'ready'; checks: Record<string, CheckResult> }> {
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
    return { status: 'ready', checks: { postgres, redis } };
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
