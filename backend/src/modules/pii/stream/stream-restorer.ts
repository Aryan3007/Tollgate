import type { RedactionMap } from '../redaction-map.js';

// What a placeholder looks like before its closing ">" has arrived.
const PLACEHOLDER_PREFIX = /^<[A-Z]*(?:_\d*)?$/;

/**
 * Restores placeholders in text that arrives in arbitrary pieces. A placeholder
 * such as `<PHONE_1>` can be split anywhere ("<PHO" + "NE_1>"), so the tail of
 * each piece is held back whenever it could still become one. At most the
 * longest placeholder prefix (about 20 characters) is ever held.
 */
export class StreamRestorer {
  private pending = '';

  constructor(private readonly map: RedactionMap) {}

  /** Returns the text that is safe to send now. */
  push(piece: string): string {
    const text = this.pending + piece;
    // Only the last "<" can start an unfinished placeholder: a placeholder
    // never contains "<", so an earlier one is already settled.
    const open = text.lastIndexOf('<');
    const holdFrom = open !== -1 && PLACEHOLDER_PREFIX.test(text.slice(open)) ? open : text.length;
    this.pending = text.slice(holdFrom);
    return this.map.restore(text.slice(0, holdFrom));
  }

  /** Releases whatever was held, at the end of the stream. */
  flush(): string {
    const rest = this.pending;
    this.pending = '';
    return this.map.restore(rest);
  }

  get hasPending(): boolean {
    return this.pending.length > 0;
  }
}
