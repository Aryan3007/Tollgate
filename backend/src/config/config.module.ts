import { Global, Module } from '@nestjs/common';
import { loadEnv } from './env.schema.js';

export const APP_CONFIG = Symbol('APP_CONFIG');

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => loadEnv() }],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
