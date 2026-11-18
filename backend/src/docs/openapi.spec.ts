import { buildOpenApiSpec } from './openapi.js';

// The spec is generated from JSDoc in the route files. A YAML slip or a stale
// $ref would otherwise only show up when someone opens /api/docs.

type Json = Record<string, any>;
const spec = buildOpenApiSpec() as unknown as Json;

const operations = Object.entries(spec.paths as Json).flatMap(([path, item]) =>
  Object.entries(item as Json).map(([method, operation]) => ({
    key: `${method.toUpperCase()} ${path}`,
    path,
    operation: operation as Json,
  })),
);

const EXPECTED = [
  'GET /health',
  'GET /ready',
  'POST /v1/chat/completions',
  'GET /v1/models',
  'POST /v1/admin/auth/login',
  'POST /v1/admin/auth/refresh',
  'POST /v1/admin/auth/logout',
  'GET /v1/admin/auth/me',
  'POST /v1/admin/teams',
  'GET /v1/admin/teams',
  'GET /v1/admin/teams/{id}',
  'PATCH /v1/admin/teams/{id}',
  'POST /v1/admin/keys',
  'GET /v1/admin/keys',
  'GET /v1/admin/keys/{id}',
  'PATCH /v1/admin/keys/{id}',
  'POST /v1/admin/keys/{id}/revoke',
  'GET /v1/admin/models',
  'GET /v1/admin/requests',
  'GET /v1/admin/analytics/spend',
  'GET /v1/admin/providers',
];

function collectRefs(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((item) => collectRefs(item, found));
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') found.push(value);
      else collectRefs(value, found);
    }
  }
  return found;
}

function resolve(ref: string): unknown {
  return ref
    .replace(/^#\//, '')
    .split('/')
    .reduce<unknown>((node, part) => (node as Json | undefined)?.[part], spec);
}

describe('OpenAPI spec', () => {
  it('documents every endpoint, and no others', () => {
    expect(operations.map((o) => o.key).sort()).toEqual([...EXPECTED].sort());
  });

  it('has resolvable references everywhere', () => {
    const refs = collectRefs(spec);

    expect(refs.length).toBeGreaterThan(50);
    expect(refs.filter((ref) => resolve(ref) === undefined)).toEqual([]);
  });

  it('describes every operation: tag, summary and a success response', () => {
    for (const { key, operation } of operations) {
      expect(operation.tags, key).toHaveLength(1);
      expect(String(operation.summary ?? '').length, key).toBeGreaterThan(5);
      expect(Object.keys(operation.responses).some((status) => status.startsWith('2')), key).toBe(true);
    }
  });

  it('expands the x-errors shorthand into responses that reference the shared error schema', () => {
    const create = spec.paths['/v1/admin/keys'].post;

    expect(create['x-errors']).toBeUndefined();
    expect(create.responses['422']).toEqual({
      description: 'Team does not exist, or a model is unknown or disabled',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/OpenAIError' } } },
    });
  });

  it('marks which credential each endpoint takes', () => {
    const schemeOf = (key: string) => operations.find((o) => o.key === key)?.operation.security?.[0];

    expect(schemeOf('POST /v1/chat/completions')).toHaveProperty('virtualKey');
    expect(schemeOf('GET /v1/models')).toHaveProperty('virtualKey');
    expect(schemeOf('GET /v1/admin/keys')).toHaveProperty('bearerAuth');
    expect(schemeOf('POST /v1/admin/auth/refresh')).toHaveProperty('refreshCookie');
    expect(schemeOf('POST /v1/admin/auth/login')).toBeUndefined();
    expect(schemeOf('GET /health')).toBeUndefined();
  });

  it('declares every path parameter', () => {
    for (const { key, path, operation } of operations) {
      for (const [, name] of path.matchAll(/\{(\w+)\}/g)) {
        const declared = (operation.parameters as Json[]).some((p) => p.name === name && p.in === 'path' && p.required);
        expect(declared, `${key} {${name}}`).toBe(true);
      }
    }
  });

  it('documents the streaming and stats contract of chat completions', () => {
    const chat = spec.paths['/v1/chat/completions'].post;

    expect(Object.keys(chat.responses['200'].content)).toEqual(['application/json', 'text/event-stream']);
    expect(chat.parameters.map((p: Json) => p.name)).toContain('x-tollgate-stats');
    expect(Object.keys(chat.responses)).toEqual(expect.arrayContaining(['400', '401', '403', '404', '413', '429', '502', '503', '504']));
  });
});
