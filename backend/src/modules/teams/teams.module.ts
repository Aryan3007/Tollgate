import { Module } from '@nestjs/common';
import { RequestLogsModule } from '../request-logs/request-logs.module.js';
import { KeyAccessModule } from '../keys/key-access.module.js';
import { TeamsController } from './teams.controller.js';
import { TeamsRepository } from './teams.repository.js';
import { TeamsService } from './teams.service.js';

@Module({
  imports: [KeyAccessModule, RequestLogsModule],
  controllers: [TeamsController],
  providers: [TeamsRepository, TeamsService],
  exports: [TeamsRepository],
})
export class TeamsModule {}
