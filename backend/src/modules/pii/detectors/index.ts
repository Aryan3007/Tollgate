import { aadhaarDetector } from './aadhaar.js';
import { cardDetector } from './card.js';
import { emailDetector } from './email.js';
import { panDetector } from './pan.js';
import { phoneDetector } from './phone.js';
import { PII_ENTITIES, type PiiDetector, type PiiEntity, type PiiMatch } from './types.js';

export { PII_ENTITIES, type PiiEntity, type PiiMatch };

// Order is the tie-break when two matches cover the same span.
const DETECTORS: Record<PiiEntity, PiiDetector> = {
  card: cardDetector,
  aadhaar: aadhaarDetector,
  pan: panDetector,
  phone: phoneDetector,
  email: emailDetector,
};
const PRIORITY: PiiEntity[] = ['card', 'aadhaar', 'pan', 'phone', 'email'];

/**
 * Runs the enabled detectors and resolves overlaps: the longest match wins,
 * ties go to the more specific type. Returns matches in text order.
 */
export function detectPii(text: string, enabled: readonly PiiEntity[]): PiiMatch[] {
  const candidates = PRIORITY.filter((type) => enabled.includes(type)).flatMap((type) =>
    DETECTORS[type].find(text),
  );
  candidates.sort(
    (a, b) => b.end - b.start - (a.end - a.start) || PRIORITY.indexOf(a.type) - PRIORITY.indexOf(b.type),
  );

  const chosen: PiiMatch[] = [];
  for (const match of candidates) {
    if (!chosen.some((kept) => match.start < kept.end && kept.start < match.end)) chosen.push(match);
  }
  return chosen.sort((a, b) => a.start - b.start);
}
