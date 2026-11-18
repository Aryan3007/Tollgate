import { KEY_STATUSES } from '../modules/keys/dto/key.schemas.js';
import { PII_ENTITIES } from '../modules/pii/detectors/index.js';

// Reusable OpenAPI components. Route files reference them with $ref, so each
// shape is described once. Money is always micro-rupees (₹1 = 1,000,000).

type Schema = Record<string, unknown>;

const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const withDescription = (schema: Schema, description?: string): Schema =>
  description ? { ...schema, description } : schema;

const str = (example: string, description?: string, extra: Schema = {}): Schema =>
  withDescription({ type: 'string', example, ...extra }, description);
const int = (example: number, description?: string, extra: Schema = {}): Schema =>
  withDescription({ type: 'integer', example, ...extra }, description);
const num = (example: number, description?: string, extra: Schema = {}): Schema =>
  withDescription({ type: 'number', example, ...extra }, description);
const bool = (example: boolean, description?: string, extra: Schema = {}): Schema =>
  withDescription({ type: 'boolean', example, ...extra }, description);
const uuid = (example: string, description?: string): Schema => str(example, description, { format: 'uuid' });
const dateTime = (example: string, description?: string): Schema => str(example, description, { format: 'date-time' });
const nullable = (schema: Schema): Schema => ({ ...schema, nullable: true });
const arrayOf = (items: Schema, extra: Schema = {}): Schema => ({ type: 'array', items, ...extra });
const enumOf = (values: readonly string[], example: string, description?: string): Schema =>
  withDescription({ type: 'string', enum: [...values], example }, description);

/** Object whose listed properties are all required unless `optional` names them. */
const obj = (properties: Record<string, Schema>, optional: string[] = [], extra: Schema = {}): Schema => {
  const required = Object.keys(properties).filter((key) => !optional.includes(key));
  // OpenAPI 3.0 forbids an empty `required` array.
  return { type: 'object', properties, ...(required.length > 0 ? { required } : {}), ...extra };
};

const TEAM_ID = '0b8f7c1e-3f4a-4c2d-9a51-6e2f0d7b9c11';
const KEY_ID = '5d2c9a3e-1b7f-4e8a-b0c4-2f6d8e1a9b37';
const PROVIDERS = ['openai', 'anthropic', 'groq'] as const;
const CACHE_STATUSES = ['miss', 'exact', 'semantic', 'skipped'] as const;

const paginated = (item: string, total: number): Schema =>
  obj({
    data: arrayOf(ref(item)),
    page: int(1),
    limit: int(20),
    total: int(total),
  });

