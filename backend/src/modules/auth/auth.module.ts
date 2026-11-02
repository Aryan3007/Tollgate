import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_CONFIG } from '../../config/config.module.js';
import type { Env } from '../../config/env.schema.js';
import { AdminAuthController } from './admin-auth.controller.js';
import { AdminAuthRepository } from './admin-auth.repository.js';
import { AdminAuthService } from './admin-auth.service.js';

@Module({
  imports: [
    // Global so AdminJwtGuard can be used by any controller's module.
    JwtModule.registerAsync({
      global: true,
      inject: [APP_CONFIG],
      useFactory: (env: Env) => ({
        secret: env.JWT_ACCESS_SECRET,
        signOptions: { expiresIn: env.ACCESS_TOKEN_TTL_SECONDS, algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AdminAuthController],
  providers: [AdminAuthRepository, AdminAuthService],
})
export class AuthModule {}
