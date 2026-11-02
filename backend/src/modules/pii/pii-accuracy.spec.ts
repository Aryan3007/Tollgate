import { DATASET } from '../../../test/fixtures/pii/dataset.js';
import { detectPii, PII_ENTITIES } from './detectors/index.js';

// Span-level scoring: a prediction counts only if both type and exact text match.
describe('PII detection accuracy on the labelled dataset', () => {
  const tally = Object.fromEntries(PII_ENTITIES.map((t) => [t, { tp: 0, fp: 0, fn: 0 }]));

  beforeAll(() => {
    for (const { text, expected } of DATASET) {
      const found = detectPii(text, [...PII_ENTITIES]);
      const key = (s: { type: string; value: string }) => `${s.type}|${s.value}`;
      const expectedKeys = new Set(expected.map(key));
      const foundKeys = new Set(found.map(key));
      for (const k of foundKeys) {
        const type = k.split('|')[0]!;
        if (expectedKeys.has(k)) tally[type]!.tp += 1;
        else tally[type]!.fp += 1;
      }
      for (const k of expectedKeys) if (!foundKeys.has(k)) tally[k.split('|')[0]!]!.fn += 1;
    }

    const rows = PII_ENTITIES.map((type) => {
      const { tp, fp, fn } = tally[type]!;
      return { type, tp, fp, fn, precision: (tp / (tp + fp || 1)).toFixed(3), recall: (tp / (tp + fn || 1)).toFixed(3) };
    });
    console.table(rows);
  });

  it('has at least 300 labelled sentences', () => {
    expect(DATASET.length).toBeGreaterThanOrEqual(300);
  });

  it.each(PII_ENTITIES)('%s: precision and recall are at least 0.95', (type) => {
    const { tp, fp, fn } = tally[type]!;

    expect(tp / (tp + fp)).toBeGreaterThanOrEqual(0.95);
    expect(tp / (tp + fn)).toBeGreaterThanOrEqual(0.95);
  });

  it('overall: no false positives on look-alikes and plain text', () => {
    const total = Object.values(tally).reduce((sum, t) => sum + t.fp, 0);

    expect(total).toBe(0);
  });
});
