import OpenAI from 'openai';
import { RequestLogWriter } from '../src/modules/request-logs/request-log.writer.js';
import type { CallStats } from '../src/modules/completions/call-stats.js';
import { createKey, createTeam, createTestApp, loginAsAdmin, resetState, type TestApp } from './support/app.js';

const QUESTION = 'What is your refund policy for damaged items?';

describe('Per-request stats (e2e)', () => {
  let t: TestApp;
  let token: string;
  let secret: string;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetState(t);
    token = await loginAsAdmin(t);
    const team = await createTeam(t, token);
    secret = (await createKey(t, token, team.id)).secret;
  });

  const call = (content: string, headers: Record<string, string> = { 'x-tollgate-stats': '1' }, extra: object = {}) =>
    fetch(`${t.baseURL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}`, ...headers },
      body: JSON.stringify({ model: 'gpt-4o-mini', temperature: 0, messages: [{ role: 'user', content }], ...extra }),
    });
  const statsOf = (res: Response) => JSON.parse(res.headers.get('x-tollgate-stats') ?? 'null') as CallStats | null;
  const cached = () => vi.waitFor(async () => expect((await t.redis.keys('ce:*')).length).toBeGreaterThan(0));

  it('reports cost and tokens for a normal request', async () => {
    const stats = statsOf(await call(QUESTION));

    expect(stats).toMatchObject({
      cache: 'miss',
      provider: 'openai',
      model: 'gpt-4o-mini-2024-07-18',
      inputTokens: 12,
      outputTokens: 8,
      savedTokens: 0,
      savedMicroInr: 0,
      redactions: 0,
      failovers: 0,
    });
    expect(stats!.costMicroInr).toBe(Math.round((12 * 0.15 + 8 * 0.6) * 100));
    expect(stats!.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('reports what a cache hit saved, and that it cost nothing', async () => {
    const first = statsOf(await call(QUESTION))!;
    await cached();

    const hit = statsOf(await call(QUESTION))!;

    expect(hit).toMatchObject({
      cache: 'hit-exact',
      provider: null,
      inputTokens: 0,
      outputTokens: 0,
      costMicroInr: 0,
      savedTokens: first.inputTokens + first.outputTokens,
      savedMicroInr: first.costMicroInr,
    });
  });

  it('reports masked values, and that such requests are never cached', async () => {
    const stats = statsOf(await call('My number is 9876543210, email a@b.com'));

    expect(stats).toMatchObject({ cache: 'skip', redactions: 2 });
  });

  it('adds nothing for callers that do not ask', async () => {
    const res = await call(QUESTION, {});

    expect(res.headers.get('x-tollgate-stats')).toBeNull();
    expect(res.headers.get('x-tollgate-cache')).toBe('miss');
  });

  it('sends no stats with an error', async () => {
    const res = await call(QUESTION, { 'x-tollgate-stats': '1' }, { model: 'gpt-9' });

    expect(res.status).toBe(404);
    expect(res.headers.get('x-tollgate-stats')).toBeNull();
  });

  it('puts a streamed request’s stats after the last chunk, before [DONE]', async () => {
    const res = await call(QUESTION, { 'x-tollgate-stats': '1' }, { stream: true });
    const body = await res.text();

    const lines = body.split('\n').filter(Boolean);
    const trailer = lines.find((line) => line.startsWith(': tollgate-stats '))!;
    expect(lines.at(-1)).toBe('data: [DONE]');
    expect(lines.indexOf(trailer)).toBe(lines.length - 2);
    expect(JSON.parse(trailer.slice(': tollgate-stats '.length))).toMatchObject({
      cache: 'miss',
      outputTokens: 8,
      costMicroInr: expect.any(Number),
    });
  });

  it('reports a streamed cache hit’s savings', async () => {
    await call(QUESTION);
    await cached();

    const body = await (await call(QUESTION, { 'x-tollgate-stats': '1' }, { stream: true })).text();

    const trailer = body.split('\n').find((line) => line.startsWith(': tollgate-stats '))!;
    expect(JSON.parse(trailer.slice(': tollgate-stats '.length))).toMatchObject({ cache: 'hit-exact', costMicroInr: 0 });
  });

  it('does not break SDK clients: the comment line is ignored', async () => {
    const client = new OpenAI({
      apiKey: secret,
      baseURL: `${t.baseURL}/v1`,
      maxRetries: 0,
      defaultHeaders: { 'x-tollgate-stats': '1' },
    });

    const stream = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: QUESTION }],
      stream: true,
    });
    let text = '';
    for await (const chunk of stream) text += chunk.choices[0]?.delta.content ?? '';

    expect(text).toBe('Hello from the mock provider.');
  });

  it('matches what the request log records', async () => {
    const stats = statsOf(await call(QUESTION))!;
    await t.app.get(RequestLogWriter).drain();

    const [row] = (await t.http().get('/v1/admin/requests?limit=1').auth(token, { type: 'bearer' })).body.data;

    expect(row).toMatchObject({ costMicroInr: stats.costMicroInr, inputTokens: stats.inputTokens, cacheStatus: 'miss' });
  });

  it('lets a browser read the stats headers (CORS)', async () => {
    const res = await fetch(`${t.baseURL}/v1/models`, {
      headers: { authorization: `Bearer ${secret}`, origin: 'http://localhost:3000' },
    });

    expect(res.headers.get('access-control-expose-headers')).toContain('x-tollgate-stats');
    expect(res.headers.get('access-control-expose-headers')).toContain('x-tollgate-cache');
  });
});
