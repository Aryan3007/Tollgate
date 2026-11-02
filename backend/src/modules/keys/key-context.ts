import type { PiiEntity } from '../pii/detectors/index.js';
import type { CachePolicy } from '../semantic-cache/cache-key.js';

/** Everything the request pipeline needs to know about the calling key. */
export interface KeyContext {
  keyId: string;
  keyHash: string;
  teamId: string;
  allowedModels: string[];
  /** Effective limits: the key's own, or the team's when the key has none. */
  rpmLimit: number;
  tpmLimit: number;
  /** The team's shared limits, enforced across all of its keys. */
  teamRpmLimit: number;
  teamTpmLimit: number;
  monthlyBudgetMicroInr: number;
  defaultMaxTokens: number;
  /** PII types to mask for this key's team. */
  piiEntities: PiiEntity[];
  cache: CachePolicy;
  /** Epoch ms, or null for keys that never expire. */
  expiresAt: number | null;
}
