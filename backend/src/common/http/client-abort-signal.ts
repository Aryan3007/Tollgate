import type { Response } from 'express';

/** Aborts when the client disconnects before the response finished. */
export function clientAbortSignal(res: Response): AbortSignal {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) controller.abort();
  });
  return controller.signal;
}
