import { Module } from '@nestjs/common';
import { BudgetModule } from '../budget/budget.module.js';
import { KeyAccessModule } from '../keys/key-access.module.js';
import { ProvidersModule } from '../providers/providers.module.js';
import { RateLimitModule } from '../rate-limit/rate-limit.module.js';
import { RequestLogsModule } from '../request-logs/request-logs.module.js';
import { RoutingModule } from '../routing/routing.module.js';
import { SemanticCacheModule } from '../semantic-cache/semantic-cache.module.js';
import { CompletionsController } from './completions.controller.js';
import { CompletionsService } from './completions.service.js';
import { GatewayModelsController } from './gateway-models.controller.js';

@Module({
  imports: [ProvidersModule, KeyAccessModule, RateLimitModule, BudgetModule, RequestLogsModule, RoutingModule, SemanticCacheModule],
  controllers: [CompletionsController, GatewayModelsController],
  providers: [CompletionsService],
})
export class CompletionsModule {}
