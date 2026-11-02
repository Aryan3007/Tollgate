import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module.js';
import { RouterService } from './router.service.js';

@Module({
  imports: [ProvidersModule],
  providers: [RouterService],
  exports: [RouterService],
})
export class RoutingModule {}
