# Tollgate — Build Plan (resume scope)

A self-hosted, OpenAI-compatible LLM gateway. The scope is trimmed to the modules that back a resume bullet or are needed for the demo. Everything else is under **Cut** at the end.

- **Repo:** two independent projects. `backend/` is NestJS 12; `frontend/` is Next.js App Router.
- **Timeline:** 8 weeks part-time. Each phase ends in a demo and has a Definition of Done (DoD).

---

## 0. Decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| D1 | ORM | **Drizzle** | Thin SQL layer, migrations via `drizzle-kit`. |
| D2 | Redis | **Redis 8** (`redis:8.2.2`) via `ioredis` | Redis 8 ships the query engine, so vector search needs no Redis Stack. BullMQ needs ioredis anyway. |
| D3 | Money | **micro-rupees, `bigint`** (₹1 = 1,000,000) | Requests can cost under a paisa. Integer math in Lua and SQL. |
| D4 | Prices | USD per 1M tokens on `models`, × `USD_INR_RATE` at settle time | Providers publish prices in USD. |
| D5 | Key hashing | **HMAC-SHA256(KEY_PEPPER, key)** | Keys are high-entropy, so a fast lookup is fine. The pepper makes a leaked DB useless. |
| D6 | Redis down | Budget and rate limit **fail closed** (503). Cache **fails open**. | Spend control is the product's promise. |
| D7 | Pipeline order | auth → rate limit → validate → model access → PII → **cache** → **budget reserve** → route → call/failover → stream + restore → settle → log | Cache hits never touch the budget. |
| D8 | Nest mapping | Guard for auth; everything else (rate limit included) is an explicit step in `CompletionsService` | TPM needs the validated body and model, which guards run before. Interceptors handle SSE and early exits poorly. |
| D9 | Failover window | Only **before the first byte** | After SSE starts, send an error event instead of splicing two answers. |
| D10 | Token counts | Provider-reported usage. Pre-call estimate = characters ÷ 3 (deliberately pessimistic), and the gateway injects `max_completion_tokens` when the client sets none. | No tokenizer dependency; over-estimating only holds budget until settle, and the output cap means real cost cannot exceed the reservation through output. |
| D11 | Cache + PII | **Skip the cache when anything was redacted** | Never reuse an answer that depended on someone's PAN or Aadhaar. |
| D12 | Cache eligibility | `temperature` ≤ team `cacheMaxTemperature` (default 0), no `tools`, `n` ≤ 1 | OpenAI's default temperature is 1, so caching is opt-in. |
| D13 | Embeddings | Local `all-MiniLM-L6-v2` (384-dim) in one worker thread | No network hop or cost. Only cache-eligible requests embed. |
| D14 | Admin auth | Single `admin` role. argon2. JWT access token (15 min, kept in memory) + rotating refresh token (7 days, httpOnly cookie). | Virtual keys are for machines; the dashboard needs a human login. |
| D15 | Breakers | In memory per instance, mirrored to Redis for the dashboard | No cross-instance coordination needed. |
| D16 | Ports | backend `4000`, frontend `3000`, Swagger `/api/docs` | |

---

## 1. Modules (final set)

**Backend `src/`**

| Folder | Responsibility |
|---|---|
| `config/` | Zod-validated env; the process exits at boot if invalid |
| `common/` | `GatewayError` types, global OpenAI-shaped error filter, Zod pipe |
| `db/` | Drizzle client + `schema/` |
| `infra/redis` | ioredis client + Lua script loader |
| `infra/keyvault` | `SecretStore`: `env` (dev) / `azure` (Key Vault) with a TTL cache |
| `infra/queue` | BullMQ queue; the worker runs in the same process |
| `modules/auth` | `VirtualKeyGuard`, admin login/refresh, `JwtGuard` |
| `modules/teams` | Teams + their policy (budget, limits, PII toggles, cache, routing) |
| `modules/keys` | Virtual key CRUD (create shows the key once, revoke) |
| `modules/rate-limit` | GCRA RPM/TPM per key and team (Lua) |
| `modules/budget` | reserve / settle / release (Lua), expired-reservation sweeper |
| `modules/pii` | Indian PII detectors + stream restorer |
| `modules/semantic-cache` | Exact + vector cache, team-scoped |
| `modules/routing` | alias → ordered candidate chain |
| `modules/providers` | Adapter interface, OpenAI / Anthropic / Groq adapters, circuit breaker |
| `modules/completions` | `POST /v1/chat/completions`, `GET /v1/models`, pipeline |
| `modules/request-logs` | Async batched log writes + live-feed pub/sub |
| `modules/analytics` | Spend aggregates, provider health |
| `modules/health` | `/health`, `/ready` |

