import { existsSync } from 'node:fs';
import type { Server } from 'node:http';
import { createApp } from './app.js';
import { getRootLogger } from './common/logger.js';
import { loadEnv, type Env } from './config/env.schema.js';
import { createContainer } from './container.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const SHUTDOWN_TIMEOUT_MS = 15_000;

let env: Env;
try {
  env = loadEnv();
} catch (err) {
  // A readable list of what is wrong beats a stack trace.
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

const container = await createContainer(env);
await container.start();

const logger = getRootLogger();
const server: Server = createApp(container).listen(env.PORT);
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
logger.info({ port: env.PORT }, 'Tollgate listening');

let shuttingDown = false;

/** Stops accepting connections, lets in-flight requests (and streams) finish, then closes Redis and Postgres. */
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');

  const force = setTimeout(() => {
    logger.error('Shutdown timed out; exiting');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  force.unref();

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await container.stop();
  process.exit(0);
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
