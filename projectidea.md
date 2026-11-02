Supporting the gateway are Redis (rate limits, budget counters, and the semantic cache), Postgres (users, keys, policies, request logs), Azure Key Vault (the real provider keys), and a Next.js admin dashboard.

## What happens on every request

1. **Request in.** An app calls `POST /v1/chat/completions` with a Tollgate virtual key such as `tg_live_abc...`, never a real provider key. Because the endpoint is OpenAI-compatible, existing code only needs its base URL changed.

2. **Auth.** Tollgate hashes the key and looks it up, using a Redis cache in front of Postgres. That tells it which team the request belongs to, which models that team may use, and which policies apply. RBAC decides access; for example, an intern's key can't call expensive models.

3. **Budget check.** Tollgate estimates the request's token cost and checks the team's remaining budget and rate limits in Redis. A Lua script makes the check-and-reserve step atomic, so 100 parallel requests can't overspend a cap. If the budget is exhausted, the app gets a clean `429` with a reason.

4. **PII redaction.** Regex and pattern detectors mask Aadhaar numbers, PANs, phone numbers, emails, and card numbers. Each value is swapped for a placeholder like `<PHONE_1>`, and the real values are restored in the response so the app sees the original data. The provider never sees it.

5. **Semantic cache.** Tollgate embeds the prompt and runs a vector-similarity search. If a near-identical prompt was answered recently (similarity above about 0.95), it returns the cached answer instantly at zero cost.

6. **Routing.** Rules pick the provider, such as "cheapest model that supports JSON mode" or "Groq for latency-sensitive calls." The real key is fetched from Key Vault and cached in memory with a short TTL.

7. **Failover.** A circuit breaker tracks error rates per provider. If OpenAI returns 5xx errors or times out, the circuit opens and traffic moves to the next provider in the chain, with the request translated into that provider's format.

8. **Response out.** Responses stream back to the app through SSE (server-sent events). Tollgate counts actual tokens, settles the budget reservation, and writes an async log entry with cost, latency, provider, and cache status.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Gateway | Node.js + Nest.js (TypeScript) | Modular design, guards and interceptors map neatly onto the pipeline |
| Hot-path state | Redis | Atomic counters, rate limiting, vector search for the cache |
| Database | PostgreSQL + pgvector | Policies, logs, analytics; a pgvector fallback for the cache |
| Secrets | Azure Key Vault | Provider keys never sit in the database or env files |
| Async logging | BullMQ on Redis | Keeps logging off the request path |
| Dashboard | Next.js + Shadcn/UI + Recharts | Admin UI and analytics |
| Infra | Docker Compose, Nginx, Azure DevOps CI/CD | Self-hostable with a single command |
| Docs | Swagger/OpenAPI | Auto-generated API reference |

## Core data model

The main tables are `organizations`, `teams`, `virtual_keys` (hashed key, team, allowed models, expiry), `policies` (budget caps, rate limits, PII rules, routing rules), `providers` (name, Key Vault secret reference, priority, health status), and `request_logs` (team, model, provider, input and output tokens, cost in ₹, latency, whether the cache was hit, status). Partition `request_logs` by month, because it grows fast.

## Dashboard features

- **Spend:** per team, model, and day, with a projected month-end bill.
- **Live request feed:** latency, provider, cache hit or miss, and redaction count for each request.
- **Key management:** create, scope, expire, and revoke virtual keys.
- **Policy editor:** budgets, routing rules, PII toggles.
- **Provider health:** circuit breaker state and p95 latency per provider.
- **Alerts:** a Slack or email notification at 80% and 100% of a team's budget.

## The hard engineering problems

These are what make the project impressive, so document how you solved each one in the README.

**Streaming with redaction and token counting.** Responses stream token by token. Restoring PII placeholders that may be split across chunks needs a small sliding buffer. Counting tokens mid-stream also requires a tokenizer for each provider.

**Atomic budgets under concurrency.** You can't know a request's final cost upfront. Reserve the estimated cost when the request arrives, settle the real cost when it finishes, and release the reservation on failure.

**Provider translation.** OpenAI, Anthropic, and Groq differ in message formats, system prompts, tool-calling schemas, and streaming event shapes. You need a clean adapter interface so adding a fourth provider means writing one file.

**Cache correctness.** The cache must never serve one team's cached answer to another team. Scope cache keys per team, and skip caching when temperature is above 0 or the request uses tools.

**Gateway overhead.** Set a target, for example under 15ms of added p95 latency on cache misses. Benchmark it with k6 and publish the numbers.

## Build plan (about 8 weeks, part-time)

| Week | Goal |
|---|---|
| 1 | Nest.js skeleton, an OpenAI-compatible endpoint, OpenAI adapter with streaming passthrough |
| 2 | Virtual keys, auth guard, RBAC, Postgres schema, Key Vault integration |
| 3 | Redis rate limiting, atomic budget reserve and settle, async logging with BullMQ |
| 4 | Anthropic and Groq adapters, routing rules, circuit breaker failover |
| 5 | PII redaction including streaming restore, semantic cache |
| 6 | Next.js dashboard: spend charts, live feed, key and policy management |
| 7 | Tests (unit, integration with mock providers), k6 load testing, CI/CD pipeline |
| 8 | Docker one-command setup, Swagger docs, README with architecture, demo video |

## Metrics to publish

- **Gateway overhead:** p50 and p95 added latency.
- **Throughput:** requests per second on a single instance.
- **Cache:** hit rate and money saved, using a realistic workload such as a support bot with repeated questions.
- **Failover:** time to switch providers when one goes down, measured in seconds.
- **Redaction:** detection accuracy on a test set of Indian PII formats.

## Resume bullets (fill in your real numbers)

- Built Tollgate, a self-hosted, OpenAI-compatible LLM gateway in Nest.js/TypeScript that unifies OpenAI, Anthropic, and Groq behind one API, adding under X ms p95 overhead at Y req/s.
- Implemented atomic per-team token budgets and rate limiting using Redis Lua scripts, preventing overspend under concurrent load.
- Designed a semantic cache with vector similarity, cutting LLM spend by Z% on a repeated-query workload.
- Built streaming-safe PII redaction for Indian identifiers (Aadhaar, PAN, phone) and secured provider credentials in Azure Key Vault with scoped virtual keys and RBAC.
- Added circuit-breaker failover across providers, with zero failed requests during a simulated provider outage.

## Questions interviewers will ask

Be ready to answer these:

- Why reserve-and-settle instead of checking the budget after the request?
- How do you stop the cache from leaking data across teams?
- What happens if Redis goes down? Decide whether the gateway fails open or fails closed, and explain why.
- How would you scale this horizontally?
- Why build this instead of using LiteLLM or Portkey? A good answer: you built it to learn the hard parts, and you focused on India-specific PII handling and Key Vault-native secrets.

Do you want me to turn this into a week-1 starter: the folder structure, the core Nest.js modules, and the first endpoint?