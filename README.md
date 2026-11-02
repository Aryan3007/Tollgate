# Tollgate

**A self-hosted, OpenAI-compatible LLM gateway.** Point any OpenAI SDK at Tollgate by changing its base URL, and every request gets per-team budgets, rate limits, Indian PII masking, a semantic cache and provider failover, with real provider keys kept out of your apps.

```ts
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:4000/v1", // was https://api.openai.com/v1
  apiKey: "tg_live_…",                 // a Tollgate virtual key, not an OpenAI key
});
```

Built with NestJS, Redis (Lua scripts and vector search), Postgres, BullMQ and Next.js.

## Why it exists

Teams that call LLM APIs directly end up with provider keys scattered across services, no spending cap, no idea which team caused the bill, personal data leaving the company, and one outage taking everything down. Tollgate sits between your apps and the providers and fixes those in one place.

| Problem | What Tollgate does |
|---|---|
| Real API keys in every service | Apps get scoped, revocable **virtual keys**. Provider keys live only on the gateway (env vars, or Azure Key Vault). |
| Surprise bills | Per-team **monthly budgets in ₹**, reserved before each call and settled after, atomically, so concurrent requests can't overspend. Per-key and per-team rate limits. |
| Personal data sent to a third party | **Aadhaar, PAN, phone, card and email** are masked before the request leaves, and restored in the response, including mid-stream. |
| Paying twice for the same question | A **two-layer cache** (exact + semantic) answers repeats for free. |
| A provider outage | **Circuit breaker and failover** across OpenAI, Anthropic and Groq. |
| No visibility | Per-request cost, tokens, latency and cache result, in a dashboard and in the response itself. |

## What's in the box

- **OpenAI-compatible API**: `POST /v1/chat/completions` (JSON and SSE streaming) and `GET /v1/models`. Unknown parameters such as tools and `response_format` pass through.
- **Providers**: OpenAI, Anthropic (full request, tool and stream translation) and Groq. A new OpenAI-compatible provider is one small adapter class.
- **Virtual keys**: `tg_live_` plus 32 random characters. Only an HMAC of the key is stored. Each key has an allowed-model list, optional rate limits and an expiry, and revoking one takes effect on the next request on every instance.
- **Budgets and rate limits**: atomic reserve-then-settle in Redis Lua, and GCRA requests-per-minute and tokens-per-minute limits per key and per team.
- **PII masking**: per-team toggles, checksum-validated detectors, and a streaming restorer.
- **Semantic cache**: exact match plus vector search with a local embedding model, scoped per team, with guards against wrong answers.
- **Routing and failover**: ordered fallback chains per model, a per-provider circuit breaker, and failover before the first byte only.
- **Async request log**: batched writes through BullMQ, with spend analytics and a month-end projection.
- **Admin dashboard** (Next.js): Spend, Requests, Virtual keys, Teams, Providers, and a **Playground** for chatting through a key and seeing what each query cost and saved.
- **OpenAPI docs** at `/api/docs`.

## Architecture

```
 app (OpenAI SDK) ── POST /v1/chat/completions ──▶ Tollgate gateway (NestJS)
                                                      │
   1. authenticate virtual key ........ Redis cache ─▶ Postgres
   2. model access + rate limit ....... Redis (Lua, GCRA)
   3. mask PII ........................ placeholders: <PHONE_1>
   4. cache lookup .................... Redis (exact key, then vector search)
   5. reserve budget .................. Redis (Lua, atomic)
   6. call provider + failover ........ OpenAI / Anthropic / Groq (circuit breaker)
   7. stream back, restoring PII ...... sliding buffer
   8. settle real cost, store in cache, write log (BullMQ ─▶ Postgres)
```

A cache hit skips steps 5 to 7 entirely: no budget is reserved, no provider is called.

Redis holds the hot path (key cache, rate limits, budget ledger, cache, queues). Postgres holds the source of truth (teams, keys, request log). If Redis loses a budget ledger, it is rebuilt from the request log.

## Quick start

