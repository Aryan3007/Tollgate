import { ERROR_BODY_TIMEOUT_MS, UpstreamError } from './upstream-error.js';
import { upstreamFetch } from './http.js';

const options = (overrides: Partial<Parameters<typeof upstreamFetch>[0]> = {}) => ({
  provider: 'openai' as const,
  url: 'http://upstream.test/v1/chat/completions',
  headers: {},
  body: {},
  signal: new AbortController().signal,
  ttfbTimeoutMs: 1000,
  ...overrides,
});

describe('upstreamFetch deadlines', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('gives up at the deadline even when fetch ignores the abort signal', async () => {
    vi.stubGlobal('fetch', () => new Promise(() => undefined));
    const result = upstreamFetch(options()).catch((e: unknown) => e);

    await vi.advanceTimersByTimeAsync(1000);

    const err = await result;
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err).toMatchObject({ code: 'upstream_timeout', status: 504, retryable: true });
  });

  it('releases a response that arrives after the deadline', async () => {
    const cancel = vi.fn(() => Promise.resolve());
    let deliver!: (res: unknown) => void;
    vi.stubGlobal('fetch', () => new Promise((resolve) => (deliver = resolve)));
    const result = upstreamFetch(options()).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1000);
    await result;

    deliver({ ok: true, body: { cancel } });
    await vi.advanceTimersByTimeAsync(0);

    expect(cancel).toHaveBeenCalledOnce();
  });

  it('does not report a client disconnect as an upstream timeout', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', (_url: string, init: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
    );
    const result = upstreamFetch(options({ signal: controller.signal })).catch((e: unknown) => e);

    controller.abort();

    expect(await result).not.toBeInstanceOf(UpstreamError);
  });

  it('does not wait forever for an error response body', async () => {
    const hangingBody = new ReadableStream({ start: () => undefined });
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(hangingBody, { status: 500, statusText: 'Internal Server Error' })));
    const result = upstreamFetch(options()).catch((e: unknown) => e);

    await vi.advanceTimersByTimeAsync(ERROR_BODY_TIMEOUT_MS);

    expect(await result).toMatchObject({ code: 'upstream_error', retryable: true });
  });

  it('returns a healthy response untouched', async () => {
    const ok = new Response('{}', { status: 200 });
    vi.stubGlobal('fetch', () => Promise.resolve(ok));

    await expect(upstreamFetch(options())).resolves.toBe(ok);
  });
});
