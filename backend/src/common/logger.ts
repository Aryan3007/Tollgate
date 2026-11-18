import pino, { type Logger } from 'pino';
import type { Env } from '../config/env.schema.js';

export type { Logger } from 'pino';

const REDACT = ['req.headers.authorization', 'req.headers.cookie'];

function build(level: string, pretty: boolean): Logger {
  return pino({
    level,
    redact: REDACT,
    transport: pretty ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
  });
}

// Replaced by initLogger() at startup. Until then (unit tests, scripts) logs
// go to a plain JSON logger at LOG_LEVEL.
let root: Logger = build(process.env.LOG_LEVEL ?? 'info', false);

/** Creates the process-wide logger from validated config. Call once, first. */
export function initLogger(env: Pick<Env, 'LOG_LEVEL' | 'NODE_ENV'>): Logger {
  root = build(env.LOG_LEVEL, env.NODE_ENV === 'development');
  return root;
}

export function getRootLogger(): Logger {
  return root;
}

/** A logger that tags every line with `context` (the class or component name). */
export function createLogger(context: string): Logger {
  return root.child({ context });
}
