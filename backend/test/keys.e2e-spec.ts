import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { virtualKeys } from '../src/db/schema/index.js';
import {
  createKey,
  createTeam,
  createTestApp,
  loginAsAdmin,
  resetState,
  type TestApp,
} from './support/app.js';

describe('Admin: /v1/admin/keys (e2e)', () => {
  let t: TestApp;
  let token: string;
  let teamId: string;

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
  });

  const authed = <T extends { auth: (token: string, opts: { type: 'bearer' }) => T }>(req: T) =>
    req.auth(token, { type: 'bearer' });

  describe('POST', () => {
    it('returns the full key once and stores only its hash', async () => {
      const res = await authed(t.http().post('/v1/admin/keys'))
        .send({ teamId, name: 'support-bot', allowedModels: ['gpt-4o-mini'] })
        .expect(201);

      const secret = res.body.secret as string;
      expect(secret).toMatch(/^tg_live_[0-9A-Za-z]{32}$/);
      expect(res.body.key).toMatchObject({
        teamId,
        teamName: 'Customer Support',
        prefix: secret.slice(0, 12),
        status: 'active',
        rpmLimit: null,
      });
      expect(res.body.key).not.toHaveProperty('keyHash');

      const [row] = await t.db.select().from(virtualKeys).where(eq(virtualKeys.id, res.body.key.id));
      expect(row?.keyHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(row)).not.toContain(secret);
    });

    it('returns 400 when allowedModels is empty', async () => {
      const res = await authed(t.http().post('/v1/admin/keys'))
        .send({ teamId, name: 'bot', allowedModels: [] })
        .expect(400);

      expect(res.body).toMatchObject({ error: { param: 'allowedModels' } });
    });

    it('returns 400 when expiresAt is in the past', async () => {
      await authed(t.http().post('/v1/admin/keys'))
        .send({ teamId, name: 'bot', allowedModels: ['gpt-4o-mini'], expiresAt: '2020-01-01T00:00:00Z' })
        .expect(400);
    });

    it('returns 401 without an admin token', async () => {
      await t.http().post('/v1/admin/keys').send({ teamId, name: 'bot', allowedModels: ['gpt-4o-mini'] }).expect(401);
    });

    it('returns 422 when the team does not exist', async () => {
      const res = await authed(t.http().post('/v1/admin/keys'))
        .send({ teamId: randomUUID(), name: 'bot', allowedModels: ['gpt-4o-mini'] })
        .expect(422);

      expect(res.body).toMatchObject({ error: { code: 'team_not_found' } });
    });

    it('returns 422 naming each unknown model', async () => {
      const res = await authed(t.http().post('/v1/admin/keys'))
        .send({ teamId, name: 'bot', allowedModels: ['gpt-4o-mini', 'gpt-9', 'claude-1'] })
        .expect(422);

      expect(res.body.error.message).toContain('gpt-9, claude-1');
    });
  });

  describe('GET list', () => {
    it('filters by status and team, and never exposes secrets', async () => {
      const otherTeam = await createTeam(t, token, { name: 'Growth' });
      const revoked = await createKey(t, token, teamId, { name: 'old' });
      await createKey(t, token, teamId, { name: 'current' });
      await createKey(t, token, otherTeam.id, { name: 'growth-bot' });
      await authed(t.http().post(`/v1/admin/keys/${revoked.id}/revoke`)).expect(200);

      const active = await authed(t.http().get(`/v1/admin/keys?teamId=${teamId}&status=active`)).expect(200);
      expect(active.body.data.map((k: { name: string }) => k.name)).toEqual(['current']);

      const all = await authed(t.http().get('/v1/admin/keys')).expect(200);
      expect(all.body.total).toBe(3);
      expect(JSON.stringify(all.body)).not.toContain(revoked.secret);
    });

    it('returns 400 for an unknown status', async () => {
      await authed(t.http().get('/v1/admin/keys?status=paused')).expect(400);
    });

    it('returns 401 without an admin token', async () => {
      await t.http().get('/v1/admin/keys').expect(401);
    });
  });

  describe('GET one', () => {
    it('returns the key', async () => {
      const key = await createKey(t, token, teamId);

      const res = await authed(t.http().get(`/v1/admin/keys/${key.id}`)).expect(200);

      expect(res.body.id).toBe(key.id);
    });

    it('returns 400 for a malformed id', async () => {
      await authed(t.http().get('/v1/admin/keys/123')).expect(400);
    });

    it('returns 401 without an admin token', async () => {
      await t.http().get(`/v1/admin/keys/${randomUUID()}`).expect(401);
    });

    it('returns 404 for an unknown key', async () => {
      await authed(t.http().get(`/v1/admin/keys/${randomUUID()}`)).expect(404);
    });
  });

  describe('PATCH', () => {
    it('updates scope and resets a limit to the team default with null', async () => {
      const key = await createKey(t, token, teamId, { rpmLimit: 10 });

      const res = await authed(t.http().patch(`/v1/admin/keys/${key.id}`))
        .send({ allowedModels: ['gpt-4o'], rpmLimit: null })
        .expect(200);

      expect(res.body).toMatchObject({ allowedModels: ['gpt-4o'], rpmLimit: null });
    });

    it('returns 400 for an empty body', async () => {
      const key = await createKey(t, token, teamId);

      await authed(t.http().patch(`/v1/admin/keys/${key.id}`)).send({}).expect(400);
    });

    it('returns 401 without an admin token', async () => {
      await t.http().patch(`/v1/admin/keys/${randomUUID()}`).send({ name: 'x' }).expect(401);
    });

    it('returns 404 for an unknown key', async () => {
      await authed(t.http().patch(`/v1/admin/keys/${randomUUID()}`)).send({ name: 'x' }).expect(404);
    });

    it('returns 409 for a revoked key', async () => {
      const key = await createKey(t, token, teamId);
      await authed(t.http().post(`/v1/admin/keys/${key.id}/revoke`)).expect(200);

      const res = await authed(t.http().patch(`/v1/admin/keys/${key.id}`)).send({ name: 'x' }).expect(409);

      expect(res.body).toMatchObject({ error: { code: 'key_revoked' } });
    });
  });

  describe('POST revoke', () => {
    it('revokes the key and is idempotent', async () => {
      const key = await createKey(t, token, teamId);

      const first = await authed(t.http().post(`/v1/admin/keys/${key.id}/revoke`)).expect(200);
      const second = await authed(t.http().post(`/v1/admin/keys/${key.id}/revoke`)).expect(200);

      expect(first.body.status).toBe('revoked');
      expect(second.body.revokedAt).toBe(first.body.revokedAt);
    });

    it('returns 400 for a malformed id', async () => {
      await authed(t.http().post('/v1/admin/keys/nope/revoke')).expect(400);
    });

    it('returns 401 without an admin token', async () => {
      await t.http().post(`/v1/admin/keys/${randomUUID()}/revoke`).expect(401);
    });

    it('returns 404 for an unknown key', async () => {
      await authed(t.http().post(`/v1/admin/keys/${randomUUID()}/revoke`)).expect(404);
    });
  });

  describe('GET /v1/admin/models', () => {
    it('lists enabled models with prices', async () => {
      const res = await authed(t.http().get('/v1/admin/models')).expect(200);

      expect(res.body.total).toBe(4);
      expect(res.body.data[0]).toEqual({
        alias: 'claude-haiku-4-5',
        upstreamName: 'claude-haiku-4-5',
        providerKind: 'anthropic',
        inputUsdPerMtok: 1,
        outputUsdPerMtok: 5,
        supportsJson: true,
        supportsTools: true,
      });
    });

    it('returns 401 without an admin token', async () => {
      await t.http().get('/v1/admin/models').expect(401);
    });
  });
});
