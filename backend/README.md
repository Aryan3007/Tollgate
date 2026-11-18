# Tollgate backend

Express 5 + TypeScript service. See the [root README](../README.md) for what Tollgate does and how to run the whole stack.

## Scripts

| Command | What it does |
|---|---|
| `pnpm start:dev` | Run from TypeScript with auto-reload (`tsx watch`) |
| `pnpm build` | Compile to `dist/` and copy the Redis Lua scripts |
| `pnpm start` | Run the compiled server (`dist/main.js`) |
| `pnpm db:generate` / `db:migrate` / `db:seed` | Drizzle migrations and seed (`migrate` and `seed` run from `dist/`, so build first) |
| `pnpm test` | Unit tests |
| `pnpm test:e2e` | Integration tests against real Postgres and Redis (Testcontainers; needs Docker) |
| `pnpm lint` / `pnpm typecheck` | oxlint (type-aware) and `tsc --noEmit` |
| `pnpm mock:provider` | Fake OpenAI/Anthropic upstream on `127.0.0.1:4010` for development without spending money |

## How the code is organised

```
src/main.ts          load .env, validate config, start the server, shut down gracefully on SIGTERM/SIGINT
src/app.ts           createApp(container): middleware order and route mounting
src/container.ts     createContainer(env): builds every service once, with plain constructors
src/modules/<name>/  <name>.routes.ts → <name>.controller.ts → <name>.service.ts → <name>.repository.ts
src/docs/            OpenAPI definition, shared component schemas, Swagger UI mount
src/common/          errors, logger, request parsing, shared HTTP helpers
src/infra/           Redis client and Lua scripts, BullMQ connections, secret stores
src/db/              Drizzle schema, migration runner, seed
```

- **Layers.** Routes map URLs to controller methods. Controllers validate input with Zod (`parse` / `parseBody`) and then call a service; they hold no business logic. Services own the logic and talk to repositories (database access) and other services.
- **No DI framework.** `createContainer` is the only place objects are constructed and connected. Tests build the same container, optionally replacing the embedder or secret store.
- **Auth.** `requireAdmin` (JWT) and `requireVirtualKey` (HMAC lookup) are middleware, applied when routers are mounted in `app.ts`.
- **Errors.** Anything thrown (including from async handlers, which Express 5 forwards automatically) reaches one error handler in `common/http/error-handler.ts`, which always answers in OpenAI's error shape.
- **API docs.** Each `*.routes.ts` has an `@openapi` JSDoc block per endpoint; `swagger-jsdoc` assembles them at startup. Keep the docs in the same change as the route. `src/docs/openapi.spec.ts` fails if a documented endpoint is missing or a `$ref` does not resolve.
