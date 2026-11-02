import type { PiiEntity } from './detectors/index.js';

/** Matches the placeholders this map hands out, e.g. `<PHONE_1>`. */
export const PLACEHOLDER = /<([A-Z]+_\d+)>/g;

/**
 * The placeholders handed out for one request, so the response can be put
 * back the way the caller wrote it. The same value always gets the same
 * placeholder, which keeps the model's references consistent ("<PHONE_1>
 * ... call <PHONE_1> again"). Lives only for the request; never stored.
 */
export class RedactionMap {
  private readonly byValue = new Map<string, string>();
  private readonly originals = new Map<string, string>();
  private readonly counters = new Map<PiiEntity, number>();
  /** How many spans were replaced (not distinct values). */
  count = 0;

  placeholderFor(type: PiiEntity, value: string): string {
    this.count += 1;
    const key = `${type}\u0000${value}`;
    const existing = this.byValue.get(key);
    if (existing) return existing;

    const n = (this.counters.get(type) ?? 0) + 1;
    this.counters.set(type, n);
    const placeholder = `<${type.toUpperCase()}_${n}>`;
    this.byValue.set(key, placeholder);
    this.originals.set(placeholder, value);
    return placeholder;
  }

  get isEmpty(): boolean {
    return this.originals.size === 0;
  }

  /** Replaces known placeholders; anything else (even if it looks similar) is left alone. */
  restore(text: string): string {
    if (this.isEmpty || !text.includes('<')) return text;
    return text.replace(PLACEHOLDER, (match) => this.originals.get(match) ?? match);
  }
}
