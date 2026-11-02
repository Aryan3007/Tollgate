import { monthOf } from '../src/common/month.js';
import { requestLogs } from '../src/db/schema/index.js';
import { RequestLogWriter } from '../src/modules/request-logs/request-log.writer.js';
import { createKey, createTeam, createTestApp, loginAsAdmin, resetState, type TestApp } from './support/app.js';

describe('Admin: /v1/admin/analytics/spend (e2e)', () => {
  let t: TestApp;
  let token: string;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetState(t);
    token = await loginAsAdmin(t);
  });

  const spend = (query = '') => t.http().get(`/v1/admin/analytics/spend${query}`).auth(token, { type: 'bearer' });

  it('reports totals, a zero-filled daily series, and top teams and models', async () => {
    const team = await createTeam(t, token, { monthlyBudgetMicroInr: 1_000_000 });
    const key = await createKey(t, token, team.id);
    for (let i = 0; i < 2; i++) {
      await fetch(`${t.baseURL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key.secret}` },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'Hi' }] }),
      });
    }
    await t.app.get(RequestLogWriter).drain();

    const res = await spend().expect(200);

    const today = new Date().toISOString().slice(0, 10);
    expect(res.body).toMatchObject({
      month: monthOf(new Date()),
      totals: { requests: 2, errors: 0, cacheHits: 0, savedMicroInr: 0, costMicroInr: 990 },
      totalBudgetMicroInr: 1_000_000,
      byTeam: [{ teamId: team.id, teamName: 'Customer Support', requests: 2, costMicroInr: 990 }],
      byModel: [{ model: 'gpt-4o-mini', requests: 2, costMicroInr: 990 }],
    });
    expect(res.body.daily).toHaveLength(new Date().getUTCDate());
    expect(res.body.daily.at(-1)).toEqual({ date: today, requests: 2, costMicroInr: 990 });
    expect(res.body.projectedMicroInr).toBeGreaterThanOrEqual(990);
  });

  it('reports a past month in full, with the projection equal to the total', async () => {
    const team = await createTeam(t, token);
    await t.db.insert(requestLogs).values({
      requestId: 'old',
      teamId: team.id,
      keyId: team.id,
      requestedModel: 'gpt-4o',
      streamed: false,
      statusCode: 200,
      costMicroInr: 7_000,
      latencyMs: 5,
      createdAt: new Date('2026-02-14T10:00:00Z'),
    });

    const res = await spend('?month=2026-02').expect(200);

    expect(res.body.daily).toHaveLength(28);
    expect(res.body.totals.costMicroInr).toBe(7_000);
    expect(res.body.projectedMicroInr).toBe(7_000);
  });

  it('returns 400 for a malformed month', async () => {
    const res = await spend('?month=2026-13').expect(400);

    expect(res.body).toMatchObject({ error: { param: 'month' } });
  });

  it('returns 401 without an admin token', async () => {
    await t.http().get('/v1/admin/analytics/spend').expect(401);
  });

  it('returns zeros for a month with no traffic', async () => {
    const res = await spend('?month=2025-01').expect(200);

    expect(res.body.totals).toEqual({
      requests: 0,
      errors: 0,
      cacheHits: 0,
      savedMicroInr: 0,
      inputTokens: 0,
      outputTokens: 0,
      costMicroInr: 0,
    });
    expect(res.body.byTeam).toEqual([]);
  });
});
