import { eq } from 'drizzle-orm';
import OpenAI from 'openai';
import { monthOf } from '../src/common/month.js';
import { requestLogs, teams } from '../src/db/schema/index.js';
import { BudgetService } from '../src/modules/budget/budget.service.js';
import { RequestLogWriter } from '../src/modules/request-logs/request-log.writer.js';
import {
  createKey,
  createTeam,
  createTestApp,
  loginAsAdmin,
  resetState,
  USD_INR_RATE,
  type TestApp,
} from './support/app.js';

// Prices seeded for gpt-4o-mini in the test catalog.
const IN_PRICE = 0.15;
const OUT_PRICE = 0.6;
const messages = [{ role: 'user' as const, content: 'Hi' }];
const MAX_TOKENS = 100;
// Estimate for the request above: ceil(2 chars / 3) + 4 overhead = 5 input tokens, 100 output.
const ESTIMATE = Math.ceil((5 * IN_PRICE + MAX_TOKENS * OUT_PRICE) * USD_INR_RATE);
// The mock replies "Hello from the mock provider." = 1 prompt + 8 completion tokens.
const ACTUAL = Math.round((1 * IN_PRICE + 8 * OUT_PRICE) * USD_INR_RATE);

describe('Budgets and rate limits (e2e)', () => {
  let t: TestApp;
  let adminToken: string;
  let teamId: string;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetState(t);
    adminToken = await loginAsAdmin(t);
    teamId = (await createTeam(t, adminToken)).id;
  });

  const budget = () => t.app.get(BudgetService);
  const setBudget = (micro: number) =>
    t.db.update(teams).set({ monthlyBudgetMicroInr: micro }).where(eq(teams.id, teamId));
  const call = (secret: string, body: object = {}) =>
    fetch(`${t.baseURL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages, max_tokens: MAX_TOKENS, ...body }),
    });

  describe('atomic budgets', () => {
    it('lets exactly as many of 100 parallel requests through as the budget covers', async () => {
      await setBudget(ESTIMATE * 20 + Math.floor(ESTIMATE / 2));
      const key = await createKey(t, adminToken, teamId);
      // Slow upstream so every request reserves before any settles.
      t.mock.behavior.latencyMs = 150;

      const responses = await Promise.all(Array.from({ length: 100 }, () => call(key.secret)));
      const statuses = responses.map((r) => r.status);
      const refused = await Promise.all(
        responses.filter((r) => r.status === 429).map((r) => r.json() as Promise<{ error: { code: string } }>),
      );

      expect(statuses.filter((s) => s === 200)).toHaveLength(20);
      expect(refused).toHaveLength(80);
      expect(refused.every((body) => body.error.code === 'budget_exceeded')).toBe(true);
      expect(t.mock.requests).toHaveLength(20);
      expect(await budget().snapshot(teamId)).toEqual({ spent: ACTUAL * 20, reserved: 0 });
    });

    it('charges the real cost, not the estimate', async () => {
      const key = await createKey(t, adminToken, teamId);

      expect((await call(key.secret)).status).toBe(200);

      expect(await budget().snapshot(teamId)).toEqual({ spent: ACTUAL, reserved: 0 });
    });

    it('caps output upstream when the client sets no max_tokens', async () => {
      const key = await createKey(t, adminToken, teamId);

      await call(key.secret, { max_tokens: undefined });

      expect(t.mock.requests[0]?.max_completion_tokens).toBe(1024);
    });

    it('releases the reservation when the provider fails', async () => {
      const key = await createKey(t, adminToken, teamId);
      t.mock.behavior.failStatus = 500;

      expect((await call(key.secret)).status).toBe(502);

      expect(await budget().snapshot(teamId)).toEqual({ spent: 0, reserved: 0 });
    });

    it('settles a partial cost and frees the reservation when the client disconnects mid-stream', async () => {
      const key = await createKey(t, adminToken, teamId);
      t.mock.behavior.chunkDelayMs = 50;
      t.mock.behavior.reply = 'z'.repeat(200);
      const client = new OpenAI({ apiKey: key.secret, baseURL: `${t.baseURL}/v1`, maxRetries: 0 });

      const stream = await client.chat.completions.create({ model: 'gpt-4o-mini', messages, stream: true });
      let received = 0;
      for await (const _chunk of stream) {
        if (++received === 3) break;
      }

      await vi.waitFor(async () => {
        const snapshot = await budget().snapshot(teamId);
        expect(snapshot?.reserved).toBe(0);
        expect(snapshot?.spent).toBeGreaterThan(0);
      });
      await t.app.get(RequestLogWriter).drain();
      const [row] = await t.db.select().from(requestLogs);
      expect(row).toMatchObject({ statusCode: 499, errorCode: 'client_closed', streamed: true });
    });

    it('frees reservations of requests that never settled (crash) via the sweeper', async () => {
      await budget().reserve(teamId, 1_000_000, 5_000, 'crashed-request');
      const resvKey = `bud:resv:{${teamId}}:${monthOf(new Date())}`;
      await t.redis.zadd(resvKey, Date.now() - 1, 'crashed-request:5000');

      expect(await budget().sweepExpired()).toBe(1);

      expect(await budget().snapshot(teamId)).toEqual({ spent: 0, reserved: 0 });
    });

    it('rebuilds a lost ledger from the request log', async () => {
      await t.db.insert(requestLogs).values({
        requestId: 'earlier',
        teamId,
        keyId: teamId,
        requestedModel: 'gpt-4o-mini',
        streamed: false,
        statusCode: 200,
        costMicroInr: 50_000,
        latencyMs: 10,
      });
      const key = await createKey(t, adminToken, teamId);

      expect((await call(key.secret)).status).toBe(200);

      expect(await budget().snapshot(teamId)).toEqual({ spent: 50_000 + ACTUAL, reserved: 0 });
    });

    it('refuses requests once the month’s spend has used the budget', async () => {
      await setBudget(ACTUAL);
      const key = await createKey(t, adminToken, teamId);

      const res = await call(key.secret);

      expect(res.status).toBe(429);
      expect(await res.json()).toMatchObject({ error: { type: 'insufficient_quota', code: 'budget_exceeded' } });
    });
  });

  describe('rate limits', () => {
    it('enforces the key requests-per-minute limit with Retry-After', async () => {
      const key = await createKey(t, adminToken, teamId, { rpmLimit: 3 });

      for (let i = 0; i < 3; i++) expect((await call(key.secret)).status).toBe(200);
      const limited = await call(key.secret);

      expect(limited.status).toBe(429);
      expect(Number(limited.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
      expect(await limited.json()).toMatchObject({ error: { code: 'rate_limit_exceeded' } });
      expect(t.mock.requests).toHaveLength(3);
    });

    it('enforces the team limit across all of its keys', async () => {
      await t
        .http()
        .patch(`/v1/admin/teams/${teamId}`)
        .auth(adminToken, { type: 'bearer' })
        .send({ rpmLimit: 2 })
        .expect(200);
      const first = await createKey(t, adminToken, teamId, { name: 'a', rpmLimit: 100 });
      const second = await createKey(t, adminToken, teamId, { name: 'b', rpmLimit: 100 });

      expect((await call(first.secret)).status).toBe(200);
      expect((await call(second.secret)).status).toBe(200);

      expect((await call(first.secret)).status).toBe(429);
    });

    it('rejects a request bigger than a whole minute of tokens instead of asking to retry', async () => {
      const key = await createKey(t, adminToken, teamId, { tpmLimit: 50 });

      const res = await call(key.secret);

      expect(res.status).toBe(429);
      expect(res.headers.get('retry-after')).toBeNull();
      expect(await res.json()).toMatchObject({ error: { code: 'request_too_large' } });
    });
  });
});
