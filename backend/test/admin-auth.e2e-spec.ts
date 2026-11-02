import { createTestApp, resetState, TEST_ADMIN, type TestApp } from './support/app.js';

const REFRESH = '/v1/admin/auth/refresh';

function refreshCookie(res: { headers: Record<string, unknown> }): string {
  const cookies = res.headers['set-cookie'] as string[] | undefined;
  const cookie = cookies?.find((c) => c.startsWith('tg_refresh='));
  if (!cookie) throw new Error('No refresh cookie set');
  return cookie.split(';')[0]!;
}

describe('Admin auth (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetState(t);
  });

  const login = () => t.http().post('/v1/admin/auth/login').send(TEST_ADMIN);

  describe('POST /v1/admin/auth/login', () => {
    it('returns an access token and sets a locked-down refresh cookie', async () => {
      const res = await login().expect(200);

      expect(res.body).toMatchObject({
        tokenType: 'Bearer',
        expiresIn: 900,
        admin: { email: TEST_ADMIN.email },
      });
      expect(res.body).not.toHaveProperty('refreshToken');
      const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!;
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Strict/);
      expect(cookie).toMatch(/Path=\/v1\/admin\/auth/);
    });

    it('treats the email case-insensitively', async () => {
      await t
        .http()
        .post('/v1/admin/auth/login')
        .send({ ...TEST_ADMIN, email: TEST_ADMIN.email.toUpperCase() })
        .expect(200);
    });

    it('returns 400 when the email is malformed', async () => {
      const res = await t
        .http()
        .post('/v1/admin/auth/login')
        .send({ email: 'not-an-email', password: 'x' })
        .expect(400);

      expect(res.body).toMatchObject({ error: { param: 'email' } });
    });

    it('returns the same 401 for a wrong password and an unknown email', async () => {
      const wrongPassword = await t
        .http()
        .post('/v1/admin/auth/login')
        .send({ ...TEST_ADMIN, password: 'wrong-password' })
        .expect(401);
      const unknownEmail = await t
        .http()
        .post('/v1/admin/auth/login')
        .send({ ...TEST_ADMIN, email: 'nobody@tollgate.test' })
        .expect(401);

      expect(wrongPassword.body).toEqual(unknownEmail.body);
      expect(wrongPassword.body).toMatchObject({ error: { code: 'invalid_credentials' } });
    });
  });

  describe('GET /v1/admin/auth/me', () => {
    it('returns the signed-in admin', async () => {
      const { body } = await login();

      const res = await t.http().get('/v1/admin/auth/me').auth(body.accessToken, { type: 'bearer' }).expect(200);

      expect(res.body).toEqual({ id: expect.any(String), email: TEST_ADMIN.email });
    });

    it('returns 401 without a token', async () => {
      const res = await t.http().get('/v1/admin/auth/me').expect(401);

      expect(res.body).toMatchObject({ error: { code: 'missing_token' } });
    });

    it('returns 401 for a tampered token', async () => {
      const { body } = await login();
      const tampered = `${body.accessToken as string}x`;

      const res = await t.http().get('/v1/admin/auth/me').auth(tampered, { type: 'bearer' }).expect(401);

      expect(res.body).toMatchObject({ error: { code: 'invalid_token' } });
    });

    it('does not accept a virtual key as an admin token', async () => {
      await t.http().get('/v1/admin/auth/me').auth(`tg_live_${'a'.repeat(32)}`, { type: 'bearer' }).expect(401);
    });
  });

  describe('POST /v1/admin/auth/refresh', () => {
    it('rotates the refresh token and issues a new access token', async () => {
      const first = refreshCookie(await login());

      const res = await t.http().post(REFRESH).set('Cookie', first).expect(200);

      expect(res.body).toMatchObject({ accessToken: expect.any(String) });
      expect(refreshCookie(res)).not.toBe(first);
    });

    it('returns 401 without a refresh cookie', async () => {
      const res = await t.http().post(REFRESH).expect(401);

      expect(res.body).toMatchObject({ error: { code: 'invalid_refresh_token' } });
    });

    it('revokes the whole session family when an old refresh token is reused', async () => {
      const first = refreshCookie(await login());
      const second = refreshCookie(await t.http().post(REFRESH).set('Cookie', first).expect(200));

      await t.http().post(REFRESH).set('Cookie', first).expect(401);

      await t.http().post(REFRESH).set('Cookie', second).expect(401);
    });

    it('stops working after logout', async () => {
      const cookie = refreshCookie(await login());

      await t.http().post('/v1/admin/auth/logout').set('Cookie', cookie).expect(204);

      await t.http().post(REFRESH).set('Cookie', cookie).expect(401);
    });
  });
});
