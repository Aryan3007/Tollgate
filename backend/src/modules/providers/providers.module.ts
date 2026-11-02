import { Module } from '@nestjs/common';
import { KeyVaultModule } from '../../infra/keyvault/keyvault.module.js';
import { AnthropicAdapter } from './adapters/anthropic.adapter.js';
import { GroqAdapter } from './adapters/groq.adapter.js';
import { OpenAIAdapter } from './adapters/openai.adapter.js';
import { BreakerRegistry } from './circuit-breaker/breaker-registry.js';
import { ProviderHealthController } from './provider-health.controller.js';
import { ProviderHealthService } from './provider-health.service.js';
import { ModelCatalogService } from './model-catalog.service.js';
import { ModelsController } from './models.controller.js';
import { ModelsService } from './models.service.js';
import { ProviderRegistry } from './provider-registry.js';

@Module({
  imports: [KeyVaultModule],
  controllers: [ModelsController, ProviderHealthController],
  providers: [
    OpenAIAdapter,
    AnthropicAdapter,
    GroqAdapter,
    ProviderRegistry,
    ModelCatalogService,
    ModelsService,
    BreakerRegistry,
    ProviderHealthService,
  ],
  exports: [ProviderRegistry, ModelCatalogService, BreakerRegistry],
})
export class ProvidersModule {}
