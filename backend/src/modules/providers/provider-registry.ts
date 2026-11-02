import { Injectable } from '@nestjs/common';
import { ProviderNotConfiguredError } from '../../common/errors/gateway-error.js';
import { AnthropicAdapter } from './adapters/anthropic.adapter.js';
import { GroqAdapter } from './adapters/groq.adapter.js';
import { OpenAIAdapter } from './adapters/openai.adapter.js';
import type { ProviderAdapter, ProviderKind } from './types.js';

/** Adding a provider = write its adapter and register it here. */
@Injectable()
export class ProviderRegistry {
  private readonly adapters: Partial<Record<ProviderKind, ProviderAdapter>>;

  constructor(openai: OpenAIAdapter, anthropic: AnthropicAdapter, groq: GroqAdapter) {
    this.adapters = { openai, anthropic, groq };
  }

  get(kind: ProviderKind): ProviderAdapter {
    const adapter = this.adapters[kind];
    if (!adapter) throw new ProviderNotConfiguredError(kind);
    return adapter;
  }
}
