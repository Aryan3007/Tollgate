import { createHash } from 'node:crypto';
import type { ChatCompletionRequest } from '../completions/dto/chat-completion-request.schema.js';

export interface CachePolicy {
  enabled: boolean;
  /** Highest temperature that may be cached. Omitted temperature counts as 1. */
  maxTemperature: number;
  ttlSeconds: number;
}

/**
 * all-MiniLM truncates input at ~256 tokens. Two long prompts that differ only
 * after the cut would embed identically and wrongly share an answer, so longer
 * prompts are only ever matched exactly.
 */
export const SEMANTIC_MAX_CHARS = 800;

// Fields that never change what the model answers.
const IGNORED_FIELDS = new Set(['stream', 'stream_options', 'user']);

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** JSON with sorted keys, so the same request always serialises the same way. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function requestParameters(req: ChatCompletionRequest): Record<string, unknown> {
  return Object.fromEntries(Object.entries(req).filter(([key]) => !IGNORED_FIELDS.has(key)));
}

/** Why this request must not use the cache, or null when it may. */
export function ineligibleReason(
  req: ChatCompletionRequest,
  policy: CachePolicy,
  redactions: number,
): string | null {
  if (!policy.enabled) return 'disabled_for_team';
  // An answer that depended on a specific Aadhaar, PAN or phone number must
  // never be served to a request about a different one.
  if (redactions > 0) return 'pii_masked';
  if (Array.isArray(req.tools) && req.tools.length > 0) return 'tools';
  if ((req.n ?? 1) > 1) return 'multiple_choices';
  if ((req.temperature ?? 1) > policy.maxTemperature) return 'temperature';
  return null;
}

/** Key for byte-for-byte identical requests. The team is part of the key. */
export function exactCacheKey(teamId: string, req: ChatCompletionRequest): string {
  return `ce:${teamId}:${sha256(canonicalJson(requestParameters(req)))}`;
}

export interface SemanticTarget {
  /** The text to embed: the final user message. */
  text: string;
  /**
   * Hash of team + model + every request parameter + the conversation before
   * the final message + the final message's numbers and negations. A semantic
   * hit must match all of that exactly; only the wording of the final user
   * message may differ, and only by similarity.
   */
  scope: string;
}

function plainText(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  const parts = content as Array<{ type?: string; text?: string }>;
  if (parts.some((part) => part.type !== 'text' || typeof part.text !== 'string')) return null;
  return parts.map((part) => part.text).join('\n');
}

// Words that flip a request's meaning while barely moving its embedding
// ("include GST" vs "exclude GST" scores ~0.96).
const MEANING_FLIPPERS = new Set([
  'not', 'no', 'never', 'dont', 'doesnt', 'didnt', 'cant', 'cannot', 'wont', 'wouldnt', 'shouldnt', 'isnt', 'arent',
  'without', 'exclude', 'excluding', 'except', 'unless',
]);

/**
 * Details an embedding cannot be trusted with: the exact numbers ("5000" vs
 * "50000" scores 0.994) and negations. A semantic match must agree on these
 * exactly, on top of being similar.
 */
export function guardTokens(text: string): string {
  const numbers = text.match(/\d+(?:[.,]\d+)*/g)?.map((n) => n.replaceAll(',', '')) ?? [];
  const flippers = text
    .toLowerCase()
    .replaceAll(/['’]/g, '')
    .match(/[a-z]+/g)
    ?.filter((word) => MEANING_FLIPPERS.has(word)) ?? [];
  return [...new Set([...numbers, ...flippers])].sort().join(' ');
}

export function semanticTarget(teamId: string, req: ChatCompletionRequest): SemanticTarget | null {
  const last = req.messages.at(-1);
  if (last?.role !== 'user') return null;

  const text = plainText(last.content)?.trim();
  if (!text || text.length > SEMANTIC_MAX_CHARS) return null;

  const context = canonicalJson({ ...requestParameters(req), messages: req.messages.slice(0, -1) });
  return { text, scope: sha256(`${teamId}\u0000${req.model}\u0000${context}\u0000${guardTokens(text)}`) };
}

export { sha256 };
