import OpenAI from 'openai';
import { RequestLogWriter } from '../src/modules/request-logs/request-log.writer.js';
import { BudgetService } from '../src/modules/budget/budget.service.js';
import { BreakerRegistry } from '../src/modules/providers/circuit-breaker/breaker-registry.js';
import {
  createKey,
  createTeam,
  createTestApp,
  loginAsAdmin,
  resetState,
  type TestApp,
} from './support/app.js';

const ALL_MODELS = ['gpt-4o-mini', 'llama-3.3-70b', 'claude-haiku-4-5'];
const messages = [{ role: 'user' as const, content: 'Hi' }];

describe('Routing and failover (e2e)', () => {
  let t: TestApp;
  let token: string;
  let teamId: string;
  let client: OpenAI;

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
    const key = await createKey(t, token, teamId, { allowedModels: ALL_MODELS });
    client = new OpenAI({ apiKey: key.secret, baseURL: `${t.baseURL}/v1`, maxRetries: 0 });
  });

  const latestLog = async () => {
    await t.app.get(RequestLogWriter).drain();
    const res = await t.http().get('/v1/admin/requests?limit=1').auth(token, { type: 'bearer' }).expect(200);
    return res.body.data[0];
  };

  describe('adapters', () => {
    it('serves an Anthropic model through the OpenAI API', async () => {
      const completion = await client.chat.completions.create({
        model: 'claude-haiku-4-5',
        messages: [
          { role: 'system', content: 'Be brief.' },
          { role: 'user', content: 'Hi' },
        ],
      });

      expect(completion.choices[0]?.message.content).toBe('Hello from the mock provider.');
      expect(completion.usage?.completion_tokens).toBe(8);
      expect(t.backup.requests[0]).toMatchObject({ model: 'claude-haiku-4-5', system: 'Be brief.', max_tokens: 1024 });
    });

    it('streams an Anthropic model as OpenAI chunks', async () => {
      const stream = await client.chat.completions.create({
        model: 'claude-haiku-4-5',
        messages,
        stream: true,
        stream_options: { include_usage: true },
      });

      let text = '';
      let usage: OpenAI.CompletionUsage | undefined;
      for await (const chunk of stream) {
        text += chunk.choices[0]?.delta.content ?? '';
        usage = chunk.usage ?? usage;
      }

      expect(text).toBe('Hello from the mock provider.');
      expect(usage?.total_tokens).toBe(9);
    });

    it('serves a Groq model and sends its upstream name', async () => {
      await client.chat.completions.create({ model: 'llama-3.3-70b', messages });

      expect(t.backup.requests[0]?.model).toBe('llama-3.3-70b-versatile');
    });
  });

  describe('failover', () => {
    it('moves to the next provider when the first fails, and bills that provider', async () => {
      t.mock.behavior.failStatus = 503;

      const completion = await client.chat.completions.create({ model: 'gpt-4o-mini', messages });

      expect(completion.choices[0]?.message.content).toBe('Hello from the mock provider.');
      expect(await latestLog()).toMatchObject({
        requestedModel: 'gpt-4o-mini',
        provider: 'groq',
        servedModel: 'llama-3.3-70b-versatile',
        failoverCount: 1,
        statusCode: 200,
        costMicroInr: Math.round((1 * 0.59 + 8 * 0.79) * 100),
      });
    });

    it('fails over a stream before the first byte, invisibly to the client', async () => {
      t.mock.behavior.failStatus = 500;

      const stream = await client.chat.completions.create({ model: 'gpt-4o-mini', messages, stream: true });
      let text = '';
      for await (const chunk of stream) text += chunk.choices[0]?.delta.content ?? '';

      expect(text).toBe('Hello from the mock provider.');
    });

    it('does not fail over a client mistake', async () => {
      t.mock.behavior.failStatus = 400;

      const err = await client.chat.completions.create({ model: 'gpt-4o-mini', messages }).catch((e: unknown) => e);

      expect((err as InstanceType<typeof OpenAI.APIError>).status).toBe(400);
      expect(t.backup.requests).toHaveLength(0);
    });

    it('never fails over to a model outside the key scope', async () => {
      const narrow = await createKey(t, token, teamId, { name: 'narrow', allowedModels: ['gpt-4o-mini'] });
      const narrowClient = new OpenAI({ apiKey: narrow.secret, baseURL: `${t.baseURL}/v1`, maxRetries: 0 });
      t.mock.behavior.failStatus = 500;

      const err = await narrowClient.chat.completions.create({ model: 'gpt-4o-mini', messages }).catch((e: unknown) => e);

      expect((err as InstanceType<typeof OpenAI.APIError>).status).toBe(502);
      expect(t.backup.requests).toHaveLength(0);
    });

    it('skips fallbacks that cannot serve the request', async () => {
      t.mock.behavior.failStatus = 500;

      const err = await client.chat.completions.create({ model: 'gpt-4o-mini', messages, n: 2 }).catch((e: unknown) => e);

      expect((err as InstanceType<typeof OpenAI.APIError>).status).toBe(502);
      expect(t.backup.requests).toHaveLength(0);
    });

    it('returns 503 listing the providers when every candidate fails', async () => {
      t.mock.behavior.failStatus = 500;
      t.backup.behavior.failStatus = 500;

      const err = await client.chat.completions.create({ model: 'gpt-4o-mini', messages }).catch((e: unknown) => e);

      expect((err as InstanceType<typeof OpenAI.APIError>).status).toBe(503);
      expect((err as InstanceType<typeof OpenAI.APIError>).code).toBe('all_providers_failed');
      expect((err as Error).message).toContain('openai, groq, anthropic');
    });

    it('holds budget for the priciest candidate and settles to the provider that served', async () => {
      t.mock.behavior.latencyMs = 100;
      const pending = client.chat.completions.create({ model: 'gpt-4o-mini', messages, max_tokens: 100 });
      await new Promise((resolve) => setTimeout(resolve, 50));

      const during = await t.app.get(BudgetService).snapshot(teamId);
      await pending;

      expect(during?.reserved).toBe(Math.ceil((5 * 1 + 100 * 5) * 100));
      expect(await t.app.get(BudgetService).snapshot(teamId)).toMatchObject({ reserved: 0 });
    });
  });

  describe('circuit breaker', () => {
    it('stops calling a failing provider, with no failed requests during the outage', async () => {
      t.mock.behavior.failStatus = 500;

      for (let i = 0; i < 8; i++) {
        const completion = await client.chat.completions.create({ model: 'gpt-4o-mini', messages });
        expect(completion.choices[0]?.message.content).toBeTruthy();
      }

      expect(t.mock.requests).toHaveLength(5);
      expect(t.backup.requests).toHaveLength(8);
      expect(t.app.get(BreakerRegistry).for('openai').current).toBe('open');
      expect(await latestLog()).toMatchObject({ provider: 'groq', failoverCount: 0 });
    });

    it('reports breaker state on the provider health endpoint', async () => {
      t.mock.behavior.failStatus = 500;
      for (let i = 0; i < 5; i++) await client.chat.completions.create({ model: 'gpt-4o-mini', messages });
      await t.app.get(RequestLogWriter).drain();

      const res = await t.http().get('/v1/admin/providers').auth(token, { type: 'bearer' }).expect(200);

      const byKind = Object.fromEntries(res.body.map((p: { kind: string }) => [p.kind, p]));
      expect(byKind.openai).toMatchObject({ breaker: 'open', configured: true });
      expect(byKind.groq).toMatchObject({ breaker: 'closed', window: { requests: 5, errors: 0 } });
      expect(byKind.groq.window.p95Ms).toEqual(expect.any(Number));
    });

    it('requires an admin token for provider health', async () => {
      await t.http().get('/v1/admin/providers').expect(401);
    });
  });
});
