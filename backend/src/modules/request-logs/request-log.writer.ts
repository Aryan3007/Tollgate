import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { APP_CONFIG } from '../../config/config.module.js';
import type { Env } from '../../config/env.schema.js';
import type { NewRequestLog } from '../../db/schema/index.js';
import { producerConnection, workerConnection } from '../../infra/queue/bull-connection.js';
import { RequestLogsRepository } from './request-logs.repository.js';

const QUEUE = 'request-logs';
const DRAIN_TIMEOUT_MS = 10_000;

type QueuedRow = Omit<NewRequestLog, 'createdAt'> & { createdAt: string };

/**
 * Keeps logging off the request path: rows are buffered in memory, pushed to
 * BullMQ in batches, and a worker writes each batch with one multi-row
 * insert (retried with backoff if Postgres is down).
 *
 * Trade-off: a crash loses at most one flush interval of buffered rows.
 */
@Injectable()
export class RequestLogWriter implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RequestLogWriter.name);
  private buffer: QueuedRow[] = [];
  private timer?: NodeJS.Timeout;
  private queue!: Queue<{ rows: QueuedRow[] }>;
  private worker?: Worker<{ rows: QueuedRow[] }>;

  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    private readonly repo: RequestLogsRepository,
  ) {}

  onModuleInit(): void {
    this.queue = new Queue(QUEUE, {
      connection: producerConnection(this.env),
      defaultJobOptions: {
        attempts: 8,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 10_000,
      },
    });
    this.queue.on('error', (err) => this.logger.warn({ err }, 'Log queue error'));

    if (this.env.WORKER_ENABLED) {
      this.worker = new Worker(QUEUE, (job) => this.repo.insertMany(job.data.rows.map(toRow)), {
        connection: workerConnection(this.env),
        concurrency: 2,
      });
      this.worker.on('failed', (job, err) =>
        this.logger.error({ err, attempts: job?.attemptsMade }, 'Writing request logs failed'),
      );
      this.worker.on('error', (err) => this.logger.warn({ err }, 'Log worker error'));
    }

    this.timer = setInterval(() => void this.flush(), this.env.LOG_FLUSH_INTERVAL_MS);
    this.timer.unref();
  }

  write(row: NewRequestLog): void {
    this.buffer.push({ ...row, createdAt: (row.createdAt ?? new Date()).toISOString() });
    if (this.buffer.length >= this.env.LOG_BATCH_SIZE) void this.flush();
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const rows = this.buffer.splice(0);
    try {
      await this.queue.add('batch', { rows });
    } catch (err) {
      // Redis is down: write straight to Postgres rather than lose the rows.
      this.logger.warn({ err, rows: rows.length }, 'Log queue unavailable; writing directly');
      await this.repo.insertMany(rows.map(toRow)).catch((dbErr: unknown) =>
        this.logger.error({ err: dbErr, rows: rows.length }, 'Dropped request logs'),
      );
    }
  }

  /** Flushes the buffer and waits until the queue is empty (shutdown, tests). */
  async drain(): Promise<void> {
    await this.flush();
    const deadline = Date.now() + DRAIN_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const counts = await this.queue.getJobCounts('waiting', 'active', 'delayed', 'prioritized');
      if (Object.values(counts).every((n) => n === 0)) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    this.logger.warn('Timed out waiting for request logs to drain');
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.flush();
    await this.worker?.close();
    await this.queue.close();
  }
}

function toRow({ createdAt, ...row }: QueuedRow): NewRequestLog {
  return { ...row, createdAt: new Date(createdAt) };
}
