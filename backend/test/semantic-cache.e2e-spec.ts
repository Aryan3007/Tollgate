import OpenAI from 'openai';
import { BudgetService } from '../src/modules/budget/budget.service.js';
import { RequestLogWriter } from '../src/modules/request-logs/request-log.writer.js';
import { createKey, createTeam, createTestApp, loginAsAdmin, resetState, type TestApp } from './support/app.js';

const QUESTION = 'What is your refund policy for damaged items?';
// Shares 8 of 9 words with QUESTION: ~0.94 cosine under the test embedder, above the 0.9 test threshold.
const PARAPHRASE = 'What is your refund policy for damaged items please?';
const UNRELATED = 'How do I reset my password on the mobile app?';

describe('Semantic cache (e2e)', () => {
  let t: TestApp;
  let token: string;
  let teamId: string;
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
    teamId = (await createTeam(t, token)).id;
    secret = (await createKey(t, token, teamId)).secret;
  });

  /** Raw call, so tests can read the x-tollgate-cache header. */
  const call = async (body: object, apiKey = secret) => {
    const res = await fetch(`${t.baseURL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'gpt-4o-mini', temperature: 0, ...body }),
    });
    return { res, cache: res.headers.get('x-tollgate-cache'), json: res.headers.get('content-type')?.includes('json') ? await res.json() : null };
  };
  const ask = (content: string, extra: object = {}, apiKey = secret) => call({ messages: [{ role: 'user', content }], ...extra }, apiKey);
  const logs = async () => {
    await t.app.get(RequestLogWriter).drain();
    const res = await t.http().get('/v1/admin/requests?sortOrder=asc&limit=50').auth(token, { type: 'bearer' }).expect(200);
    return res.body.data as Array<{ cacheStatus: string; costMicroInr: number; savedMicroInr: number; inputTokens: number }>;
  };
  /** The cache write is fire-and-forget, so wait until the exact entry is visible. */
  const settled = () =>
    vi.waitFor(async () => {
      expect((await t.redis.keys('ce:*')).length).toBeGreaterThan(0);
      expect((await t.redis.keys('sc:*')).length).toBeGreaterThan(0);
    });

  const settledExact = () => vi.waitFor(async () => expect((await t.redis.keys('ce:*')).length).toBeGreaterThan(0));

  describe('hits', () => {
    it('answers an identical request from the cache without calling the provider or spending budget', async () => {
      const first = await ask(QUESTION);
      await settled();
      const spentAfterFirst = (await t.app.get(BudgetService).snapshot(teamId))?.spent;

      const second = await ask(QUESTION);

      expect(first.cache).toBe('miss');
      expect(second.cache).toBe('hit-exact');
      expect(second.json.choices[0].message.content).toBe(first.json.choices[0].message.content);
      expect(second.json.id).not.toBe(first.json.id);
      expect(t.mock.requests).toHaveLength(1);
      expect((await t.app.get(BudgetService).snapshot(teamId))?.spent).toBe(spentAfterFirst);
    });

    it('answers a near-identical question from the semantic layer', async () => {
      await ask(QUESTION);
      await settled();

      const hit = await ask(PARAPHRASE);

      expect(hit.cache).toBe('hit-semantic');
      expect(hit.json.choices[0].message.content).toBe('Hello from the mock provider.');
      expect(t.mock.requests).toHaveLength(1);
    });

    it('does not answer an unrelated question from the cache', async () => {
      await ask(QUESTION);
      await settled();

      const other = await ask(UNRELATED);

      expect(other.cache).toBe('miss');
      expect(t.mock.requests).toHaveLength(2);
    });

    it('logs hits with zero cost and the amount saved', async () => {
      await ask(QUESTION);
      await settled();
      await ask(QUESTION);
      await ask(PARAPHRASE);

      const [miss, exact, semantic] = await logs();

      expect(miss).toMatchObject({ cacheStatus: 'miss', savedMicroInr: 0 });
      expect(miss!.costMicroInr).toBeGreaterThan(0);
      expect(exact).toMatchObject({ cacheStatus: 'exact', costMicroInr: 0, savedMicroInr: miss!.costMicroInr });
      expect(semantic).toMatchObject({ cacheStatus: 'semantic', costMicroInr: 0, savedMicroInr: miss!.costMicroInr });
    });

    it('reports hits and savings in the spend analytics', async () => {
      await ask(QUESTION);
      await settled();
      await ask(QUESTION);
      await ask(QUESTION);
      const [miss] = await logs();

      const res = await t.http().get('/v1/admin/analytics/spend').auth(token, { type: 'bearer' }).expect(200);

      expect(res.body.totals).toMatchObject({ requests: 3, cacheHits: 2, savedMicroInr: miss!.costMicroInr * 2 });
    });
  });

  describe('streaming', () => {
    it('replays a cached answer as a normal event stream, with usage when asked', async () => {
      await ask(QUESTION);
      await settled();
      const client = new OpenAI({ apiKey: secret, baseURL: `${t.baseURL}/v1`, maxRetries: 0 });

      const stream = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [{ role: 'user', content: QUESTION }],
        stream: true,
        stream_options: { include_usage: true },
      });
      let text = '';
      let usage: OpenAI.CompletionUsage | undefined;
      let finish: string | null = null;
      for await (const chunk of stream) {
        text += chunk.choices[0]?.delta.content ?? '';
        finish = chunk.choices[0]?.finish_reason ?? finish;
        usage = chunk.usage ?? usage;
      }

      expect(text).toBe('Hello from the mock provider.');
      expect(finish).toBe('stop');
      expect(usage?.completion_tokens).toBeGreaterThan(0);
      expect(t.mock.requests).toHaveLength(1);
    });

    it('caches a streamed answer for later non-streaming requests', async () => {
      const client = new OpenAI({ apiKey: secret, baseURL: `${t.baseURL}/v1`, maxRetries: 0 });
      const stream = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [{ role: 'user', content: QUESTION }],
        stream: true,
      });
      for await (const _chunk of stream) {
        // drain
      }
      await settled();

      const hit = await ask(QUESTION);

      expect(hit.cache).toBe('hit-exact');
    });
  });

  describe('isolation: a cached answer must never reach the wrong caller', () => {
    it('never serves one team’s answer to another team, exactly or semantically', async () => {
      // Each probe comes from a team that has asked nothing before, so any hit would be team A's answer.
      const exactTeam = await createTeam(t, token, { name: 'Growth' });
      const semanticTeam = await createTeam(t, token, { name: 'Sales' });
      const exactSecret = (await createKey(t, token, exactTeam.id)).secret;
      const semanticSecret = (await createKey(t, token, semanticTeam.id)).secret;
      await ask(QUESTION);
      await settled();

      const exact = await ask(QUESTION, {}, exactSecret);
      const semantic = await ask(PARAPHRASE, {}, semanticSecret);

      expect(exact.cache).toBe('miss');
      expect(semantic.cache).toBe('miss');
      expect(t.mock.requests).toHaveLength(3);
    });

    it('does serve a team its own earlier answer, and keeps teams’ entries separate', async () => {
      const otherTeam = await createTeam(t, token, { name: 'Growth' });
      const otherSecret = (await createKey(t, token, otherTeam.id)).secret;
      await ask(QUESTION);
      await ask(QUESTION, {}, otherSecret);
      await settled();

      expect((await ask(PARAPHRASE)).cache).toBe('hit-semantic');
      expect((await ask(PARAPHRASE, {}, otherSecret)).cache).toBe('hit-semantic');
      expect(t.mock.requests).toHaveLength(2);
      expect((await t.redis.keys('ce:*')).length).toBe(2);
    });

    it('still enforces model access on a hit', async () => {
      const gpt4oOnly = (await createKey(t, token, teamId, { name: 'narrow', allowedModels: ['gpt-4o'] })).secret;
      await ask(QUESTION);
      await settled();

      const refused = await ask(QUESTION, {}, gpt4oOnly);

      expect(refused.res.status).toBe(403);
    });

    it('still counts a hit against the key’s rate limit', async () => {
      const limited = (await createKey(t, token, teamId, { name: 'limited', rpmLimit: 2 })).secret;
      await ask(QUESTION, {}, limited);
      await settled();
      expect((await ask(QUESTION, {}, limited)).cache).toBe('hit-exact');

      const third = await ask(QUESTION, {}, limited);

      expect(third.res.status).toBe(429);
    });

    it('does not match across different models, system prompts or parameters', async () => {
      await call({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: 'Be brief.' }, { role: 'user', content: QUESTION }] });
      await settled();

      const otherSystem = await call({ messages: [{ role: 'system', content: 'Answer in Hindi.' }, { role: 'user', content: QUESTION }] });
      const otherParams = await call({ max_tokens: 20, messages: [{ role: 'system', content: 'Be brief.' }, { role: 'user', content: QUESTION }] });
      const sameAgain = await call({ messages: [{ role: 'system', content: 'Be brief.' }, { role: 'user', content: PARAPHRASE }] });

      expect(otherSystem.cache).toBe('miss');
      expect(otherParams.cache).toBe('miss');
      expect(sameAgain.cache).toBe('hit-semantic');
    });

    it('matches on the whole conversation, not just the last message', async () => {
      const turn = (earlier: string) => [
        { role: 'user', content: earlier },
        { role: 'assistant', content: 'Sure.' },
        { role: 'user', content: QUESTION },
      ];
      await call({ messages: turn('I bought a phone') });
      await settled();

      const differentHistory = await call({ messages: turn('I bought a laptop') });

      expect(differentHistory.cache).toBe('miss');
    });

    it('only matches long prompts exactly, because the embedding model truncates them', async () => {
      const long = `${'Please summarise this ticket. '.repeat(40)}Customer says the app crashes on login.`;
      await ask(long);
      await settledExact();
      const embeddedBefore = t.embedder.calls.length;

      const nearDuplicate = await ask(long.replace('crashes on login', 'crashes on signup'));
      const identical = await ask(long);

      expect(nearDuplicate.cache).toBe('miss');
      expect(identical.cache).toBe('hit-exact');
      expect(t.embedder.calls.slice(embeddedBefore)).toHaveLength(0);
    });
  });

  describe('when the cache must not be used', () => {
    it.each([
      ['a temperature above the team limit', { temperature: 0.7 }],
      ['no temperature (the provider default is 1)', { temperature: undefined }],
      ['tools', { tools: [{ type: 'function', function: { name: 'f', parameters: { type: 'object' } } }] }],
      ['several choices', { n: 2 }],
    ])('skips the cache for %s', async (_label, extra) => {
      await ask(QUESTION, extra);
      await ask(QUESTION, extra);

      const rows = await logs();

      expect(rows.map((r) => r.cacheStatus)).toEqual(['skipped', 'skipped']);
      expect(t.mock.requests).toHaveLength(2);
      expect(await t.redis.keys('ce:*')).toHaveLength(0);
    });

    it('never caches a request that had personal data masked', async () => {
      const prompt = 'Call me on 9876543210 about my refund';

      const first = await ask(prompt);
      const second = await ask(prompt);

      expect(first.cache).toBe('skip');
      expect(second.cache).toBe('skip');
      expect(t.mock.requests).toHaveLength(2);
      expect(await t.redis.keys('ce:*')).toHaveLength(0);
      expect(await t.redis.keys('sc:*')).toHaveLength(0);
    });

    it('can be turned off for a team', async () => {
      await t.http().patch(`/v1/admin/teams/${teamId}`).auth(token, { type: 'bearer' }).send({ cacheEnabled: false }).expect(200);

      await ask(QUESTION);
      const second = await ask(QUESTION);

      expect(second.cache).toBe('skip');
      expect(t.mock.requests).toHaveLength(2);
    });

    it('caches warmer requests when the team raises its temperature limit', async () => {
      await t.http().patch(`/v1/admin/teams/${teamId}`).auth(token, { type: 'bearer' }).send({ cacheMaxTemperature: 1 }).expect(200);

      await ask(QUESTION, { temperature: undefined });
      await settled();
      const second = await ask(QUESTION, { temperature: undefined });

      expect(second.cache).toBe('hit-exact');
    });

    it('does not cache failed requests', async () => {
      t.mock.behavior.failStatus = 400;

      expect((await ask(QUESTION)).res.status).toBe(400);

      expect(await t.redis.keys('ce:*')).toHaveLength(0);
    });
  });

  describe('team cache settings', () => {
    it('expires entries after the team’s TTL', async () => {
      await t.http().patch(`/v1/admin/teams/${teamId}`).auth(token, { type: 'bearer' }).send({ cacheTtlSeconds: 30 }).expect(200);

      await ask(QUESTION);
      await settled();

      const [key] = await t.redis.keys('ce:*');
      expect(await t.redis.ttl(key!)).toBeGreaterThan(0);
      expect(await t.redis.ttl(key!)).toBeLessThanOrEqual(30);
    });

    it('rejects an out-of-range temperature limit or TTL', async () => {
      const patch = (body: object) => t.http().patch(`/v1/admin/teams/${teamId}`).auth(token, { type: 'bearer' }).send(body);

      await patch({ cacheMaxTemperature: 3 }).expect(400);
      await patch({ cacheTtlSeconds: 1 }).expect(400);
    });
  });
});
