import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../../config/config.module.js';
import type { Env } from '../../../config/env.schema.js';
import { SecretStore } from '../../../infra/keyvault/secret-store.js';
import type { ChatCompletionRequest } from '../../completions/dto/chat-completion-request.schema.js';
import { upstreamFetch } from '../http.js';
import { parseSse } from '../sse.js';
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ProviderAdapter,
  ProviderKind,
  UpstreamContext,
} from '../types.js';
import { UpstreamError } from '../upstream-error.js';
import {
  AnthropicStreamTranslator,
  fromAnthropicResponse,
  toAnthropicRequest,
} from './anthropic.translate.js';

const API_VERSION = '2023-06-01';

@Injectable()
export class AnthropicAdapter implements ProviderAdapter {
  readonly kind: ProviderKind = 'anthropic';

  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    private readonly secrets: SecretStore,
  ) {}

  async complete(req: ChatCompletionRequest, ctx: UpstreamContext): Promise<ChatCompletion> {
    const res = await this.send(toAnthropicRequest(req, ctx.upstreamModel, false), ctx);
    return fromAnthropicResponse((await res.json()) as Parameters<typeof fromAnthropicResponse>[0]);
  }

  async *stream(req: ChatCompletionRequest, ctx: UpstreamContext): AsyncGenerator<ChatCompletionChunk> {
    const res = await this.send(toAnthropicRequest(req, ctx.upstreamModel, true), ctx);
    if (!res.body) throw UpstreamError.network(this.kind, 'empty response body');

    const translator = new AnthropicStreamTranslator();
    for await (const event of parseSse(res.body)) {
      const parsed = JSON.parse(event.data) as Parameters<AnthropicStreamTranslator['translate']>[0];
      yield* translator.translate(parsed);
    }
  }

  private async send(body: Record<string, unknown>, ctx: UpstreamContext): Promise<Response> {
    const apiKey = await this.secrets.getProviderKey(this.kind);
    return upstreamFetch({
      provider: this.kind,
      url: `${ctx.baseUrl}/messages`,
      headers: { 'x-api-key': apiKey, 'anthropic-version': API_VERSION },
      body,
      signal: ctx.signal,
      ttfbTimeoutMs: this.env.UPSTREAM_TTFB_TIMEOUT_MS,
    });
  }
}
