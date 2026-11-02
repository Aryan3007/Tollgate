import { Module } from '@nestjs/common';
import { KeyContextService } from './key-context.service.js';
import { KeysRepository } from './keys.repository.js';

/**
 * Key lookup without the admin API, so the gateway guard and the teams
 * module can depend on it without importing KeysModule (avoids a cycle).
 */
@Module({
  providers: [KeysRepository, KeyContextService],
  exports: [KeysRepository, KeyContextService],
})
export class KeyAccessModule {}
