import type { Redis } from 'ioredis';
import { ServiceUnavailableError } from '../../common/errors/gateway-error.js';
import type { Env } from '../../config/env.schema.js';
import type { RequestLogsRepository } from '../request-logs/request-logs.repository.js';
import { BudgetService } from './budget.service.js';

const env = { BUDGET_RESERVATION_TTL_SECONDS: 900 } as Env;
const down = () => Promise.reject(new Error('Connection is closed'));

function serviceWithRedisDown() {
  const redis = { evalsha: vi.fn(down), eval: vi.fn(down) } as unknown as Redis;
  const logs = { teamSpendSince: vi.fn() } as unknown as RequestLogsRepository;
  return new BudgetService(env, redis, logs);
}

describe('BudgetService when Redis is down', () => {
  it('fails closed: refuses the request rather than risk overspending', async () => {
    await expect(serviceWithRedisDown().reserve('team', 1000, 10, 'req')).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );
  });

  it('does not throw from settle, because the request already succeeded', async () => {
    const reservation = { teamId: 'team', month: '2026-10', member: 'req:10', amount: 10 };

    await expect(serviceWithRedisDown().settle(reservation, 5)).resolves.toBeNull();
  });
});