**Prerequisites:** Node.js 22.18+ (developed on 25), [pnpm](https://pnpm.io) 10, Docker, and an OpenAI API key (or use the mock provider below).

```bash
# 1. Postgres 17 and Redis 8 (Redis 8 includes vector search)
cp .env.example .env            # set POSTGRES_PASSWORD
docker compose up -d --wait

# 2. Backend (http://localhost:4000)
cd backend
pnpm install
cp .env.example .env            # fill in the values marked below
pnpm build && pnpm db:migrate && pnpm db:seed
pnpm start

# 3. Dashboard (http://localhost:3000), in another terminal
cd frontend
pnpm install
cp .env.example .env.local
pnpm dev
```

In `backend/.env`, set at least:

| Variable | What to put |
|---|---|
| `DATABASE_URL` | `postgres://tollgate:<POSTGRES_PASSWORD>@localhost:5432/tollgate` (match the root `.env`) |
| `REDIS_URL` | `redis://localhost:6379` |
| `KEY_PEPPER`, `JWT_ACCESS_SECRET` | any 32+ characters; generate with `openssl rand -base64 48` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | the first dashboard login (password: 12+ characters) |
| `PROVIDER_KEY_OPENAI` | your OpenAI key (optional: `PROVIDER_KEY_ANTHROPIC`, `PROVIDER_KEY_GROQ`) |

If a host port is taken, change `POSTGRES_PORT` / `REDIS_PORT` in the root `.env` and the URLs to match.

Then open <http://localhost:3000>, sign in, and:

1. **Teams**: create a team with a monthly budget.
2. **Virtual keys**: create a key for it and tick the models it may call. The full key is shown once.
3. **Playground**: paste the key and try the preset queries and scenarios.

The first start downloads the embedding model (about 25 MB, roughly 30 seconds). Until it loads, only the exact-match half of the cache is active; everything else works.

### Try it from code

```bash
curl http://localhost:4000/v1/chat/completions \
  -H "Authorization: Bearer $TG_KEY" -H "Content-Type: application/json" \
  -H "x-tollgate-stats: 1" -i \
  -d '{"model":"gpt-4o-mini","temperature":0,"messages":[{"role":"user","content":"What is UPI?"}]}'
```

Run it twice. The response carries two extra headers:

- `x-tollgate-cache`: `miss`, `hit-exact`, `hit-semantic` or `skip`.
- `x-tollgate-stats` (only if you send `x-tollgate-stats: 1`): the request's tokens, cost and savings in micro-rupees (₹1 = 1,000,000), masked values, latency and provider. For streams it arrives as an SSE comment after the last chunk, which every SSE client ignores.

### Develop without spending money

`pnpm mock:provider` (in `backend/`) starts a fake OpenAI and Anthropic upstream on `127.0.0.1:4010`. Set `OPENAI_BASE_URL=http://127.0.0.1:4010/v1` in `backend/.env` **before the first** `pnpm db:seed`, since the seed records provider URLs once. The integration tests use the same mock.

## The hard problems, and how they are solved

**Atomic budgets under concurrency.** The final cost of an LLM call is only known afterwards, so each request reserves its worst-case cost first (estimated prompt plus the output cap, for the priciest failover candidate) and swaps it for the real cost when it finishes. The check and the reservation are one Lua script, so 100 parallel requests can never reserve more than the cap. Failures and client disconnects release or settle the reservation, and a sweeper frees reservations whose request crashed. *Test: 100 parallel requests against a budget that covers 20 reach the provider exactly 20 times.*

**PII masking that survives streaming.** Placeholders such as `<PHONE_1>` can be split across stream chunks (`<PHO` + `NE_1>`). A small sliding buffer holds back only a tail that could still become a placeholder (at most about 20 characters) and flushes it with the final chunk. Streamed tool-call arguments are restored too. Aadhaar uses the Verhoeff checksum and cards use Luhn, which removes most look-alike numbers. *Test: a property test (300 random runs) shows that for any text and any chunking, down to one character at a time, the restored stream equals the original.*

**Cache correctness.** A cached answer must never reach the wrong caller:

- Every key is scoped by team, model, all request parameters, and the conversation before the last message.
- Never cached: requests where PII was masked, requests with tools or several choices, and temperatures above the team's limit (omitted counts as 1).
- Embeddings alone are not trusted: `"transfer 5000 rupees"` and `"transfer 50000 rupees"` score 0.994 similar, and `include GST` / `exclude GST` score 0.96. A semantic match must also agree exactly on the prompt's numbers and negation words.
- Prompts over 800 characters are matched exactly only, because the embedding model truncates long text.

*Tests: team A's answer is never served to team B, exactly or semantically.*

**Provider translation.** OpenAI, Anthropic and Groq differ in message format, system prompts, tool-calling and stream events. Each adapter implements one interface (`complete`, `stream`) and speaks OpenAI's format at the boundary. Anthropic's translator is a set of pure functions with unit tests; the Groq adapter is a subclass that only changes where streaming usage is reported.

**Failover without splicing answers.** A 5xx, timeout or connection error moves to the next model before any byte reaches the client. Once streaming has started, switching provider would stitch two different answers together, so a later failure is reported as an error event instead. A fallback is only used if the caller's key may call it and it can serve the request (tools, JSON mode).

**Bounded latency.** Upstream timeouts are enforced by racing the request, not only by aborting it, because `fetch` can be slow to honour an abort during a stalled DNS lookup or connect.

## Measured results

| What | Result | Notes |
|---|---|---|
| Cache hit rate | **73.6%** of 600 requests | 133 exact, 308 semantic, 158 misses |
| Spend vs uncached | **about 62% lower** | ₹0.3128 spent, ₹0.5165 saved |
| Latency | miss ≈ 960 ms, exact hit ≈ 2 ms, semantic hit ≈ 8 ms | p50, real OpenAI `gpt-4o-mini` |
| Failover | 8 of 8 requests succeed with the primary provider down | mock providers; breaker opens after 5 failures |
| PII detector regression set | precision and recall 1.000 on 300+ sentences | **self-generated**, see caveats |

**Read these with care.**

- The cache numbers come from a *synthetic* support-bot workload (30 intents, a few wordings each, skewed so popular questions repeat). They describe that mix, not production traffic. Run it yourself: `node backend/test/load/support-bot.ts` (set `GATEWAY_URL` and `GATEWAY_KEY`).
- At the default 0.95 similarity threshold, only near-identical rewordings hit (case, punctuation, politeness). Looser paraphrases such as "I forgot my password, how do I change it?" score about 0.90 and miss. That is the safe direction for a cache; `CACHE_SIMILARITY` is configurable.
- The PII set is a regression guard written alongside the detectors, not a measure of real-world accuracy. Only structured identifiers are detected: **names and addresses are not**.
- Gateway overhead (p50/p95 added latency) and single-instance throughput have **not** been benchmarked yet.

## API

Interactive docs: <http://localhost:4000/api/docs> (raw spec at `/api/docs-json`). Swagger UI is off in production unless `SWAGGER_UI_ENABLED=true`.

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /v1/chat/completions` | virtual key | OpenAI-compatible chat, JSON or SSE |
| `GET /v1/models` | virtual key | Models this key may call |
| `POST /v1/admin/auth/login` · `refresh` · `logout` · `GET me` | none / refresh cookie / admin token | Short-lived access token plus a rotating refresh cookie; reusing an old refresh token revokes the session |
| `/v1/admin/teams` | admin token | Create, list, update teams (budget, limits, PII and cache settings) |
| `/v1/admin/keys` | admin token | Create (secret shown once), list, update, revoke |
| `GET /v1/admin/models` | admin token | Model catalog and prices |
| `GET /v1/admin/requests` | admin token | Paginated request log with cost and cache result |
| `GET /v1/admin/analytics/spend` | admin token | Totals, daily series, top teams and models, projection |
| `GET /v1/admin/providers` | admin token | Circuit-breaker state and p50/p95 latency |
| `GET /health` · `GET /ready` | none | Liveness; readiness (Postgres and Redis) |

Errors use OpenAI's shape (`{"error": {"message", "type", "code", "param"}}`) on every endpoint, so SDK error handling works unchanged. Rate-limited responses carry `Retry-After`.

## Failure behaviour

| If this goes wrong… | Tollgate… | Why |
|---|---|---|
| Redis is down | **Refuses** requests (`503`) for budgets and rate limits | Spend control is the product's promise; without the ledger it can't keep it. |
| Redis is down | **Skips** the cache and falls back to Postgres for key lookups | Losing the cache only costs money, not correctness. |
| The embedding model is loading or slow | Uses the exact cache only | A cache miss is always safe. |
| A provider fails | Fails over, then returns `503 all_providers_failed` if every candidate fails | |
| A client disconnects mid-stream | Cancels the upstream call and charges only what was produced | |
| The process crashes mid-request | Loses at most about 1 s of buffered log rows; the budget sweeper frees its reservation | Logging stays off the request path. |

## Project layout

```
backend/                NestJS service
  src/modules/
    completions/        the request pipeline, SSE writer, per-request stats
    auth/               admin JWT + refresh rotation, virtual-key guard
    keys/ teams/        admin CRUD, key lookup cache
    budget/             reserve / settle / release / sweep
    rate-limit/         GCRA limits
    pii/                detectors, redactor, streaming restorer
    semantic-cache/     exact + vector cache, embedding worker thread
    providers/          adapters, circuit breaker, model catalog
    routing/            fallback chains
    request-logs/       batched async writer
    analytics/          spend report
  src/infra/            Redis (+ Lua scripts), BullMQ, secret store (env / Azure Key Vault)
  src/db/               Drizzle schema, migrations runner, seed
  test/                 integration tests (real Postgres and Redis), mock providers, load scripts
frontend/               Next.js dashboard (App Router, Tailwind, TanStack Query, Zustand)
docker-compose.yml      Postgres 17 and Redis 8 for development
PLAN.md                 design decisions and the build plan
```

## Configuration

All configuration is environment variables, validated with Zod at boot (the process exits with a readable error if something is missing). See [`backend/.env.example`](backend/.env.example). The ones you're most likely to change:

| Variable | Default | |
|---|---|---|
| `SECRET_STORE` | `env` | `env` reads `PROVIDER_KEY_*`; `azure` reads Key Vault secrets `provider-openai`, `provider-anthropic`, `provider-groq` via `AZURE_KEYVAULT_URL` |
| `USD_INR_RATE` | `88` | Converts provider USD prices into the ₹ budgets are kept in |
| `CACHE_SIMILARITY` | `0.95` | Minimum cosine similarity for a semantic hit; lower is riskier |
| `UPSTREAM_TTFB_TIMEOUT_MS` | `30000` | Maximum wait for a provider's first byte (a non-streaming call's whole generation) |
| `BUDGET_RESERVATION_TTL_SECONDS` | `900` | How long an unsettled reservation lives before the sweeper frees it |
| `WORKER_ENABLED` | `true` | Run the log writer and sweeper in this process |
| `CORS_ORIGINS` | `http://localhost:3000` | Allow-list for the dashboard |

Budgets are stored as integer **micro-rupees** (₹1 = 1,000,000), so tiny per-request costs stay exact. Budget months reset at 00:00 UTC on the 1st.

Per-team settings (budget, rate limits, default max tokens, PII types, cache on/off and temperature limit) are edited in the dashboard under **Teams**.

## Testing

```bash
cd backend
pnpm test        # 109 unit tests
pnpm test:e2e    # 166 integration tests; starts real Postgres and Redis with Testcontainers (needs Docker)
pnpm lint
```

The integration tests drive the real app over HTTP with the OpenAI SDK against mock providers. Besides the happy paths they cover the four states per endpoint (success, validation error, auth failure, not found), the budget concurrency guarantee, failover and the breaker, PII masking through single-character streams, cross-team cache isolation, and Redis-down behaviour.

## Current limitations

- **No CI and no container images for the app yet.** `docker-compose.yml` runs only Postgres and Redis; the backend and dashboard run locally.
- **Gateway overhead and throughput are not measured**, and the failover result is from mock providers. Load-test scripts (k6) are planned.
- **Anthropic and Groq are tested against mocks**, and Azure Key Vault is covered by unit tests only. Only the OpenAI path has been run against the real API.
- **One admin role and one organization.** Multi-tenant orgs, user roles, budget alerts and an embeddings endpoint are out of scope for now.
- Each gateway instance keeps its own circuit breaker in memory; they don't share state.
- The Playground keeps the virtual key in your browser tab's session storage and sends it only to the gateway.

See [`PLAN.md`](PLAN.md) for the design decisions behind these choices.
# Tollgate
