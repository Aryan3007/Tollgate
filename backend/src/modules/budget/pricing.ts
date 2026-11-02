import type { ChatCompletionRequest } from '../completions/dto/chat-completion-request.schema.js';

export interface ModelPrice {
  inputUsdPerMtok: number;
  outputUsdPerMtok: number;
}

export interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
}

// Deliberately pessimistic: English averages ~4 characters per token, but
// code and non-Latin scripts tokenise denser. Over-estimating only holds a
// little extra budget until the real usage settles the reservation.
const CHARS_PER_TOKEN = 3;
const TOKENS_PER_MESSAGE = 4;

function textLength(content: unknown): number {
  if (typeof content === 'string') return content.length;
  if (Array.isArray(content)) {
    return content.reduce<number>(
      (sum, part: { text?: unknown }) =>
        sum + (typeof part?.text === 'string' ? part.text.length : 0),
      0,
    );
  }
  return 0;
}

/** Upper-bound estimate of prompt tokens, without a provider tokenizer. */
export function estimateInputTokens(req: ChatCompletionRequest): number {
  let chars = 0;
  for (const message of req.messages) {
    chars += textLength(message.content);
    if ('tool_calls' in message) chars += JSON.stringify(message.tool_calls).length;
  }
  if ('tools' in req) chars += JSON.stringify(req.tools).length;
  return Math.ceil(chars / CHARS_PER_TOKEN) + TOKENS_PER_MESSAGE * req.messages.length;
}

/** The output cap the request will run with (the gateway enforces it upstream). */
export function maxOutputTokens(
  req: ChatCompletionRequest,
  defaultMaxTokens: number,
): number {
  return (req.max_completion_tokens ?? req.max_tokens ?? defaultMaxTokens) * (req.n ?? 1);
}

/**
 * USD per million tokens × INR per USD is exactly micro-rupees per token,
 * so no other scaling is needed.
 */
export function costMicroInr(
  tokens: TokenCounts,
  price: ModelPrice,
  usdInrRate: number,
): number {
  return (
    (tokens.inputTokens * price.inputUsdPerMtok +
      tokens.outputTokens * price.outputUsdPerMtok) *
    usdInrRate
  );
}

export function estimatedCostMicroInr(
  tokens: TokenCounts,
  price: ModelPrice,
  usdInrRate: number,
): number {
  return Math.ceil(costMicroInr(tokens, price, usdInrRate));
}

export function actualCostMicroInr(
  tokens: TokenCounts,
  price: ModelPrice,
  usdInrRate: number,
): number {
  return Math.round(costMicroInr(tokens, price, usdInrRate));
}
