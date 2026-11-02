import OpenAI from 'openai';
import { eq } from 'drizzle-orm';
import { virtualKeys } from '../src/db/schema/index.js';
import {
  createKey,
  createTeam,
  createTestApp,
  loginAsAdmin,
  resetState,
  TTFB_TIMEOUT_MS,
  type TestApp,
} from './support/app.js';

describe('Gateway: /v1/chat/completions and /v1/models (e2e)', () => {
  let t: TestApp;
  let adminToken: string;
  let key: { id: string; secret: string };
  let client: OpenAI;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetState(t);
    adminToken = await loginAsAdmin(t);
    const team = await createTeam(t, adminToken);
    key = await createKey(t, adminToken, team.id, { allowedModels: ['gpt-4o-mini', 'claude-haiku-4-5'] });
    client = clientFor(key.secret);
  });

  const clientFor = (apiKey: string) =>
    new OpenAI({ apiKey, baseURL: `${t.baseURL}/v1`, maxRetries: 0 });
  const messages = [{ role: 'user' as const, content: 'Hi' }];
  const statusOf = (err: unknown) => (err as InstanceType<typeof OpenAI.APIError>).status;
  const codeOf = (err: unknown) => (err as InstanceType<typeof OpenAI.APIError>).code;

  describe('authentication and model access', () => {
    it('rejects a request without a key', async () => {
      const res = await fetch(`${t.baseURL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages }),
      });

      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({
        error: { type: 'authentication_error', code: 'invalid_api_key' },
      });
    });

    it('rejects an unknown key', async () => {
      const err = await clientFor('tg_live_' + 'x'.repeat(32))
        .chat.completions.create({ model: 'gpt-4o-mini', messages })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(OpenAI.AuthenticationError);
    });

    it('rejects a revoked key on the very next request, even when it was cached', async () => {
      await client.chat.completions.create({ model: 'gpt-4o-mini', messages });
      await t.http().post(`/v1/admin/keys/${key.id}/revoke`).auth(adminToken, { type: 'bearer' }).expect(200);

      const err = await client.chat.completions.create({ model: 'gpt-4o-mini', messages }).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(OpenAI.AuthenticationError);
    });

    it('rejects an expired key', async () => {
      await t.db.update(virtualKeys).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(virtualKeys.id, key.id));

      const err = await client.chat.completions.create({ model: 'gpt-4o-mini', messages }).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(OpenAI.AuthenticationError);
    });

    it('returns 403 for a model outside the key scope', async () => {
      const err = await client.chat.completions.create({ model: 'gpt-4o', messages }).catch((e: unknown) => e);

      expect(statusOf(err)).toBe(403);
      expect(codeOf(err)).toBe('model_not_allowed');
      expect(t.mock.requests).toHaveLength(0);
    });

    it('returns 404 for an unknown model', async () => {
      const err = await client.chat.completions.create({ model: 'gpt-9', messages }).catch((e: unknown) => e);

      expect(statusOf(err)).toBe(404);
      expect(codeOf(err)).toBe('model_not_found');
    });

    it('lists only the models the key may call', async () => {
      const list = await client.models.list();

      expect(list.data.map((m) => m.id).sort()).toEqual(['claude-haiku-4-5', 'gpt-4o-mini']);
    });

    it('records when the key was last used', async () => {
      await client.chat.completions.create({ model: 'gpt-4o-mini', messages });

      await vi.waitFor(async () => {
        const [row] = await t.db.select().from(virtualKeys).where(eq(virtualKeys.id, key.id));
        expect(row?.lastUsedAt).toBeInstanceOf(Date);
      });
    });
  });

  describe('proxying', () => {
    it('returns a non-streaming completion and sends the upstream model name', async () => {
      const completion = await client.chat.completions.create({ model: 'gpt-4o-mini', messages });

      expect(completion.choices[0]?.message.content).toBe('Hello from the mock provider.');
      expect(completion.usage?.total_tokens).toBeGreaterThan(0);
      expect(t.mock.requests[0]).toMatchObject({ model: 'gpt-4o-mini-2024-07-18', stream: false });
    });

    it('never forwards the virtual key upstream', async () => {
      await client.chat.completions.create({ model: 'gpt-4o-mini', messages });

      expect(JSON.stringify(t.mock.requests[0])).not.toContain(key.secret);
    });

    it('streams chunks and hides usage when the client did not ask for it', async () => {
      const stream = await client.chat.completions.create({ model: 'gpt-4o-mini', messages, stream: true });

      let text = '';
      let sawUsage = false;
      for await (const chunk of stream) {
        text += chunk.choices[0]?.delta.content ?? '';
        if (chunk.usage) sawUsage = true;
      }

      expect(text).toBe('Hello from the mock provider.');
      expect(sawUsage).toBe(false);
      expect(t.mock.requests[0]?.stream_options).toEqual({ include_usage: true });
    });

    it('forwards the usage chunk when the client asked for it', async () => {
      const stream = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        stream: true,
        stream_options: { include_usage: true },
      });

      let usage: OpenAI.CompletionUsage | undefined;
      for await (const chunk of stream) usage = chunk.usage ?? usage;

      expect(usage?.completion_tokens).toBeGreaterThan(0);
    });

    it('passes unknown OpenAI parameters through to the provider', async () => {
      await client.chat.completions.create({ model: 'gpt-4o-mini', messages, seed: 42 });

      expect(t.mock.requests[0]?.seed).toBe(42);
    });
  });

  describe('errors', () => {
    // A single allowed model means no fallback can hide the upstream error.
    beforeEach(async () => {
      const team = await createTeam(t, adminToken, { name: 'No fallbacks' });
      key = await createKey(t, adminToken, team.id, { allowedModels: ['gpt-4o-mini'] });
      client = clientFor(key.secret);
    });

    it('rejects an invalid body with an OpenAI-shaped 400', async () => {
      const err = await client.chat.completions
        .create({ model: 'gpt-4o-mini', messages: [] })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(OpenAI.BadRequestError);
      expect((err as InstanceType<typeof OpenAI.BadRequestError>).error).toMatchObject({
        type: 'invalid_request_error',
        code: 'invalid_request',
        param: 'messages',
      });
      expect(t.mock.requests).toHaveLength(0);
    });

    it('rejects malformed JSON with a 400', async () => {
      const res = await fetch(`${t.baseURL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key.secret}` },
        body: '{"model":',
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: { type: 'invalid_request_error' } });
    });

    it('maps an upstream 500 to 502', async () => {
      t.mock.behavior.failStatus = 500;

      const err = await client.chat.completions.create({ model: 'gpt-4o-mini', messages }).catch((e: unknown) => e);

      expect(statusOf(err)).toBe(502);
      expect(codeOf(err)).toBe('upstream_error');
    });

    it('returns an HTTP error, not a broken stream, when upstream fails before the first byte', async () => {
      t.mock.behavior.failStatus = 503;

      const res = await fetch(`${t.baseURL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key.secret}` },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages, stream: true }),
      });

      expect(res.status).toBe(502);
      expect(res.headers.get('content-type')).toContain('application/json');
    });

    it('passes an upstream 400 through to the client', async () => {
      t.mock.behavior.failStatus = 400;

      const err = await client.chat.completions.create({ model: 'gpt-4o-mini', messages }).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(OpenAI.BadRequestError);
      expect(codeOf(err)).toBe('upstream_invalid_request');
    });

    it('returns 504 when upstream does not respond in time', async () => {
      t.mock.behavior.latencyMs = TTFB_TIMEOUT_MS * 3;

      const err = await client.chat.completions.create({ model: 'gpt-4o-mini', messages }).catch((e: unknown) => e);

      expect(statusOf(err)).toBe(504);
    });
  });

  describe('streaming lifecycle', () => {
    it('does not time out a slow stream that is still producing tokens', async () => {
      t.mock.behavior.chunkDelayMs = 40;
      t.mock.behavior.reply = 'x'.repeat(60);

      const stream = await client.chat.completions.create({ model: 'gpt-4o-mini', messages, stream: true });
      let text = '';
      for await (const chunk of stream) text += chunk.choices[0]?.delta.content ?? '';

      expect(text).toHaveLength(60);
    });

    it('cancels the upstream request when the client disconnects mid-stream', async () => {
      t.mock.behavior.chunkDelayMs = 50;
      t.mock.behavior.reply = 'y'.repeat(200);

      const stream = await client.chat.completions.create({ model: 'gpt-4o-mini', messages, stream: true });
      let received = 0;
      // Breaking out of the loop makes the SDK abort the HTTP request.
      for await (const _chunk of stream) {
        if (++received === 2) break;
      }

      await vi.waitFor(() => expect(t.mock.aborted).toBe(1), { timeout: 2000 });
    });
  });

  describe('service endpoints', () => {
    it('reports liveness, readiness and the OpenAPI document', async () => {
      await t.http().get('/health').expect(200);
      const ready = await t.http().get('/ready').expect(200);
      expect(ready.body).toEqual({ status: 'ready', checks: { postgres: 'up', redis: 'up' } });

      const doc = await t.http().get('/api/docs-json').expect(200);
      expect(Object.keys((doc.body as { paths: object }).paths)).toEqual(
        expect.arrayContaining(['/v1/chat/completions', '/v1/models', '/v1/admin/keys', '/v1/admin/teams']),
      );
    });
  });
});
