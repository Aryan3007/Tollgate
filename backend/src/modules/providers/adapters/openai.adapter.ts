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

@Injectable()
export class OpenAIAdapter implements ProviderAdapter {
  readonly kind: ProviderKind = 'openai';

  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    private readonly secrets: SecretStore,
  ) {}

  /** Hook for OpenAI-compatible providers whose chunks differ slightly. */
  protected normalizeChunk(chunk: ChatCompletionChunk): ChatCompletionChunk {
    return chunk;
  }

  async complete(
    req: ChatCompletionRequest,
    ctx: UpstreamContext,
  ): Promise<ChatCompletion> {
    const res = await this.send({ ...req, stream: false }, ctx);
    return (await res.json()) as ChatCompletion;
  }

  async *stream(
    req: ChatCompletionRequest,
    ctx: UpstreamContext,
  ): AsyncGenerator<ChatCompletionChunk> {
    const res = await this.send(
      {
        ...req,
        stream: true,
        // Always request usage so the gateway can settle real cost.
        stream_options: { ...req.stream_options, include_usage: true },
      },
      ctx,
    );
    if (!res.body) {
      throw UpstreamError.network(this.kind, 'empty response body');
    }

    for await (const event of parseSse(res.body)) {
      if (event.data === '[DONE]') return;
      const parsed = JSON.parse(event.data) as ChatCompletionChunk & { error?: { message?: string } };
      if (parsed.error) {
        throw new UpstreamError(
          this.kind,
          true,
          502,
          'upstream_error',
          `Upstream ${this.kind} failed: ${parsed.error.message ?? 'stream error'}`,
        );
      }
      yield this.normalizeChunk(parsed);
    }
  }

  private async send(
    body: ChatCompletionRequest,
    ctx: UpstreamContext,
  ): Promise<Response> {
    const apiKey = await this.secrets.getProviderKey(this.kind);
    return upstreamFetch({
      provider: this.kind,
      url: `${ctx.baseUrl}/chat/completions`,
      headers: { authorization: `Bearer ${apiKey}` },
      body: { ...body, model: ctx.upstreamModel },
      signal: ctx.signal,
      ttfbTimeoutMs: this.env.UPSTREAM_TTFB_TIMEOUT_MS,
    });
  }
}