export const schemas: Record<string, Schema> = {
  // ── errors ────────────────────────────────────────────────────────────────
  OpenAIError: obj({
    error: obj({
      message: str('messages: Too small: expected array to have >=1 items'),
      type: enumOf(
        ['invalid_request_error', 'authentication_error', 'permission_error', 'rate_limit_error', 'insufficient_quota', 'api_error'],
        'invalid_request_error',
      ),
      code: str('invalid_request', 'Machine-readable error code'),
      param: nullable(str('messages', 'Request field that caused the error')),
    }),
  }),

  // ── chat completions ──────────────────────────────────────────────────────
  ChatMessage: obj(
    {
      role: enumOf(['system', 'developer', 'user', 'assistant', 'tool'], 'user', 'Author of the message'),
      content: nullable(
        str(
          'Summarise our refund policy in two lines.',
          'Message text, max 1,000,000 characters. Content-part arrays (text, image_url) are also accepted and passed through unchanged.',
        ),
      ),
      name: str('support-bot', 'Optional participant name', { maxLength: 64 }),
    },
    ['name'],
  ),
  ChatCompletionRequest: obj(
    {
      model: str('gpt-4o-mini', 'Model to call', { maxLength: 128 }),
      messages: arrayOf(ref('ChatMessage'), {
        minItems: 1,
        maxItems: 2048,
        description: 'Conversation so far, oldest first',
      }),
      stream: bool(false, 'Stream the response as server-sent events (`text/event-stream`), ending with `data: [DONE]`.'),
      stream_options: obj(
        { include_usage: bool(true, 'When true, a final chunk with token usage and empty choices is sent before [DONE].') },
        ['include_usage'],
        { description: 'Streaming options; only used when stream is true' },
      ),
      temperature: num(0, 'Sampling temperature', { minimum: 0, maximum: 2 }),
      max_tokens: int(256, 'Maximum tokens to generate', { minimum: 1 }),
      max_completion_tokens: int(256, 'Newer alias of max_tokens used by reasoning models', { minimum: 1 }),
      n: int(1, 'Number of choices to generate', { minimum: 1, maximum: 8 }),
    },
    ['stream', 'stream_options', 'temperature', 'max_tokens', 'max_completion_tokens', 'n'],
    { additionalProperties: true, description: 'Other OpenAI parameters (tools, response_format, seed, ...) are accepted and passed to the provider unchanged.' },
  ),
  Usage: obj({
    prompt_tokens: int(18),
    completion_tokens: int(42),
    total_tokens: int(60),
  }),
  ChatCompletion: obj({
    id: str('chatcmpl-9x2a'),
    object: enumOf(['chat.completion'], 'chat.completion'),
    created: int(1793101200, 'Unix timestamp in seconds'),
    model: str('gpt-4o-mini-2024-07-18', 'Model that served the request'),
    choices: arrayOf(
      obj({
        index: int(0),
        message: obj({
          role: str('assistant'),
          content: nullable(str('Refunds are issued within 7 days of a return. Shipping fees are non-refundable.')),
        }),
        finish_reason: nullable(enumOf(['stop', 'length', 'tool_calls', 'content_filter'], 'stop')),
      }),
    ),
    usage: ref('Usage'),
  }),
  OpenAIModel: obj({
    id: str('gpt-4o-mini'),
    object: enumOf(['model'], 'model'),
    created: int(1793101200, 'Unix timestamp in seconds'),
    owned_by: str('openai', 'Provider that serves the model'),
  }),
  ModelListing: obj({ object: enumOf(['list'], 'list'), data: arrayOf(ref('OpenAIModel')) }),

  // ── admin auth ────────────────────────────────────────────────────────────
  Login: obj({
    email: str('admin@tollgate.local', undefined, { format: 'email', maxLength: 254 }),
    password: str('correct-horse-battery-staple', undefined, { minLength: 1, maxLength: 128 }),
  }),
  Admin: obj({ id: uuid('7a1c2e9b-4d3f-4b8a-9e6c-1f2a3b4c5d6e'), email: str('admin@tollgate.local', undefined, { format: 'email' }) }),
  Session: obj({
    accessToken: str('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…', 'JWT to send as `Authorization: Bearer <token>`'),
    tokenType: enumOf(['Bearer'], 'Bearer'),
    expiresIn: int(900, 'Access token lifetime in seconds'),
    admin: ref('Admin'),
  }),

  // ── usage ─────────────────────────────────────────────────────────────────
  UsageTotals: obj({
    requests: int(1284, 'Requests this month (UTC)'),
    inputTokens: int(512340),
    outputTokens: int(98012),
    costMicroInr: num(63450210, 'Micro-rupees (₹1 = 1,000,000)'),
  }),

  // ── virtual keys ──────────────────────────────────────────────────────────
  CreateKey: obj(
    {
      teamId: uuid(TEAM_ID, 'Team that owns the key and pays for its usage'),
      name: str('support-bot-prod', 'Human-readable label', { minLength: 1, maxLength: 100 }),
      allowedModels: arrayOf(str('gpt-4o-mini'), {
        minItems: 1,
        maxItems: 50,
        example: ['gpt-4o-mini', 'claude-haiku-4-5'],
        description: 'Model aliases this key may call. Each must be an enabled model.',
      }),
      rpmLimit: int(120, 'Requests per minute; defaults to the team limit', { minimum: 1, maximum: 100000 }),
      tpmLimit: int(60000, 'Tokens per minute; defaults to the team limit', { minimum: 1, maximum: 100000000 }),
      expiresAt: dateTime('2027-01-31T23:59:59Z', 'Expiry (must be in the future). Omit for no expiry.'),
    },
    ['rpmLimit', 'tpmLimit', 'expiresAt'],
    { additionalProperties: false },
  ),
  UpdateKey: obj(
    {
      name: str('support-bot-prod', undefined, { minLength: 1, maxLength: 100 }),
      allowedModels: arrayOf(str('gpt-4o-mini'), { minItems: 1, maxItems: 50, example: ['gpt-4o-mini'] }),
      rpmLimit: nullable(int(120, 'null resets to the team limit', { minimum: 1 })),
      tpmLimit: nullable(int(60000, 'null resets to the team limit', { minimum: 1 })),
      expiresAt: nullable(dateTime('2027-01-31T23:59:59Z', 'null removes the expiry')),
    },
    ['name', 'allowedModels', 'rpmLimit', 'tpmLimit', 'expiresAt'],
    { additionalProperties: false, minProperties: 1 },
  ),
  Key: obj({
    id: uuid(KEY_ID),
    teamId: uuid(TEAM_ID),
    teamName: str('Customer Support'),
    name: str('support-bot-prod'),
    prefix: str('tg_live_a1B2', 'First 12 characters of the key, safe to display'),
    allowedModels: arrayOf(str('gpt-4o-mini')),
    rpmLimit: nullable(int(120, 'null means the team limit applies')),
    tpmLimit: nullable(int(60000, 'null means the team limit applies')),
    status: enumOf(KEY_STATUSES, 'active'),
    expiresAt: nullable(dateTime('2027-01-31T23:59:59.000Z')),
    revokedAt: nullable(dateTime('2026-10-30T08:00:00.000Z')),
    lastUsedAt: nullable(dateTime('2026-10-28T09:14:03.120Z')),
    createdAt: dateTime('2026-10-21T06:30:00.000Z'),
    usage: { ...ref('UsageTotals'), description: 'Month-to-date (UTC) usage from the request log' },
  }),
  CreatedKey: obj({
    key: ref('Key'),
    secret: str('tg_live_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6', 'Full key. Returned once; it cannot be retrieved later.'),
  }),
  PaginatedKeys: paginated('Key', 42),

  // ── teams ─────────────────────────────────────────────────────────────────
  CreateTeam: obj(
    {
      name: str('Customer Support', 'Unique team name', { minLength: 1, maxLength: 100 }),
      monthlyBudgetMicroInr: int(5000000000, 'Monthly budget in micro-rupees (₹1 = 1,000,000). 5000000000 is ₹5,000.', { minimum: 0 }),
      rpmLimit: int(600, 'Requests per minute across the team', { minimum: 1, maximum: 100000, default: 600 }),
      tpmLimit: int(200000, 'Tokens per minute across the team', { minimum: 1, maximum: 100000000, default: 200000 }),
      defaultMaxTokens: int(1024, 'Output-token cap used to estimate cost when a request omits max_tokens', {
        minimum: 1,
        maximum: 200000,
        default: 1024,
      }),
      piiEntities: arrayOf(enumOf(PII_ENTITIES, 'phone'), {
        example: [...PII_ENTITIES],
        default: [...PII_ENTITIES],
        description: 'PII types masked before requests reach a provider. An empty list turns masking off.',
      }),
      cacheEnabled: bool(true, 'Serve repeated prompts from the cache', { default: true }),
      cacheMaxTemperature: num(
        0,
        'Highest temperature that may be cached. A request that omits temperature counts as 1 (the provider default).',
        { minimum: 0, maximum: 2, default: 0 },
      ),
      cacheTtlSeconds: int(3600, 'How long a cached answer lives, in seconds', { minimum: 10, maximum: 2592000, default: 3600 }),
    },
    ['rpmLimit', 'tpmLimit', 'defaultMaxTokens', 'piiEntities', 'cacheEnabled', 'cacheMaxTemperature', 'cacheTtlSeconds'],
    { additionalProperties: false },
  ),
  UpdateTeam: obj(
    {
      name: str('Customer Support', undefined, { minLength: 1, maxLength: 100 }),
      monthlyBudgetMicroInr: int(7500000000, 'Monthly budget in micro-rupees', { minimum: 0 }),
      rpmLimit: int(900, undefined, { minimum: 1 }),
      tpmLimit: int(300000, undefined, { minimum: 1 }),
      defaultMaxTokens: int(2048, undefined, { minimum: 1 }),
      piiEntities: arrayOf(enumOf(PII_ENTITIES, 'phone'), { example: ['phone', 'email'] }),
      cacheEnabled: bool(true),
      cacheMaxTemperature: num(0, undefined, { minimum: 0, maximum: 2 }),
      cacheTtlSeconds: int(3600, undefined, { minimum: 10, maximum: 2592000 }),
    },
    ['name', 'monthlyBudgetMicroInr', 'rpmLimit', 'tpmLimit', 'defaultMaxTokens', 'piiEntities', 'cacheEnabled', 'cacheMaxTemperature', 'cacheTtlSeconds'],
    { additionalProperties: false, minProperties: 1 },
  ),
  Team: obj({
    id: uuid(TEAM_ID),
    name: str('Customer Support'),
    monthlyBudgetMicroInr: int(5000000000, 'Micro-rupees'),
    rpmLimit: int(600),
    tpmLimit: int(200000),
    defaultMaxTokens: int(1024),
    piiEntities: arrayOf(enumOf(PII_ENTITIES, 'phone'), { example: [...PII_ENTITIES] }),
    cacheEnabled: bool(true),
    cacheMaxTemperature: num(0),
    cacheTtlSeconds: int(3600),
    createdAt: dateTime('2026-10-21T06:30:00.000Z'),
    updatedAt: dateTime('2026-10-27T11:02:45.000Z'),
    usage: { ...ref('UsageTotals'), description: 'Month-to-date (UTC) usage from the request log' },
  }),
  PaginatedTeams: paginated('Team', 3),

  // ── models and providers ──────────────────────────────────────────────────
  CatalogModel: obj({
    alias: str('gpt-4o-mini', 'Name clients send as `model`'),
    upstreamName: str('gpt-4o-mini', "Provider's own model name"),
    providerKind: enumOf(PROVIDERS, 'openai'),
    inputUsdPerMtok: num(0.15, 'USD per 1M input tokens'),
    outputUsdPerMtok: num(0.6, 'USD per 1M output tokens'),
    supportsJson: bool(true),
    supportsTools: bool(true),
  }),
  PaginatedModels: obj({ data: arrayOf(ref('CatalogModel')), page: int(1), limit: int(100), total: int(6) }),
  ProviderHealth: obj({
    kind: enumOf(PROVIDERS, 'openai'),
    enabled: bool(true),
    configured: bool(true, 'A key for this provider is available'),
    breaker: enumOf(['closed', 'open', 'half_open'], 'closed', 'closed is healthy'),
    window: obj({
      minutes: int(15),
      requests: int(212),
      errors: int(3, 'Requests that ended with status 500 or above'),
      p50Ms: nullable(int(640)),
      p95Ms: nullable(int(1820)),
    }),
  }),

  // ── request log and analytics ─────────────────────────────────────────────
  RequestLog: obj({
    id: uuid('9c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f'),
    requestId: str('2f1c8a7e-6b5d-4c3b-9a8f-7e6d5c4b3a21', 'Matches the x-request-id response header'),
    teamId: uuid(TEAM_ID),
    keyId: uuid(KEY_ID),
    keyName: nullable(str('support-bot-prod')),
    keyPrefix: nullable(str('tg_live_a1B2')),
    teamName: nullable(str('Customer Support')),
    requestedModel: str('gpt-4o-mini'),
    provider: nullable(enumOf(PROVIDERS, 'openai')),
    servedModel: nullable(str('gpt-4o-mini-2024-07-18')),
    streamed: bool(true),
    statusCode: int(200, '499 = the client disconnected mid-stream'),
    errorCode: nullable(str('budget_exceeded')),
    inputTokens: int(13),
    outputTokens: int(7),
    costMicroInr: num(541, 'Micro-rupees'),
    latencyMs: int(812),
    ttfbMs: nullable(int(304, 'Time to first byte from the provider')),
    cacheStatus: enumOf(
      CACHE_STATUSES,
      'miss',
      'exact/semantic = answered from the cache; miss = cacheable but not found; skipped = not eligible (PII masked, tools, temperature too high, or caching off)',
    ),
    savedMicroInr: num(0, 'Micro-rupees a cache hit saved; 0 for everything else'),
    redactionCount: int(0),
    failoverCount: int(0),
    createdAt: dateTime('2026-10-28T04:48:49.942Z'),
  }),
  PaginatedRequestLogs: paginated('RequestLog', 1284),
  SpendReport: obj({
    month: str('2026-10'),
    totals: obj({
      requests: int(1284),
      errors: int(37, 'Requests with status 400 or above'),
      cacheHits: int(310, 'Requests answered from the cache'),
      savedMicroInr: num(18200000, 'What those cache hits would have cost, in micro-rupees'),
      inputTokens: int(512340),
      outputTokens: int(98012),
      costMicroInr: num(63450210),
    }),
    totalBudgetMicroInr: num(15000000000, 'Sum of every team’s monthly budget'),
    projectedMicroInr: num(70250000, 'Average daily spend so far × days in the month'),
    daily: arrayOf(
      obj({ date: str('2026-10-28', 'UTC day'), requests: int(212), costMicroInr: num(9120400) }),
      { description: 'One entry per UTC day up to today, zero-filled' },
    ),
    byTeam: arrayOf(
      obj({
        teamId: uuid(TEAM_ID),
        teamName: str('Customer Support'),
        requests: int(902),
        costMicroInr: num(41200000),
        budgetMicroInr: num(5000000000),
      }),
      { description: 'Top 10 teams by spend' },
    ),
    byModel: arrayOf(obj({ model: str('gpt-4o-mini'), requests: int(1100), costMicroInr: num(21000000) }), {
      description: 'Top 10 models by spend',
    }),
  }),

  // ── health ────────────────────────────────────────────────────────────────
  Liveness: obj({ status: enumOf(['ok'], 'ok') }),
  Readiness: obj({
    status: enumOf(['ready'], 'ready'),
    checks: obj({ postgres: enumOf(['up', 'down'], 'up'), redis: enumOf(['up', 'down'], 'up') }),
  }),
};
