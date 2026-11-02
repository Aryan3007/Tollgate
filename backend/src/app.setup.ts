import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { GatewayError } from './common/errors/gateway-error.js';
import { APP_CONFIG } from './config/config.module.js';
import type { Env } from './config/env.schema.js';

/** Shared by main.ts and e2e tests so both run the exact same app. */
export function configureApp(app: NestExpressApplication): Env {
  const env = app.get<Env>(APP_CONFIG);

  app.useLogger(app.get(Logger));
  // CSP is off: this service only returns JSON and SSE, and Swagger UI needs inline scripts.
  app.use(helmet({ contentSecurityPolicy: false }));
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
  app.useBodyParser('json', { limit: env.REQUEST_BODY_LIMIT });
  app.enableCors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    // Browsers hide non-standard response headers unless they are listed here.
    exposedHeaders: ['x-request-id', 'x-tollgate-cache', 'x-tollgate-stats', 'retry-after'],
  });
  app.setGlobalPrefix('v1', { exclude: ['health', 'ready'] });
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Tollgate')
      .setDescription(
        'Self-hosted, OpenAI-compatible LLM gateway: budgets, PII redaction, semantic caching and provider failover. ' +
          'Gateway routes take a virtual key (`tg_live_…`); admin routes take an admin access token.',
      )
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', description: 'Admin access token from /v1/admin/auth/login' })
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', description: 'Tollgate virtual key (tg_live_…)' },
        'virtual-key',
      )
      .addCookieAuth('tg_refresh')
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
    swaggerUiEnabled: env.SWAGGER_UI_ENABLED ?? env.NODE_ENV !== 'production',
  });

  return env;
}
