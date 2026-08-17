import { describe, expect, it, vi } from 'vitest';
import {
  CircuitBreaker,
  CircuitOpenError,
  DependencyOverloadedError,
  DependencyTimeoutError,
  circuitBreakerSnapshots,
  getCircuitBreaker,
  isDependencyUnavailableError,
  resetCircuitBreakers,
} from '../circuitBreaker';

function clock(start = 0) {
  let value = start;
  return {
    now: () => value,
    advance: (ms: number) => {
      value += ms;
    },
  };
}

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('CircuitBreaker', () => {
  it('stays closed while the dependency succeeds', async () => {
    const breaker = new CircuitBreaker({ name: 'ok', volumeThreshold: 2 });
    for (let i = 0; i < 5; i++) {
      await expect(breaker.execute(async () => 'value')).resolves.toBe('value');
    }
    expect(breaker.currentState()).toBe('closed');
    expect(breaker.snapshot().totals.successes).toBe(5);
  });

  it('trips open once the failure rate crosses the threshold', async () => {
    const events: string[] = [];
    const breaker = new CircuitBreaker({
      name: 'failing',
      volumeThreshold: 4,
      failureRateThreshold: 0.5,
      onStateChange: (event) => events.push(`${event.from}->${event.to}`),
    });

    for (let i = 0; i < 4; i++) {
      await expect(
        breaker.execute(async () => {
          throw new Error('upstream 503');
        }),
      ).rejects.toThrow('upstream 503');
    }

    expect(breaker.currentState()).toBe('open');
    expect(events).toEqual(['closed->open']);
  });

  it('fast-fails while open instead of touching the dependency', async () => {
    const time = clock();
    const dependency = vi.fn(async () => {
      throw new Error('down');
    });
    const breaker = new CircuitBreaker({
      name: 'fast-fail',
      volumeThreshold: 2,
      failureRateThreshold: 0.5,
      now: time.now,
    });

    for (let i = 0; i < 2; i++) {
      await expect(breaker.execute(dependency)).rejects.toThrow('down');
    }
    expect(breaker.currentState()).toBe('open');

    const callsBefore = dependency.mock.calls.length;
    await expect(breaker.execute(dependency)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(dependency).toHaveBeenCalledTimes(callsBefore);
  });

  it('serves a fallback instead of throwing when one is supplied', async () => {
    const time = clock();
    const breaker = new CircuitBreaker({
      name: 'fallback',
      volumeThreshold: 2,
      failureRateThreshold: 0.5,
      now: time.now,
    });

    const run = () =>
      breaker.execute(
        async () => {
          throw new Error('down');
        },
        { fallback: (rejection) => `fallback:${rejection.reason}` },
      );

    await expect(run()).resolves.toBe('fallback:error');
    await expect(run()).resolves.toBe('fallback:error');
    expect(breaker.currentState()).toBe('open');
    await expect(run()).resolves.toBe('fallback:open');
  });

  it('times out a slow dependency and aborts the operation', async () => {
    const breaker = new CircuitBreaker({ name: 'slow', timeoutMs: 20, volumeThreshold: 100 });
    let observedAbort = false;

    await expect(
      breaker.execute(
        (signal) =>
          new Promise((_, reject) => {
            signal.addEventListener('abort', () => {
              observedAbort = true;
              reject(signal.reason);
            });
          }),
      ),
    ).rejects.toBeInstanceOf(DependencyTimeoutError);

    expect(observedAbort).toBe(true);
    expect(breaker.snapshot().totals.timeouts).toBe(1);
  });

  it('trips on sustained slowness even when calls eventually succeed', async () => {
    const time = clock();
    const breaker = new CircuitBreaker({
      name: 'slow-rate',
      timeoutMs: 1_000,
      slowCallMs: 100,
      volumeThreshold: 3,
      slowCallRateThreshold: 0.8,
      now: time.now,
    });

    for (let i = 0; i < 3; i++) {
      await breaker.execute(async () => {
        time.advance(500);
        return 'slow but ok';
      });
    }

    expect(breaker.currentState()).toBe('open');
    expect(breaker.snapshot().totals.failures).toBe(0);
  });

  it('sheds load once concurrency and queue are saturated', async () => {
    const breaker = new CircuitBreaker({
      name: 'bulkhead',
      maxConcurrent: 2,
      maxQueued: 1,
      queueTimeoutMs: 1_000,
      timeoutMs: 5_000,
      volumeThreshold: 100,
    });

    const gates = [deferred<string>(), deferred<string>(), deferred<string>()];
    const inFlight = gates.map((gate) => breaker.execute(() => gate.promise));
    await Promise.resolve();

    const shed = breaker.execute(async () => 'never runs');
    await expect(shed).rejects.toBeInstanceOf(DependencyOverloadedError);
    expect(breaker.snapshot().inFlight).toBe(2);
    expect(breaker.snapshot().queued).toBe(1);

    gates.forEach((gate, index) => gate.resolve(`done-${index}`));
    await expect(Promise.all(inFlight)).resolves.toEqual(['done-0', 'done-1', 'done-2']);
    expect(breaker.snapshot().inFlight).toBe(0);
  });

  it('hands a freed slot to the next queued caller without oversubscribing', async () => {
    const breaker = new CircuitBreaker({
      name: 'handoff',
      maxConcurrent: 1,
      maxQueued: 4,
      queueTimeoutMs: 1_000,
      timeoutMs: 5_000,
      volumeThreshold: 100,
    });

    const gates = [deferred<number>(), deferred<number>(), deferred<number>()];
    let peakConcurrency = 0;
    let active = 0;

    const calls = gates.map((gate) =>
      breaker.execute(async () => {
        active += 1;
        peakConcurrency = Math.max(peakConcurrency, active);
        const value = await gate.promise;
        active -= 1;
        return value;
      }),
    );

    for (const [index, gate] of gates.entries()) {
      await Promise.resolve();
      gate.resolve(index);
      await Promise.resolve();
    }

    await expect(Promise.all(calls)).resolves.toEqual([0, 1, 2]);
    expect(peakConcurrency).toBe(1);
  });

  it('recovers through half-open probes and closes cleanly', async () => {
    const time = clock();
    const transitions: string[] = [];
    const breaker = new CircuitBreaker({
      name: 'recovery',
      volumeThreshold: 2,
      failureRateThreshold: 0.5,
      openMs: 1_000,
      halfOpenSuccessesToClose: 2,
      halfOpenMaxCalls: 2,
      now: time.now,
      onStateChange: (event) => transitions.push(`${event.from}->${event.to}`),
    });

    let healthy = false;
    const dependency = async () => {
      if (!healthy) throw new Error('down');
      return 'ok';
    };

    for (let i = 0; i < 2; i++) {
      await expect(breaker.execute(dependency)).rejects.toThrow('down');
    }
    expect(breaker.currentState()).toBe('open');

    time.advance(999);
    await expect(breaker.execute(dependency)).rejects.toBeInstanceOf(CircuitOpenError);

    time.advance(2);
    healthy = true;
    await expect(breaker.execute(dependency)).resolves.toBe('ok');
    expect(breaker.currentState()).toBe('half_open');
    await expect(breaker.execute(dependency)).resolves.toBe('ok');

    expect(breaker.currentState()).toBe('closed');
    expect(transitions).toEqual(['closed->open', 'open->half_open', 'half_open->closed']);
    expect(breaker.snapshot().consecutiveTrips).toBe(0);
  });

  it('reopens with a longer cool-off when a probe fails', async () => {
    const time = clock();
    const breaker = new CircuitBreaker({
      name: 'backoff',
      volumeThreshold: 2,
      failureRateThreshold: 0.5,
      openMs: 1_000,
      now: time.now,
    });

    const dependency = async () => {
      throw new Error('still down');
    };

    for (let i = 0; i < 2; i++) {
      await expect(breaker.execute(dependency)).rejects.toThrow('still down');
    }
    expect(breaker.snapshot().retryAfterMs).toBe(1_000);

    time.advance(1_000);
    await expect(breaker.execute(dependency)).rejects.toThrow('still down');
    expect(breaker.currentState()).toBe('open');
    expect(breaker.snapshot().retryAfterMs).toBe(2_000);
  });

  it('limits how many probes reach a half-open dependency', async () => {
    const time = clock();
    const breaker = new CircuitBreaker({
      name: 'probe-limit',
      volumeThreshold: 2,
      failureRateThreshold: 0.5,
      openMs: 1_000,
      halfOpenMaxCalls: 1,
      halfOpenSuccessesToClose: 1,
      timeoutMs: 5_000,
      now: time.now,
    });

    for (let i = 0; i < 2; i++) {
      await expect(
        breaker.execute(async () => {
          throw new Error('down');
        }),
      ).rejects.toThrow('down');
    }
    time.advance(1_001);

    const gate = deferred<string>();
    const probe = breaker.execute(() => gate.promise);
    await Promise.resolve();

    await expect(breaker.execute(async () => 'second probe')).rejects.toBeInstanceOf(
      CircuitOpenError,
    );

    gate.resolve('probe ok');
    await expect(probe).resolves.toBe('probe ok');
    expect(breaker.currentState()).toBe('closed');
  });

  it('does not count caller cancellation against the dependency', async () => {
    const breaker = new CircuitBreaker({ name: 'cancel', volumeThreshold: 1, timeoutMs: 5_000 });
    const controller = new AbortController();

    const call = breaker.execute(
      (signal) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
      { signal: controller.signal },
    );
    await Promise.resolve();
    controller.abort();

    await expect(call).rejects.toThrow('aborted');
    expect(breaker.currentState()).toBe('closed');
    expect(breaker.snapshot().totals.failures).toBe(0);
  });

  it('ignores errors the caller classifies as non-dependency faults', async () => {
    const breaker = new CircuitBreaker({
      name: 'client-errors',
      volumeThreshold: 2,
      failureRateThreshold: 0.5,
      isFailure: (error) => !(error instanceof RangeError),
    });

    for (let i = 0; i < 6; i++) {
      await expect(
        breaker.execute(async () => {
          throw new RangeError('bad input');
        }),
      ).rejects.toThrow('bad input');
    }

    expect(breaker.currentState()).toBe('closed');
  });

  it('rejects queued callers immediately when the circuit trips', async () => {
    const breaker = new CircuitBreaker({
      name: 'queue-drain',
      maxConcurrent: 1,
      maxQueued: 4,
      queueTimeoutMs: 5_000,
      timeoutMs: 5_000,
      volumeThreshold: 1,
      failureRateThreshold: 0.5,
    });

    const gate = deferred<string>();
    const running = breaker.execute(() => gate.promise);
    await Promise.resolve();
    const queued = breaker.execute(async () => 'queued');
    await Promise.resolve();
    expect(breaker.snapshot().queued).toBe(1);

    gate.reject(new Error('upstream exploded'));

    await expect(running).rejects.toThrow('upstream exploded');
    await expect(queued).rejects.toBeInstanceOf(CircuitOpenError);
    expect(breaker.currentState()).toBe('open');
  });

  it('holds a lease slot for the whole call and frees it on release', async () => {
    const breaker = new CircuitBreaker({
      name: 'lease-slot',
      maxConcurrent: 1,
      maxQueued: 0,
      timeoutMs: 5_000,
      volumeThreshold: 100,
    });

    const lease = await breaker.begin();
    lease.succeeded();
    expect(breaker.snapshot().inFlight).toBe(1);

    await expect(breaker.begin()).rejects.toBeInstanceOf(DependencyOverloadedError);

    lease.release();
    expect(breaker.snapshot().inFlight).toBe(0);
    await expect(breaker.begin()).resolves.toBeDefined();
  });

  it('bounds a lease by time-to-first-outcome, not by total duration', async () => {
    const breaker = new CircuitBreaker({ name: 'lease-ttfb', timeoutMs: 20, volumeThreshold: 100 });

    const slow = await breaker.begin();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(slow.signal.aborted).toBe(true);
    expect(slow.signal.reason).toBeInstanceOf(DependencyTimeoutError);
    slow.failed(slow.signal.reason);
    slow.release();
    expect(breaker.snapshot().totals.timeouts).toBe(1);

    const prompt = await breaker.begin();
    prompt.succeeded();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(prompt.signal.aborted).toBe(false);
    prompt.release();
  });

  it('lets a failure after first output still count against the dependency', async () => {
    const breaker = new CircuitBreaker({
      name: 'lease-late-failure',
      timeoutMs: 5_000,
      volumeThreshold: 4,
      failureRateThreshold: 0.5,
    });

    // Each call books a success at first output and a failure when the stream
    // later breaks, so two calls fill the four-sample window at a 50% failure rate.
    for (let i = 0; i < 2; i++) {
      const lease = await breaker.begin();
      lease.succeeded();
      lease.failed(new Error('socket reset mid-stream'));
      lease.release();
    }

    expect(breaker.snapshot().totals.failures).toBe(2);
    expect(breaker.currentState()).toBe('open');
  });

  it('flags every short-circuit error as a dependency-unavailable signal', () => {
    expect(isDependencyUnavailableError(new CircuitOpenError('x', 100))).toBe(true);
    expect(isDependencyUnavailableError(new DependencyTimeoutError('x', 100))).toBe(true);
    expect(isDependencyUnavailableError(new DependencyOverloadedError('x', 1, 1))).toBe(true);
    expect(isDependencyUnavailableError(new Error('anything else'))).toBe(false);
  });

  it('keeps one breaker per dependency name and reports snapshots', async () => {
    resetCircuitBreakers();
    const first = getCircuitBreaker({ name: 'registry-demo' });
    const second = getCircuitBreaker({ name: 'registry-demo' });
    expect(second).toBe(first);

    await first.execute(async () => 'ok');
    const snapshots = circuitBreakerSnapshots();
    expect(snapshots.map((snapshot) => snapshot.name)).toContain('registry-demo');
    expect(snapshots.find((snapshot) => snapshot.name === 'registry-demo')?.healthy).toBe(true);
    resetCircuitBreakers();
  });
});
