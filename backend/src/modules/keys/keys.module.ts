import { Module } from '@nestjs/common';
import { RequestLogsModule } from '../request-logs/request-logs.module.js';
import { ProvidersModule } from '../providers/providers.module.js';
import { TeamsModule } from '../teams/teams.module.js';
import { KeyAccessModule } from './key-access.module.js';
import { KeysController } from './keys.controller.js';
import { KeysService } from './keys.service.js';

@Module({
  imports: [KeyAccessModule, TeamsModule, ProvidersModule, RequestLogsModule],
  controllers: [KeysController],
  providers: [KeysService],
})
export class KeysModule {}
