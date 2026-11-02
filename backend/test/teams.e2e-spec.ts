import { randomUUID } from 'node:crypto';
import { createTeam, createTestApp, loginAsAdmin, resetState, type TestApp } from './support/app.js';

describe('Admin: /v1/admin/teams (e2e)', () => {
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

  const post = (body: object) => t.http().post('/v1/admin/teams').auth(token, { type: 'bearer' }).send(body);

  describe('POST', () => {
    it('creates a team with default limits', async () => {
      const res = await post({ name: 'Customer Support', monthlyBudgetMicroInr: 5_000_000_000 }).expect(201);

      expect(res.body).toMatchObject({
        id: expect.any(String),
        name: 'Customer Support',
        monthlyBudgetMicroInr: 5_000_000_000,
        rpmLimit: 600,
        tpmLimit: 200_000,
        defaultMaxTokens: 1024,
      });
    });

    it('returns 400 when the budget is negative', async () => {
      const res = await post({ name: 'Support', monthlyBudgetMicroInr: -1 }).expect(400);

      expect(res.body).toMatchObject({ error: { param: 'monthlyBudgetMicroInr' } });
    });

    it('returns 400 for unknown fields', async () => {
      await post({ name: 'Support', monthlyBudgetMicroInr: 1, isAdmin: true }).expect(400);
    });

    it('returns 401 without an admin token', async () => {
      await t.http().post('/v1/admin/teams').send({ name: 'Support', monthlyBudgetMicroInr: 1 }).expect(401);
    });

    it('returns 409 when the name is taken', async () => {
      await createTeam(t, token, { name: 'Growth' });

      const res = await post({ name: 'Growth', monthlyBudgetMicroInr: 1 }).expect(409);

      expect(res.body).toMatchObject({ error: { code: 'team_name_taken' } });
    });
  });

  describe('GET list', () => {
    it('paginates, sorts and searches', async () => {
      for (const name of ['Alpha', 'Bravo', 'Charlie']) await createTeam(t, token, { name });

      const page = await t
        .http()
        .get('/v1/admin/teams?limit=2&sortBy=name&sortOrder=asc')
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(page.body).toMatchObject({ page: 1, limit: 2, total: 3 });
      expect(page.body.data.map((team: { name: string }) => team.name)).toEqual(['Alpha', 'Bravo']);

      const search = await t.http().get('/v1/admin/teams?search=rav').auth(token, { type: 'bearer' }).expect(200);
      expect(search.body.data.map((team: { name: string }) => team.name)).toEqual(['Bravo']);
    });

    it('treats LIKE wildcards in search as literal text', async () => {
      await createTeam(t, token, { name: 'Alpha' });

      const res = await t.http().get('/v1/admin/teams?search=%25').auth(token, { type: 'bearer' }).expect(200);

      expect(res.body.total).toBe(0);
    });

    it('returns 400 when limit is over 100', async () => {
      await t.http().get('/v1/admin/teams?limit=500').auth(token, { type: 'bearer' }).expect(400);
    });

    it('returns 401 without an admin token', async () => {
      await t.http().get('/v1/admin/teams').expect(401);
    });
  });

  describe('GET one', () => {
    it('returns the team', async () => {
      const team = await createTeam(t, token);

      const res = await t.http().get(`/v1/admin/teams/${team.id}`).auth(token, { type: 'bearer' }).expect(200);

      expect(res.body.id).toBe(team.id);
    });

    it('returns 400 for a malformed id', async () => {
      await t.http().get('/v1/admin/teams/not-a-uuid').auth(token, { type: 'bearer' }).expect(400);
    });

    it('returns 401 without an admin token', async () => {
      await t.http().get(`/v1/admin/teams/${randomUUID()}`).expect(401);
    });

    it('returns 404 for an unknown team', async () => {
      const res = await t.http().get(`/v1/admin/teams/${randomUUID()}`).auth(token, { type: 'bearer' }).expect(404);

      expect(res.body).toMatchObject({ error: { code: 'not_found' } });
    });
  });

  describe('PATCH', () => {
    it('updates the given fields only', async () => {
      const team = await createTeam(t, token);

      const res = await t
        .http()
        .patch(`/v1/admin/teams/${team.id}`)
        .auth(token, { type: 'bearer' })
        .send({ rpmLimit: 900 })
        .expect(200);

      expect(res.body).toMatchObject({ name: 'Customer Support', rpmLimit: 900 });
    });

    it('accepts every field the dashboard edit form sends in one request', async () => {
      const team = await createTeam(t, token);

      const res = await t
        .http()
        .patch(`/v1/admin/teams/${team.id}`)
        .auth(token, { type: 'bearer' })
        .send({
          name: 'Support (India)',
          monthlyBudgetMicroInr: 7_500_500_000,
          rpmLimit: 120,
          tpmLimit: 90_000,
          defaultMaxTokens: 512,
          piiEntities: ['aadhaar', 'phone'],
          cacheEnabled: false,
          cacheMaxTemperature: 0.5,
        })
        .expect(200);

      expect(res.body).toMatchObject({
        name: 'Support (India)',
        monthlyBudgetMicroInr: 7_500_500_000,
        rpmLimit: 120,
        tpmLimit: 90_000,
        defaultMaxTokens: 512,
        piiEntities: ['aadhaar', 'phone'],
        cacheEnabled: false,
        cacheMaxTemperature: 0.5,
      });
    });

    it('returns 400 for an empty body', async () => {
      const team = await createTeam(t, token);

      await t.http().patch(`/v1/admin/teams/${team.id}`).auth(token, { type: 'bearer' }).send({}).expect(400);
    });

    it('returns 401 without an admin token', async () => {
      await t.http().patch(`/v1/admin/teams/${randomUUID()}`).send({ rpmLimit: 1 }).expect(401);
    });

    it('returns 404 for an unknown team', async () => {
      await t
        .http()
        .patch(`/v1/admin/teams/${randomUUID()}`)
        .auth(token, { type: 'bearer' })
        .send({ rpmLimit: 1 })
        .expect(404);
    });

    it('returns 409 when renaming to a taken name', async () => {
      await createTeam(t, token, { name: 'Growth' });
      const team = await createTeam(t, token, { name: 'Support' });

      await t
        .http()
        .patch(`/v1/admin/teams/${team.id}`)
        .auth(token, { type: 'bearer' })
        .send({ name: 'Growth' })
        .expect(409);
    });
  });
});
