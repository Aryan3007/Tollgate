import { createTestApp, TEST_ADMIN, type TestApp } from './support/app.js';

// Behaviour of the HTTP layer itself: middleware order, error shapes, headers.

describe('Express app (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  describe('errors', () => {
    it('answers an unknown route with an OpenAI-shaped 404', async () => {
      const res = await t.http().get('/v1/does-not-exist').expect(404);

      expect(res.body).toEqual({
        error: { message: 'Cannot GET /v1/does-not-exist', type: 'invalid_request_error', code: 'http_404', param: null },
      });
    });

    it('treats a POST with no body as an empty object, naming the first missing field', async () => {
      const res = await t.http().post('/v1/admin/auth/login').expect(400);

      expect(res.body).toMatchObject({ error: { code: 'invalid_request', param: 'email' } });
    });

    it('rejects malformed JSON with a 400', async () => {
      const res = await t
        .http()
        .post('/v1/admin/auth/login')
        .set('content-type', 'application/json')
        .send('{"email":')
        .expect(400);

      expect(res.body).toMatchObject({ error: { type: 'invalid_request_error', code: 'entity_parse_failed' } });
    });

    it('rejects a body over the size limit with a 413', async () => {
      const res = await t
        .http()
        .post('/v1/admin/auth/login')
        .set('content-type', 'application/json')
        .send(JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(5 * 1024 * 1024) }))
        .expect(413);

      expect(res.body).toMatchObject({ error: { code: 'entity_too_large' } });
    });

    it('never leaks internals for an unexpected failure', async () => {
      const res = await t.http().get('/v1/admin/keys?limit=abc').auth('not-a-jwt', { type: 'bearer' }).expect(401);

      expect(JSON.stringify(res.body)).not.toMatch(/stack|node_modules|at /);
    });
  });

  describe('request ids and security headers', () => {
    it('assigns a request id to every response', async () => {
      const res = await t.http().get('/health').expect(200);

      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('echoes a well-formed incoming request id, and replaces a malformed one', async () => {
      const kept = await t.http().get('/health').set('x-request-id', 'trace-abc_123').expect(200);
      const replaced = await t.http().get('/health').set('x-request-id', 'bad id with spaces!').expect(200);

      expect(kept.headers['x-request-id']).toBe('trace-abc_123');
      expect(replaced.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('sets secure headers and does not advertise Express', async () => {
      const res = await t.http().get('/health').expect(200);

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('allows the dashboard origin and no other', async () => {
      const allowed = await t.http().options('/v1/admin/keys').set('Origin', 'http://localhost:3000').set('Access-Control-Request-Method', 'GET');
      const other = await t.http().options('/v1/admin/keys').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'GET');

      expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(allowed.headers['access-control-allow-credentials']).toBe('true');
      expect(other.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('API docs', () => {
    it('serves the OpenAPI JSON and the Swagger UI', async () => {
      const json = await t.http().get('/api/docs-json').expect(200);
      const ui = await t.http().get('/api/docs/').expect(200);

      expect(Object.keys(json.body.paths)).toContain('/v1/chat/completions');
      expect(ui.text).toContain('swagger-ui');
    });

    it('serves the JSON but not the UI when the UI is disabled', async () => {
      const prod = await createTestApp({ SWAGGER_UI_ENABLED: 'false' });
      try {
        await prod.http().get('/api/docs-json').expect(200);
        await prod.http().get('/api/docs/').expect(404);
      } finally {
        await prod.close();
      }
    });
  });

  describe('login rate limit', () => {
    it('blocks an IP after too many attempts, in the OpenAI error shape', async () => {
      const limited = await createTestApp({ AUTH_RATE_LIMIT_MAX: '3' });
      try {
        const attempt = () => limited.http().post('/v1/admin/auth/login').send({ ...TEST_ADMIN, password: 'wrong-password' });
        for (let i = 0; i < 3; i++) await attempt().expect(401);

        const blocked = await attempt().expect(429);

        expect(blocked.body).toMatchObject({ error: { type: 'rate_limit_error', code: 'too_many_auth_attempts' } });
        expect(blocked.headers['ratelimit']).toBeDefined();
      } finally {
        await limited.close();
      }
    });
  });
});
