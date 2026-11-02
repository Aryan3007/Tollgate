import { CircuitBreaker, COOLDOWN_MS, type BreakerState } from './circuit-breaker.js';

function setup() {
  let now = 1_000;
  const changes: BreakerState[] = [];
  const breaker = new CircuitBreaker(
    (state) => changes.push(state),
    () => now,
  );
  return { breaker, changes, advance: (ms: number) => (now += ms) };
}

const fail = (breaker: CircuitBreaker, times: number) => {
  for (let i = 0; i < times; i++) breaker.onFailure();
};

describe('CircuitBreaker', () => {
  it('stays closed through isolated failures', () => {
    const { breaker } = setup();

    fail(breaker, 4);
    breaker.onSuccess();
    fail(breaker, 4);

    expect(breaker.current).toBe('closed');
  });

  it('opens after 5 failures in a row and refuses calls', () => {
    const { breaker, changes } = setup();

    fail(breaker, 5);

    expect(breaker.current).toBe('open');
    expect(breaker.tryAcquire()).toBe(false);
    expect(changes).toEqual(['open']);
  });

  it('opens at 50% failures over the window even without a long streak', () => {
    const { breaker } = setup();

    for (let i = 0; i < 5; i++) {
      breaker.onSuccess();
      breaker.onFailure();
    }

    expect(breaker.current).toBe('open');
  });

  it('does not judge the failure rate on too few calls', () => {
    const { breaker } = setup();

    breaker.onFailure();
    breaker.onSuccess();
    breaker.onFailure();

    expect(breaker.current).toBe('closed');
  });

  it('lets exactly one probe through after the cooldown', () => {
    const { breaker, advance } = setup();
    fail(breaker, 5);
    advance(COOLDOWN_MS);

    expect(breaker.tryAcquire()).toBe(true);
    expect(breaker.current).toBe('half_open');
    expect(breaker.tryAcquire()).toBe(false);
  });

  it('closes when the probe succeeds', () => {
    const { breaker, advance } = setup();
    fail(breaker, 5);
    advance(COOLDOWN_MS);
    breaker.tryAcquire();

    breaker.onSuccess();

    expect(breaker.current).toBe('closed');
    expect(breaker.tryAcquire()).toBe(true);
  });

  it('reopens for a full cooldown when the probe fails', () => {
    const { breaker, advance } = setup();
    fail(breaker, 5);
    advance(COOLDOWN_MS);
    breaker.tryAcquire();

    breaker.onFailure();

    expect(breaker.current).toBe('open');
    advance(COOLDOWN_MS - 1);
    expect(breaker.tryAcquire()).toBe(false);
  });

  it('frees the probe slot when the probe is cancelled', () => {
    const { breaker, advance } = setup();
    fail(breaker, 5);
    advance(COOLDOWN_MS);
    breaker.tryAcquire();

    breaker.onCancelled();

    expect(breaker.tryAcquire()).toBe(true);
  });
});
