import type { ConnectionOptions } from 'bullmq';
import type { Env } from '../../config/env.schema.js';

/** Producers fail fast so a Redis outage never stalls a request. */
export function producerConnection(env: Env): ConnectionOptions {
  return { url: env.REDIS_URL, enableOfflineQueue: false, maxRetriesPerRequest: 1 };
}

/** Workers block on Redis and must retry forever, as BullMQ requires. */
export function workerConnection(env: Env): ConnectionOptions {
  return { url: env.REDIS_URL, maxRetriesPerRequest: null };
}
