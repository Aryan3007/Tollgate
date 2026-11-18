import { createLogger } from '../../common/logger.js';
import { Queue, Worker } from 'bullmq';
import type { Env } from '../../config/env.schema.js';
import { producerConnection, workerConnection } from '../../infra/queue/bull-connection.js';
import { BudgetService } from './budget.service.js';

const QUEUE = 'budget-sweep';
const EVERY_MS = 30_000;

/**
 * Runs the expired-reservation sweep every 30 s. A BullMQ job scheduler (not
 * setInterval) so only one instance runs each sweep, however many are up.
 */
export class BudgetSweeper {
  private readonly logger = createLogger(BudgetSweeper.name);
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    private readonly env: Env,
    private readonly budget: BudgetService,
  ) {}

  async start(): Promise<void> {
    if (!this.env.WORKER_ENABLED) return;

    this.queue = new Queue(QUEUE, { connection: producerConnection(this.env) });
    this.queue.on('error', (err) => this.logger.warn({ err }, 'Sweep queue error'));
    this.worker = new Worker(QUEUE, () => this.budget.sweepExpired(), {
      connection: workerConnection(this.env),
    });
    this.worker.on('error', (err) => this.logger.warn({ err }, 'Sweep worker error'));

    try {
      await this.queue.upsertJobScheduler('sweep', { every: EVERY_MS }, {
        name: 'sweep',
        opts: { removeOnComplete: 10, removeOnFail: 100 },
      });
    } catch (err) {
      this.logger.error({ err }, 'Could not schedule the budget sweep');
    }
  }

  async stop(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