**Frontend pages:** Login, Spend, Requests (live feed), Keys, Teams (policy editor), Providers.

---

## 2. Data model

| Table | Columns |
|---|---|
| `admins` | `email` (unique), `password_hash` |
| `refresh_tokens` | `admin_id`, `token_hash` (unique), `expires_at`, `revoked_at` |
| `teams` | `name` (unique), `monthly_budget_micro_inr bigint`, `default_max_tokens`, `rpm_limit`, `tpm_limit`, `pii jsonb`, `cache jsonb`, `routing jsonb` |
| `virtual_keys` | `team_id`, `name`, `prefix`, `key_hash` (unique), `allowed_models text[]`, `rpm_limit`/`tpm_limit` (nullable = team default), `expires_at`, `revoked_at`, `last_used_at` |
| `providers` | `name`, `kind` (`openai\|anthropic\|groq`), `base_url`, `secret_name`, `enabled` |
| `models` | `alias`, `provider_id`, `upstream_name`, `input_usd_per_mtok`, `output_usd_per_mtok`, `supports_json`, `supports_tools` |
| `request_logs` | `team_id`, `key_id`, `request_id`, `requested_model`, `served_model`, `provider_id`, `input_tokens`, `output_tokens`, `cost_micro_inr`, `latency_ms`, `ttfb_ms`, `cache_status`, `redaction_count`, `failover_count`, `status_code`, `error_code`, `created_at`. Index `(team_id, created_at desc)`, `(created_at desc)`. |

## 3. Redis keys

| Key | Purpose |
|---|---|
| `vk:{hash}` | Cached key context, 60 s TTL, pub/sub invalidation on revoke |
| `rl:{scope}:{id}:{rpm\|tpm}` | GCRA state |
| `bud:{team}:{yyyymm}` (hash `spent`, `reserved`) | Budget ledger |
| `bud:resv:{team}:{yyyymm}` (zset, score = expiry) | Outstanding reservations for the sweeper |
| `ce:{team}:{sha}` / `sc:{team}:{id}` + index `idx:sc` | Exact / semantic cache |
| `cb:{provider}` | Breaker state mirror |
| `feed:requests` | Live feed channel |

---

## 4. Phases

### Phase 1 (week 1): Foundations + OpenAI passthrough
- Backend:
  - Zod env config, pino logging with request IDs, helmet, CORS allow-list, graceful shutdown, Swagger.
  - Global error filter that returns OpenAI-shaped errors.
  - `/health` and `/ready`.
  - `SecretStore` (`env` implementation).
  - `ProviderAdapter` interface + `OpenAIAdapter`.
  - `POST /v1/chat/completions` (JSON + SSE). Upstream usage is captured; client aborts are propagated upstream.
- `test/mock-provider` HTTP server (OpenAI format; latency, errors, chunking) for every later test and for k6.
- Frontend:
  - Install TanStack Query, Zustand, Zod, shadcn, PrimeReact (Skeleton).
  - Query provider, typed API client, env validation, swagger `.mcp.json`.
- **DoD:** the official OpenAI SDK streams through Tollgate to the mock provider and to real OpenAI. Errors come back in OpenAI shape. e2e tests are green.

### Phase 2 (week 2): Data + virtual keys + admin auth
- Drizzle schema, migrations, and seed.
- Admin login with refresh token rotation.
- Teams + keys CRUD (paginated).
- `VirtualKeyGuard` with Redis cache and revoke invalidation.
- Model allow-list check. `GET /v1/models`.
- Key Vault `SecretStore`.
- Frontend: login, dashboard shell, Keys page (create **drawer**, revoke **confirm dialog**).
- **DoD:** create a key in the UI → use it from the SDK → revoke it → 401.

