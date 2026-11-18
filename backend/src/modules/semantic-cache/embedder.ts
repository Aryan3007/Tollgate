/**
 * Turns text into a unit-length vector. An abstract class (not an interface)
 * so tests can swap in a fake.
 */
export abstract class Embedder {
  abstract readonly dimensions: number;
  /** False until the model has loaded; the semantic cache is skipped until then. */
  abstract readonly ready: boolean;
  abstract embed(text: string): Promise<Float32Array>;

  /** Begin loading the model. The default does nothing (fakes need no warm-up). */
  start(): void {}

  /** Release any worker or connection. The default does nothing. */
  stop(): Promise<void> {
    return Promise.resolve();
  }
}

export class EmbedderUnavailableError extends Error {
  constructor(reason: string) {
    super(`Embedder unavailable: ${reason}`);
    this.name = 'EmbedderUnavailableError';
  }
}
