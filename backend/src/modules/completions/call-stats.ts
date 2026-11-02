/** Value of the `x-tollgate-cache` response header. */
export type CacheHeader = 'hit-exact' | 'hit-semantic' | 'miss' | 'skip';

/**
 * What one request cost and saved. Returned to the caller only when it sends
 * `x-tollgate-stats: 1`: as a response header, or after the last chunk of a
 * stream as an SSE comment (which every SSE client ignores).
 */
export interface CallStats {
  cache: CacheHeader;
  /** Provider that answered; null for a cache hit. */
  provider: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  /** Tokens a cache hit did not have to buy. */
  savedTokens: number;
  /** Micro-rupees (₹1 = 1,000,000). */
  costMicroInr: number;
  savedMicroInr: number;
  /** Personal values masked before the request reached a provider. */
  redactions: number;
  failovers: number;
  latencyMs: number;
}
