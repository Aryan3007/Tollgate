import { Injectable } from '@nestjs/common';
import type { ChatCompletionChunk, ProviderKind, Usage } from '../types.js';
import { OpenAIAdapter } from './openai.adapter.js';

/** Groq speaks OpenAI's format; only where it reports streaming usage differs. */
@Injectable()
export class GroqAdapter extends OpenAIAdapter {
  override readonly kind: ProviderKind = 'groq';

  protected override normalizeChunk(chunk: ChatCompletionChunk): ChatCompletionChunk {
    const groq = chunk.x_groq as { usage?: Usage } | undefined;
    return groq?.usage && !chunk.usage ? { ...chunk, usage: groq.usage } : chunk;
  }
}
