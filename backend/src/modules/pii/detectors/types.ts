export const PII_ENTITIES = ['aadhaar', 'pan', 'phone', 'card', 'email'] as const;
export type PiiEntity = (typeof PII_ENTITIES)[number];

export interface PiiMatch {
  type: PiiEntity;
  start: number;
  end: number;
  value: string;
}

export interface PiiDetector {
  readonly type: PiiEntity;
  find(text: string): PiiMatch[];
}

/** Collects every regex hit that also passes `accept`. */
export function findAll(
  type: PiiEntity,
  pattern: RegExp,
  text: string,
  accept: (value: string) => boolean = () => true,
): PiiMatch[] {
  const matches: PiiMatch[] = [];
  for (const hit of text.matchAll(pattern)) {
    const value = hit[0];
    if (accept(value)) matches.push({ type, start: hit.index, end: hit.index + value.length, value });
  }
  return matches;
}

export const digitsOnly = (value: string) => value.replace(/\D/g, '');
