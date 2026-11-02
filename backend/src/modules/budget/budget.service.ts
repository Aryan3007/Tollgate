import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import {
  GatewayError,
  ServiceUnavailableError,
} from '../../common/errors/gateway-error.js';
import { monthOf, monthStart } from '../../common/month.js';
import { APP_CONFIG } from '../../config/config.module.js';
import type { Env } from '../../config/env.schema.js';
import { scripts } from '../../infra/redis/lua-script.js';
import { REDIS } from '../../infra/redis/redis.module.js';
import { RequestLogsRepository } from '../request-logs/request-logs.repository.js';

const LEDGER_TTL_SECONDS = 40 * 86_400;

export class BudgetExceededError extends GatewayError {
  constructor(remainingMicroInr: number) {
    super(
      429,
      'insufficient_quota',
      'budget_exceeded',
      `This team's monthly budget is used up (remaining ₹${(Math.max(0, remainingMicroInr) / 1e6).toFixed(4)})`,
    );
  }
}

export interface Reservation {
  teamId: string;
  month: string;
  member: string;
  amount: number;
}

// `{teamId}` is a Redis Cluster hash tag: both keys land on one slot, which
// multi-key Lua scripts require.
const ledgerKey = (teamId: string, month: string) => `bud:{${teamId}}:${month}`;
const reservationsKey = (teamId: string, month: string) => `bud:resv:{${teamId}}:${month}`;

/**
 * Reserve-then-settle budgets. The final cost of an LLM call is only known
 * after it finishes, so each request reserves its worst-case cost up front
 * and swaps it for the real cost at the end. Redis is the hot-path ledger;
 * Postgres request logs are the source of truth it is rebuilt from.
 *
 * Redis failures fail closed: without the ledger the gateway cannot promise
 * a team stays within budget, so it refuses the request.
 */
@Injectable()
export class BudgetService {
  private readonly logger = new Logger(BudgetService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly logs: RequestLogsRepository,
  ) {}

  async reserve(
    teamId: string,
    capMicroInr: number,
    amount: number,
    requestId: string,
  ): Promise<Reservation> {
    const month = monthOf(new Date());
    const member = `${requestId}:${amount}`;
    const expiresAt = Date.now() + this.env.BUDGET_RESERVATION_TTL_SECONDS * 1000;
    const keys = [ledgerKey(teamId, month), reservationsKey(teamId, month)];
    const args = [capMicroInr, amount, member, expiresAt, LEDGER_TTL_SECONDS];

    try {
      let [status, remaining] = await scripts.budgetReserve.run(this.redis, keys, args);
      if (status === -1) {
        await this.hydrate(teamId, month);
        [status, remaining] = await scripts.budgetReserve.run(this.redis, keys, args);
      }
      if (status !== 1) throw new BudgetExceededError(remaining);
      return { teamId, month, member, amount };
    } catch (err) {
      if (err instanceof GatewayError) throw err;
      this.logger.error({ err }, 'Budget reservation failed');
      throw new ServiceUnavailableError(
        'budget_unavailable',
        'Budget tracking is unavailable; request refused so spend stays within budget',
      );
    }
  }

  /** Charges the real cost. Never throws: the request already succeeded. */
  async settle(reservation: Reservation, actualMicroInr: number): Promise<number | null> {
    try {
      const spent = await scripts.budgetSettle.run(
        this.redis,
        [ledgerKey(reservation.teamId, reservation.month), reservationsKey(reservation.teamId, reservation.month)],
        [reservation.member, reservation.amount, Math.max(0, actualMicroInr)],
      );
      return spent === -1 ? null : spent;
    } catch (err) {
      // The sweeper frees the reservation later; the log row keeps the cost.
      this.logger.error({ err, reservation }, 'Budget settle failed');
      return null;
    }
  }

  release(reservation: Reservation): Promise<number | null> {
    return this.settle(reservation, 0);
  }

  /** Spent and reserved this month, for dashboards. Null when Redis has no ledger. */
  async snapshot(teamId: string): Promise<{ spent: number; reserved: number } | null> {
    const ledger = await this.redis.hgetall(ledgerKey(teamId, monthOf(new Date())));
    if (!ledger.spent) return null;
    return { spent: Number(ledger.spent), reserved: Number(ledger.reserved ?? 0) };
  }

  /** Releases reservations whose requests died without settling. */
  async sweepExpired(): Promise<number> {
    let released = 0;
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', 'bud:resv:*', 'COUNT', 200);
      cursor = next;
      for (const key of keys) {
        const ledger = key.replace('bud:resv:', 'bud:');
        released += await scripts.budgetSweep.run(this.redis, [ledger, key], [Date.now()]);
      }
    } while (cursor !== '0');
    if (released > 0) this.logger.warn({ released }, 'Released expired budget reservations');
    return released;
  }

  private async hydrate(teamId: string, month: string): Promise<void> {
    const spent = await this.logs.teamSpendSince(teamId, monthStart(month));
    await scripts.budgetHydrate.run(this.redis, [ledgerKey(teamId, month)], [spent, LEDGER_TTL_SECONDS]);
  }
}
