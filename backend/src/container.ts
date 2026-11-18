import type { Redis } from 'ioredis';
import { initLogger } from './common/logger.js';
import type { Env } from './config/env.schema.js';
import { createDatabase, type Database } from './db/client.js';
import { createSecretStore } from './infra/keyvault/create-secret-store.js';
import type { SecretStore } from './infra/keyvault/secret-store.js';
import { closeRedis, connectRedis } from './infra/redis/client.js';
import { AnalyticsController } from './modules/analytics/analytics.controller.js';
import { AnalyticsRepository } from './modules/analytics/analytics.repository.js';
import { AnalyticsService } from './modules/analytics/analytics.service.js';
import { AdminAuthController } from './modules/auth/admin-auth.controller.js';
import { AdminAuthRepository } from './modules/auth/admin-auth.repository.js';
import { AdminAuthService } from './modules/auth/admin-auth.service.js';
import { TokenService } from './modules/auth/token.service.js';
import { BudgetService } from './modules/budget/budget.service.js';
import { BudgetSweeper } from './modules/budget/budget-sweeper.js';
import { CompletionsController } from './modules/completions/completions.controller.js';
import { CompletionsService } from './modules/completions/completions.service.js';
import { GatewayModelsController } from './modules/completions/gateway-models.controller.js';
import { HealthController } from './modules/health/health.controller.js';
import { KeyContextService } from './modules/keys/key-context.service.js';
import { KeysController } from './modules/keys/keys.controller.js';
import { KeysRepository } from './modules/keys/keys.repository.js';
import { KeysService } from './modules/keys/keys.service.js';
import { AnthropicAdapter } from './modules/providers/adapters/anthropic.adapter.js';
import { GroqAdapter } from './modules/providers/adapters/groq.adapter.js';
import { OpenAIAdapter } from './modules/providers/adapters/openai.adapter.js';
import { BreakerRegistry } from './modules/providers/circuit-breaker/breaker-registry.js';
import { ModelCatalogService } from './modules/providers/model-catalog.service.js';
import { ModelsController } from './modules/providers/models.controller.js';
import { ModelsService } from './modules/providers/models.service.js';
import { ProviderHealthController } from './modules/providers/provider-health.controller.js';
import { ProviderHealthService } from './modules/providers/provider-health.service.js';
import { ProviderRegistry } from './modules/providers/provider-registry.js';
import { RateLimitService } from './modules/rate-limit/rate-limit.service.js';
import { RequestLogWriter } from './modules/request-logs/request-log.writer.js';
import { RequestLogsController } from './modules/request-logs/request-logs.controller.js';
import { RequestLogsRepository } from './modules/request-logs/request-logs.repository.js';
import { RouterService } from './modules/routing/router.service.js';
import type { Embedder } from './modules/semantic-cache/embedder.js';
import { LocalEmbedder } from './modules/semantic-cache/local-embedder.js';
import { SemanticCacheService } from './modules/semantic-cache/semantic-cache.service.js';
import { TeamsController } from './modules/teams/teams.controller.js';
import { TeamsRepository } from './modules/teams/teams.repository.js';
import { TeamsService } from './modules/teams/teams.service.js';

/** Things tests replace with fakes; production leaves them unset. */
export interface ContainerOverrides {
  embedder?: Embedder;
  secrets?: SecretStore;
}

export interface Container {
  env: Env;
  db: Database;
  redis: Redis;
  /** Shared by the auth middleware and the routes that need them. */
  tokens: TokenService;
  keyContexts: KeyContextService;
  budget: BudgetService;
  breakers: BreakerRegistry;
  catalog: ModelCatalogService;
  requestLogWriter: RequestLogWriter;
  controllers: {
    adminAuth: AdminAuthController;
    teams: TeamsController;
    keys: KeysController;
    models: ModelsController;
    requestLogs: RequestLogsController;
    analytics: AnalyticsController;
    providerHealth: ProviderHealthController;
    completions: CompletionsController;
    gatewayModels: GatewayModelsController;
    health: HealthController;
  };
  /** Starts background work (log writer, budget sweeper, embedding model). Call before serving. */
  start(): Promise<void>;
  /** Flushes logs, stops background work, then closes Redis and Postgres. Call after the server has stopped. */
  stop(): Promise<void>;
}

/**
 * The composition root: every object in the app is created here, once, and
 * handed what it needs through its constructor. There is no other wiring.
 */
export async function createContainer(env: Env, overrides: ContainerOverrides = {}): Promise<Container> {
  initLogger(env);
  const database = createDatabase(env);
  const { db } = database;
  const redis = await connectRedis(env);
  const secrets = overrides.secrets ?? createSecretStore(env);
  const embedder = overrides.embedder ?? new LocalEmbedder(env);

  // Data access
  const teamsRepo = new TeamsRepository(db);
  const keysRepo = new KeysRepository(db);
  const logsRepo = new RequestLogsRepository(db);
  const adminAuthRepo = new AdminAuthRepository(db);
  const analyticsRepo = new AnalyticsRepository(db);

  // Shared services
  const tokens = new TokenService(env);
  const catalog = new ModelCatalogService(db);
  const keyContexts = new KeyContextService(env, redis, keysRepo);
  const breakers = new BreakerRegistry(redis);
  const requestLogWriter = new RequestLogWriter(env, logsRepo);
  const budget = new BudgetService(env, redis, logsRepo);
  const budgetSweeper = new BudgetSweeper(env, budget);
  const cache = new SemanticCacheService(env, redis, embedder);

  // Providers and the request pipeline
  const providers = new ProviderRegistry(
    new OpenAIAdapter(env, secrets),
    new AnthropicAdapter(env, secrets),
    new GroqAdapter(env, secrets),
  );
  const completions = new CompletionsService(
    env,
    catalog,
    providers,
    new RouterService(catalog),
    breakers,
    new RateLimitService(redis),
    budget,
    requestLogWriter,
    cache,
  );

  // Admin services
  const adminAuth = new AdminAuthService(env, adminAuthRepo, tokens);
  const teamsService = new TeamsService(teamsRepo, keysRepo, keyContexts, logsRepo);
  const keysService = new KeysService(env, keysRepo, teamsRepo, catalog, keyContexts, logsRepo);

  return {
    env,
    db,
    redis,
    tokens,
    keyContexts,
    budget,
    breakers,
    catalog,
    requestLogWriter,
    controllers: {
      adminAuth: new AdminAuthController(env, adminAuth),
      teams: new TeamsController(teamsService),
      keys: new KeysController(keysService),
      models: new ModelsController(new ModelsService(catalog)),
      requestLogs: new RequestLogsController(logsRepo),
      analytics: new AnalyticsController(new AnalyticsService(analyticsRepo)),
      providerHealth: new ProviderHealthController(new ProviderHealthService(db, secrets, breakers)),
      completions: new CompletionsController(completions),
      gatewayModels: new GatewayModelsController(completions),
      health: new HealthController(db, redis),
    },

    async start() {
      embedder.start();
      requestLogWriter.start();
      await budgetSweeper.start();
      await cache.start();
    },

    async stop() {
      // Order matters: the log writer still needs Redis and Postgres to flush.
      await budgetSweeper.stop();
      await requestLogWriter.stop();
      await embedder.stop();
      await closeRedis(redis);
      await database.close();
    },
  };
}
