import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router, type Express } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { GatewayError } from './common/errors/gateway-error.js';
import { createErrorHandler, notFoundHandler } from './common/http/error-handler.js';
import { getRootLogger } from './common/logger.js';
import type { Container } from './container.js';
import { buildOpenApiSpec, mountApiDocs } from './docs/openapi.js';
import { analyticsRoutes } from './modules/analytics/analytics.routes.js';
import { adminAuthRoutes } from './modules/auth/admin-auth.routes.js';
import { requireAdmin } from './modules/auth/require-admin.js';
import { requireVirtualKey } from './modules/auth/require-virtual-key.js';
import { completionsRoutes, gatewayModelsRoutes } from './modules/completions/completions.routes.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { keysRoutes } from './modules/keys/keys.routes.js';
import { modelsRoutes } from './modules/providers/models.routes.js';
import { providerHealthRoutes } from './modules/providers/provider-health.routes.js';
import { requestLogsRoutes } from './modules/request-logs/request-logs.routes.js';
import { teamsRoutes } from './modules/teams/teams.routes.js';

const REQUEST_ID_PATTERN = /^[\w-]{1,128}$/;

/**
 * Builds the Express app. Shared by main.ts and the integration tests, so both
 * run exactly the same middleware and routes.
 */
export function createApp(container: Container): Express {
  const { env, controllers } = container;
  const app = express();

  app.use(
    pinoHttp({
      logger: getRootLogger(),
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id =
          typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/ready' },
    }),
  );
  // CSP is off: this service only returns JSON and SSE, and Swagger UI needs inline scripts.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: env.CORS_ORIGINS,
      credentials: true,
      // Browsers hide non-standard response headers unless they are listed here.
      exposedHeaders: ['x-request-id', 'x-tollgate-cache', 'x-tollgate-stats', 'retry-after'],
    }),
  );
  app.use(cookieParser());
  app.use(
    '/v1/admin/auth',
    rateLimit({
      windowMs: 15 * 60_000,
      limit: env.AUTH_RATE_LIMIT_MAX,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_req, res) => {
        const error = new GatewayError(
          429,
          'rate_limit_error',
          'too_many_auth_attempts',
          'Too many attempts; try again later',
        );
        res.status(error.status).json(error.toBody());
      },
    }),
  );
  app.use(express.json({ limit: env.REQUEST_BODY_LIMIT }));

  app.use(healthRoutes(controllers.health));
  mountApiDocs(app, env, buildOpenApiSpec());

  const admin = requireAdmin(container.tokens);
  const virtualKey = requireVirtualKey(container.keyContexts);

  const v1 = Router();
  v1.use('/admin/auth', adminAuthRoutes(controllers.adminAuth, admin));
  v1.use('/admin/teams', admin, teamsRoutes(controllers.teams));
  v1.use('/admin/keys', admin, keysRoutes(controllers.keys));
  v1.use('/admin/models', admin, modelsRoutes(controllers.models));
  v1.use('/admin/requests', admin, requestLogsRoutes(controllers.requestLogs));
  v1.use('/admin/analytics', admin, analyticsRoutes(controllers.analytics));
  v1.use('/admin/providers', admin, providerHealthRoutes(controllers.providerHealth));
  v1.use('/chat/completions', virtualKey, completionsRoutes(controllers.completions));
  v1.use('/models', virtualKey, gatewayModelsRoutes(controllers.gatewayModels));
  app.use('/v1', v1);

  app.use(notFoundHandler);
  app.use(createErrorHandler());
  return app;
}
