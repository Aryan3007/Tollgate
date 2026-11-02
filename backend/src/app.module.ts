import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { GatewayExceptionFilter } from './common/filters/gateway-exception.filter.js';
import { APP_CONFIG, ConfigModule } from './config/config.module.js';
import type { Env } from './config/env.schema.js';
import { DatabaseModule } from './db/database.module.js';
import { RedisModule } from './infra/redis/redis.module.js';
import { AnalyticsModule } from './modules/analytics/analytics.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CompletionsModule } from './modules/completions/completions.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { KeysModule } from './modules/keys/keys.module.js';
import { TeamsModule } from './modules/teams/teams.module.js';

const REQUEST_ID_PATTERN = /^[\w-]{1,128}$/;

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          genReqId: (req, res) => {
            const incoming = req.headers['x-request-id'];
            const id =
              typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)
                ? incoming
                : randomUUID();
            res.setHeader('x-request-id', id);
            return id;
          },
          redact: ['req.headers.authorization', 'req.headers.cookie'],
          autoLogging: {
            ignore: (req) => req.url === '/health' || req.url === '/ready',
          },
          transport:
            env.NODE_ENV === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    DatabaseModule,
    RedisModule,
    HealthModule,
    AuthModule,
    TeamsModule,
    KeysModule,
    CompletionsModule,
    AnalyticsModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: GatewayExceptionFilter }],
})
export class AppModule {}
