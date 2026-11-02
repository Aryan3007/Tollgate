import { Embedder } from '../../src/modules/semantic-cache/embedder.js';

/**
 * A deterministic stand-in for the real model: each word bumps one of 384
 * dimensions, so prompts sharing most of their words get a high cosine
 * similarity and unrelated prompts get a low one. No download, no threads.
 */
export class HashEmbedder extends Embedder {
  readonly dimensions = 384;
  readonly ready = true;
  /** Texts embedded so far, so tests can assert that no embedding was needed. */
  readonly calls: string[] = [];

  embed(text: string): Promise<Float32Array> {
    this.calls.push(text);
    const vector = new Float32Array(this.dimensions);
    for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
      let hash = 2166136261;
      for (const char of word) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
      vector[hash % this.dimensions] = (vector[hash % this.dimensions] ?? 0) + 1;
    }
    const norm = Math.hypot(...vector) || 1;
    return Promise.resolve(vector.map((x) => x / norm));
  }
}
