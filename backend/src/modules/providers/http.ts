import { UpstreamError } from './upstream-error.js';
import type { ProviderKind } from './types.js';

export interface UpstreamFetchOptions {
  provider: ProviderKind;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  signal: AbortSignal;
  ttfbTimeoutMs: number;
}

/**
 * POSTs JSON upstream. The timeout covers only the wait for response headers:
 * a long stream that is actively producing tokens must not be cut off.
 *
 * The deadline is enforced by racing the request, not only by aborting it:
 * fetch can be slow to honour an abort while a DNS lookup or connect is
 * stalled, which let a "30 s" timeout run for minutes.
 */
export async function upstreamFetch(opts: UpstreamFetchOptions): Promise<Response> {
  const ttfb = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ttfb.abort();
      reject(UpstreamError.timeout(opts.provider, opts.ttfbTimeoutMs));
    }, opts.ttfbTimeoutMs);
  });

  const request = fetch(opts.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...opts.headers },
    body: JSON.stringify(opts.body),
    signal: AbortSignal.any([opts.signal, ttfb.signal]),
  });

  let res: Response;
  try {
    res = await Promise.race([request, deadline]);
  } catch (err) {
    // If the deadline won, the request may still settle later: release it.
    request.then((late) => late.body?.cancel(), () => undefined);
    if (opts.signal.aborted) throw err;
    if (err instanceof UpstreamError) throw err;
    if (ttfb.signal.aborted) throw UpstreamError.timeout(opts.provider, opts.ttfbTimeoutMs);
    throw UpstreamError.network(opts.provider, err);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw await UpstreamError.fromResponse(opts.provider, res);
  return res;
}
