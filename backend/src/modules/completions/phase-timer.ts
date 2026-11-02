/** Records how long each pipeline phase took, so a slow request can be traced to its phase. */
export class PhaseTimer {
  readonly ms: Record<string, number> = {};
  private last = performance.now();

  lap(phase: string): void {
    const now = performance.now();
    this.ms[phase] = Math.round(now - this.last);
    this.last = now;
  }
}
