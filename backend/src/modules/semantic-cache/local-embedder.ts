import { createLogger } from '../../common/logger.js';
import { Worker } from 'node:worker_threads';
import type { Env } from '../../config/env.schema.js';
import { Embedder, EmbedderUnavailableError } from './embedder.js';

const RESTART_DELAY_MS = 10_000;

type Reply = { ready: true } | { fatal: string } | { id: number; vector: Float32Array } | { id: number; error: string };

/**
 * all-MiniLM-L6-v2 running locally in one worker thread: no network hop and
 * no per-call cost. The first start downloads the model (~25 MB), so boot
 * never waits for it: until it is ready the semantic cache is simply skipped
 * and everything else keeps working.
 */
export class LocalEmbedder extends Embedder {
  readonly dimensions = 384;
  private readonly logger = createLogger(LocalEmbedder.name);
  private worker?: Worker;
  private isReady = false;
  private stopped = false;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (v: Float32Array) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();

  constructor(private readonly env: Env) {
    super();
  }

  get ready(): boolean {
    return this.isReady;
  }

  override start(): void {
    this.spawnWorker();
  }

  embed(text: string): Promise<Float32Array> {
    const worker = this.worker;
    if (!worker || !this.isReady) return Promise.reject(new EmbedderUnavailableError('model not loaded'));

    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new EmbedderUnavailableError('timed out'));
      }, this.env.EMBEDDER_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      worker.postMessage({ id, text });
    });
  }

  override async stop(): Promise<void> {
    this.stopped = true;
    await this.worker?.terminate();
  }

  private spawnWorker(): void {
    // Running from src/ (tsx, dev) the worker is TypeScript; from dist/ it is compiled JS.
    const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js';
    const worker = new Worker(new URL(`./embedder.worker.${extension}`, import.meta.url), {
      workerData: { model: this.env.EMBEDDER_MODEL, cacheDir: this.env.EMBEDDER_CACHE_DIR },
    });
    this.worker = worker;

    worker.on('message', (reply: Reply) => {
      if ('ready' in reply) {
        this.isReady = true;
        this.logger.info('Embedding model ready; semantic cache enabled');
      } else if ('fatal' in reply) {
        this.logger.error({ reason: reply.fatal }, 'Embedding model failed to load; semantic cache disabled');
      } else {
        const waiter = this.pending.get(reply.id);
        if (!waiter) return;
        clearTimeout(waiter.timer);
        this.pending.delete(reply.id);
        if ('error' in reply) waiter.reject(new EmbedderUnavailableError(reply.error));
        else waiter.resolve(reply.vector);
      }
    });

    worker.on('exit', () => {
      this.isReady = false;
      for (const [id, waiter] of this.pending) {
        clearTimeout(waiter.timer);
        waiter.reject(new EmbedderUnavailableError('worker stopped'));
        this.pending.delete(id);
      }
      if (this.stopped) return;
      this.logger.warn('Embedding worker stopped; restarting');
      setTimeout(() => this.spawnWorker(), RESTART_DELAY_MS).unref();
    });
    worker.on('error', (err) => this.logger.error({ err }, 'Embedding worker error'));
  }
}
