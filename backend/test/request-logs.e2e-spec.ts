import { randomUUID } from 'node:crypto';
import { RequestLogWriter } from '../src/modules/request-logs/request-log.writer.js';
import {
  createKey,
  createTeam,
  createTestApp,
  loginAsAdmin,
  resetState,
  type TestApp,
} from './support/app.js';

describe('Request logs and usage (e2e)', () => {
  let t: TestApp;
  let token: string;
  let teamId: string;
  let key: { id: string; secret: string };

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
    key = await createKey(t, token, teamId);
  });

  const chat = (model = 'gpt-4o-mini') =>
    fetch(`${t.baseURL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key.secret}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Hi' }] }),
    });
  const drain = () => t.app.get(RequestLogWriter).drain();
  const admin = (path: string) => t.http().get(path).auth(token, { type: 'bearer' });

  it('logs one row per request with tokens, cost and the request id', async () => {
    const res = await chat();
    await drain();

    const logs = await admin('/v1/admin/requests').expect(200);

    expect(logs.body.total).toBe(1);
    expect(logs.body.data[0]).toMatchObject({
      requestId: res.headers.get('x-request-id'),
      teamId,
      keyId: key.id,
      requestedModel: 'gpt-4o-mini',
      provider: 'openai',
      servedModel: 'gpt-4o-mini-2024-07-18',
      statusCode: 200,
      errorCode: null,
      inputTokens: 1,
      outputTokens: 8,
      costMicroInr: 495,
    });
  });

  it('logs refused requests too, with their error code', async () => {
    await chat('gpt-4o');
    await drain();

    const errors = await admin('/v1/admin/requests?outcome=error').expect(200);

    expect(errors.body.data[0]).toMatchObject({ statusCode: 403, errorCode: 'model_not_allowed', costMicroInr: 0 });
  });

  it('shows month-to-date usage on keys and teams', async () => {
    await chat();
    await chat();
    await drain();

    const keys = await admin('/v1/admin/keys').expect(200);
    const team = await admin(`/v1/admin/teams/${teamId}`).expect(200);

    const expected = { requests: 2, inputTokens: 2, outputTokens: 16, costMicroInr: 990 };
    expect(keys.body.data[0].usage).toEqual(expected);
    expect(team.body.usage).toEqual(expected);
  });

  it('filters by key', async () => {
    const other = await createKey(t, token, teamId, { name: 'other' });
    await chat();
    await drain();

    const mine = await admin(`/v1/admin/requests?keyId=${key.id}`).expect(200);
    const theirs = await admin(`/v1/admin/requests?keyId=${other.id}`).expect(200);

    expect(mine.body.total).toBe(1);
    expect(theirs.body.total).toBe(0);
  });

  it('returns 400 for a malformed keyId', async () => {
    await admin('/v1/admin/requests?keyId=abc').expect(400);
  });

  it('returns 401 without an admin token', async () => {
    await t.http().get('/v1/admin/requests').expect(401);
  });

  it('returns an empty page for a key with no requests', async () => {
    const res = await admin(`/v1/admin/requests?keyId=${randomUUID()}`).expect(200);

    expect(res.body).toEqual({ data: [], page: 1, limit: 20, total: 0 });
  });
});
