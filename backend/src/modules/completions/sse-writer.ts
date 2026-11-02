import type { Logger } from '@nestjs/common';
import type { Response } from 'express';
import { GatewayError } from '../../common/errors/gateway-error.js';

/**
 * Writes an async iterable as server-sent events, honouring socket
 * backpressure. Once headers are sent, errors can only be reported in-band,
 * so they become a final `data: {"error": ...}` event (OpenAI's convention).
 */
export async function pipeSse(
  res: Response,
  events: AsyncIterable<unknown>,
  signal: AbortSignal,
  logger: Logger,
  /** Extra single-line text sent as an SSE comment after the last chunk (clients ignore comments). */
  trailer?: () => string | undefined,
): Promise<void> {
  res.status(200);
  res.setHeader('content-type', 'text/event-stream; charset=utf-8');
  res.setHeader('cache-control', 'no-cache, no-transform');
  res.setHeader('connection', 'keep-alive');
  res.setHeader('x-accel-buffering', 'no');
  res.flushHeaders();

  try {
    for await (const event of events) {
      if (signal.aborted) return;
      await write(res, `data: ${JSON.stringify(event)}\n\n`);
    }
    const extra = trailer?.();
    if (extra) await write(res, `: ${extra}\n\n`);
    await write(res, 'data: [DONE]\n\n');
  } catch (err) {
    if (signal.aborted) return;
    logger.error({ err }, 'Stream failed after first byte');
    const body =
      err instanceof GatewayError
        ? err.toBody()
        : {
            error: {
              message: 'Stream interrupted',
              type: 'api_error',
              code: 'stream_interrupted',
              param: null,
            },
          };
    await write(res, `data: ${JSON.stringify(body)}\n\n`);
  } finally {
    res.end();
  }
}

function write(res: Response, payload: string): Promise<void> {
  if (res.write(payload)) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      res.off('drain', done);
      res.off('close', done);
      resolve();
    };
    res.once('drain', done);
    res.once('close', done);
  });
}
