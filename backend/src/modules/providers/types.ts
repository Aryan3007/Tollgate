import type { ChatCompletionRequest } from '../completions/dto/chat-completion-request.schema.js';

export type ProviderKind = 'openai' | 'anthropic' | 'groq';

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletion {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string | null; [key: string]: unknown };
    finish_reason: string | null;
  }>;
  usage?: Usage;
  [key: string]: unknown;
}

export interface ChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: { role?: string; content?: string | null; [key: string]: unknown };
    finish_reason: string | null;
  }>;
  usage?: Usage | null;
  [key: string]: unknown;
}

export interface UpstreamContext {
  /** Aborted when the client disconnects. */
  signal: AbortSignal;
  baseUrl: string;
  /** The provider's own model name, which may differ from the public alias. */
  upstreamModel: string;
}

/**
 * Every provider speaks OpenAI's format at this boundary. Adapters translate
 * in both directions, so the pipeline never sees provider-specific shapes.
 */
export interface ProviderAdapter {
  readonly kind: ProviderKind;
  complete(
    req: ChatCompletionRequest,
    ctx: UpstreamContext,
  ): Promise<ChatCompletion>;
  /** Always yields usage on the final chunk, whether or not the client asked for it. */
  stream(
    req: ChatCompletionRequest,
    ctx: UpstreamContext,
  ): AsyncIterable<ChatCompletionChunk>;
}