### Phase 3 (week 3): Rate limits + atomic budgets + async logs
- Lua scripts: `gcra`, `budget_reserve`, `budget_settle`, `budget_release`, `budget_sweep`.
- Budget hydration from Postgres when the ledger is missing.
- BullMQ batched inserts into `request_logs`.
- **DoD:** 100 parallel requests against a cap that only covers 20 → exactly 20 succeed. A killed request's reservation is swept within 60 s. Redis down → 503.

### Phase 4 (week 4): Anthropic + Groq + routing + failover
- Anthropic adapter: system field, tool_use blocks, stream event translation.
- Groq adapter: subclasses OpenAI.
- Ordered fallback chains per alias (`models.fallback_aliases`). A fallback is only used if the key may call it and it can serve the request; budget is reserved for the priciest candidate.
- Circuit breaker: last 20 calls; opens at ≥ 50% failures or 5 in a row; 30 s cooldown; half-open probe.
- **DoD:** golden-file translation tests pass. Killing a provider during a k6 run causes zero failed requests; time to switch is recorded.

### Phase 5 (week 5): PII redaction
- Detectors:
  - Aadhaar (Verhoeff checksum)
  - PAN (4th character is the holder type)
  - Indian phone
  - Card (Luhn)
  - Email
- Placeholder map, per-team toggles.
- Sliding-buffer stream restorer, covering text and tool-call arguments. Per-team toggles live in `teams.pii_entities`.
- Labelled fixture set of 300+ sentences → precision/recall.
- **DoD:** a property test (any chunking) restores exactly. The mock provider confirms zero raw PII reached upstream. Precision and recall ≥ 0.95.

### Phase 6 (week 6): Semantic cache
- Exact-hash layer, then the vector layer (HNSW, cosine, filtered by team and model, threshold 0.95).
- Eligibility rules (D11, D12). A semantic match must also agree exactly on the prompt's numbers and negation words (embeddings score "5000" vs "50000" at 0.994), and prompts over 800 characters are matched exactly only (the model truncates them).
- Cached answers replay as SSE when the client asked for streaming.
- Support-bot workload generator.
- **DoD:** a cross-team leak test passes. Hit rate and ₹ saved are measured.

### Phase 7 (week 7): Dashboard
- Admin APIs:
  - Spend by team / model / day, plus a month-end projection.
  - Request history.
  - Live feed over SSE.
  - Team policy update.
  - Provider health.
- Pages: Spend (Recharts), Requests (live feed), Teams (policy **drawer**), Providers.
- Every view handles four states (loading, error, empty, success). Skeleton loaders.
- **DoD:** demo flow: create team and key → run load → watch the live feed and spend → kill a provider → see the breaker open.

### Phase 8 (week 8): Measure + ship
- k6 scripts:
  - overhead (gateway vs. direct-to-mock; p50/p95)
  - throughput
  - failover
- CI pipeline: lint, typecheck, unit, integration with service containers, build.
- Docker Compose with one-command setup and migrations on start.
- Swagger audit.
- README with architecture, the five hard problems, metrics, and decisions.
- Demo video.
- **DoD:** every metric recorded in the README.

---

## 5. Provider adapter contract

```ts
interface ProviderAdapter {
  readonly kind: ProviderKind;
  complete(req: ChatCompletionRequest, ctx: UpstreamContext): Promise<ChatCompletion>;
  stream(req: ChatCompletionRequest, ctx: UpstreamContext): AsyncIterable<ChatCompletionChunk>;
}
```

Adapters own translation in both directions and throw `UpstreamError` with `retryable` set. Adding a provider means one adapter file, DB rows, and a golden test.

---

## Cut (and why it's safe to cut)

| Cut | Answer if asked in an interview |
|---|---|
| Multi-org tenancy, user roles | Single org. A `org_id` column + row scoping would be the extension. |
| Slack/email budget alerts | The settle script already returns `spent`; alerts are a threshold check + queue job. |
| `request_logs` monthly partitioning | Would be declarative range partitioning on `created_at` once volume demands it. |
| pgvector cache fallback, Nginx, separate worker process | Ops polish, not core engineering. |
| Routing "cheapest/fastest" strategies | Ordered chains cover failover; strategies only sort the chain. |
| Redis/Postgres nightly reconciliation | Hydration on a cold ledger covers correctness for the demo. |
