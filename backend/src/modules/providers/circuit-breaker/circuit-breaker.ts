export type BreakerState = 'closed' | 'open' | 'half_open';

export const WINDOW_SIZE = 20;
export const MIN_CALLS = 10;
export const FAILURE_RATE = 0.5;
export const CONSECUTIVE_FAILURES = 5;
export const COOLDOWN_MS = 30_000;

/**
 * Tracks one provider's recent calls.
 *
 * closed    → calls flow. Opens at >= 50% failures over the last 20 calls (at
 *             least 10 seen), or on 5 failures in a row.
 * open      → calls are refused for 30 s, so traffic moves on immediately
 *             instead of waiting on timeouts.
 * half_open → one probe is let through: success closes, failure reopens.
 */
export class CircuitBreaker {
  private state: BreakerState = 'closed';
  private outcomes: boolean[] = [];
  private consecutiveFailures = 0;
  private openedAt = 0;
  private probing = false;

  constructor(
    private readonly onStateChange: (state: BreakerState) => void = () => undefined,
    private readonly now: () => number = Date.now,
  ) {}

  get current(): BreakerState {
    return this.state;
  }

  /** True when a call may proceed. Must be followed by exactly one outcome call. */
  tryAcquire(): boolean {
    if (this.state === 'open') {
      if (this.now() - this.openedAt < COOLDOWN_MS) return false;
      this.transition('half_open');
      this.probing = false;
    }
    if (this.state === 'closed') return true;
    if (this.probing) return false;
    this.probing = true;
    return true;
  }

  onSuccess(): void {
    if (this.state === 'half_open') {
      this.reset();
      this.transition('closed');
    } else if (this.state === 'closed') {
      this.record(true);
    }
  }

  onFailure(): void {
    if (this.state === 'half_open') {
      this.open();
    } else if (this.state === 'closed') {
      this.record(false);
      if (this.shouldOpen()) this.open();
    }
  }

  /** The call told us nothing about the provider (client left, not configured). */
  onCancelled(): void {
    this.probing = false;
  }

  private record(ok: boolean): void {
    this.outcomes.push(ok);
    if (this.outcomes.length > WINDOW_SIZE) this.outcomes.shift();
    this.consecutiveFailures = ok ? 0 : this.consecutiveFailures + 1;
  }

  private shouldOpen(): boolean {
    if (this.consecutiveFailures >= CONSECUTIVE_FAILURES) return true;
    if (this.outcomes.length < MIN_CALLS) return false;
    const failures = this.outcomes.filter((ok) => !ok).length;
    return failures / this.outcomes.length >= FAILURE_RATE;
  }

  private open(): void {
    this.reset();
    this.openedAt = this.now();
    this.transition('open');
  }

  private reset(): void {
    this.outcomes = [];
    this.consecutiveFailures = 0;
    this.probing = false;
  }

  private transition(state: BreakerState): void {
    if (state === this.state) return;
    this.state = state;
    this.onStateChange(state);
  }
}
