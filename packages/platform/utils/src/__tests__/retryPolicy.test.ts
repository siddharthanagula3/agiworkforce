import { describe, expect, it, vi } from 'vitest';
import { retry, retryStrategies } from '../async';
import {
  RetryStoppedError,
  classifyRetryError,
  computeRetryDelayMs,
  createRetryBudget,
  readRetryAfterMs,
  runWithRetryPolicy,
} from '../retryPolicy';

function httpError(status: number, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(`HTTP ${status}`), { status, ...extra });
}

function recordingSleep(): { calls: number[]; sleep: (ms: number) => Promise<void> } {
  const calls: number[] = [];
  return {
    calls,
    sleep: (ms: number) => {
      calls.push(ms);
      return Promise.resolve();
    },
  };
}

describe('classifyRetryError', () => {
  it('treats a rejected 429 as safe to retry even for a non-idempotent caller', () => {
    expect(classifyRetryError(httpError(429)).disposition).toBe('retry');
    expect(classifyRetryError(httpError(503)).disposition).toBe('retry');
  });

  it('treats a mid-flight connection loss as unsafe unless the caller is idempotent', () => {
    const reset = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    expect(classifyRetryError(reset).disposition).toBe('retry-only-if-idempotent');
  });

  it('treats a refused connection as never applied, so any caller may retry', () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    expect(classifyRetryError(refused).disposition).toBe('retry');
  });

  it('never retries a client error or an abort', () => {
    expect(classifyRetryError(httpError(400)).disposition).toBe('terminal');
    expect(classifyRetryError(httpError(403)).disposition).toBe('terminal');
    const aborted = new Error('cancelled');
    aborted.name = 'AbortError';
    expect(classifyRetryError(aborted).disposition).toBe('terminal');
  });
});

describe('readRetryAfterMs', () => {
  it('reads numeric seconds, header seconds and an HTTP date', () => {
    expect(readRetryAfterMs(httpError(429, { retryAfterSeconds: 7 }))).toBe(7000);
    expect(readRetryAfterMs(httpError(429, { headers: new Headers({ 'retry-after': '3' }) }))).toBe(
      3000,
    );
    const at = new Date('2026-01-01T00:00:10Z');
    const now = new Date('2026-01-01T00:00:00Z').getTime();
    expect(
      readRetryAfterMs(httpError(503, { headers: { 'retry-after': at.toUTCString() } }), now),
    ).toBe(10_000);
  });
});

describe('computeRetryDelayMs', () => {
  it('spreads retries across the window instead of firing every client at the same instant', () => {
    const early = computeRetryDelayMs(1, { baseDelayMs: 1000, random: () => 0.1 });
    const late = computeRetryDelayMs(1, { baseDelayMs: 1000, random: () => 0.9 });
    expect(early).not.toBe(late);
    expect(early).toBeLessThan(late);
  });

  it('honours Retry-After over the backoff curve, but clamps an abusive value', () => {
    expect(computeRetryDelayMs(1, { baseDelayMs: 1000 }, 4000)).toBe(4000);
    expect(computeRetryDelayMs(1, { baseDelayMs: 1000 }, 10 * 60_000, 120_000)).toBe(120_000);
  });
});

describe('runWithRetryPolicy', () => {
  it('stops immediately when a non-idempotent operation may already have applied', async () => {
    const operation = vi.fn(async () => {
      throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    });
    const { sleep } = recordingSleep();

    await expect(
      runWithRetryPolicy(operation, { idempotent: false, maxAttempts: 5, sleep }),
    ).rejects.toMatchObject({ reason: 'not-idempotent' });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries the same failure when the operation is idempotent', async () => {
    let calls = 0;
    const { sleep } = recordingSleep();
    const result = await runWithRetryPolicy(
      async () => {
        calls += 1;
        if (calls < 3) throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
        return 'ok';
      },
      { idempotent: true, maxAttempts: 5, sleep },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('waits exactly as long as Retry-After asks', async () => {
    const { calls, sleep } = recordingSleep();
    let attempts = 0;
    await runWithRetryPolicy(
      async () => {
        attempts += 1;
        if (attempts === 1) throw httpError(429, { retryAfterSeconds: 12 });
        return 'ok';
      },
      { maxAttempts: 3, sleep },
    );
    expect(calls).toEqual([12_000]);
  });

  it('degrades to a single attempt once the shared budget is spent', async () => {
    const budget = createRetryBudget({ capacity: 2, refillPerSecond: 0, now: () => 0 });
    const { sleep } = recordingSleep();
    const failing = async (): Promise<never> => {
      throw httpError(503);
    };

    for (let i = 0; i < 2; i++) {
      await expect(
        runWithRetryPolicy(failing, { maxAttempts: 2, budget, sleep }),
      ).rejects.toMatchObject({ reason: 'attempts-exhausted' });
    }

    await expect(
      runWithRetryPolicy(failing, { maxAttempts: 2, budget, sleep }),
    ).rejects.toMatchObject({ reason: 'budget-exhausted' });
  });

  it('reports every decision through telemetry', async () => {
    const events: string[] = [];
    const { sleep } = recordingSleep();
    await expect(
      runWithRetryPolicy(
        async () => {
          throw httpError(500);
        },
        {
          operation: 'probe',
          maxAttempts: 2,
          sleep,
          onEvent: (event) => events.push(`${event.type}:${event.attempt}`),
        },
      ),
    ).rejects.toBeInstanceOf(RetryStoppedError);
    expect(events).toEqual(['attempt:1', 'scheduled:1', 'attempt:2', 'stopped:2']);
  });

  it('stops on an already-aborted signal without running the operation', async () => {
    const controller = new AbortController();
    controller.abort();
    const operation = vi.fn(async () => 'never');
    await expect(
      runWithRetryPolicy(operation, { signal: controller.signal }),
    ).rejects.toMatchObject({ reason: 'aborted' });
    expect(operation).not.toHaveBeenCalled();
  });
});

describe('async.retry consumes the shared policy', () => {
  it('jitters its backoff so a fleet of clients does not retry in lockstep', async () => {
    const delays: number[] = [];
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
      handler: () => void,
      ms?: number,
    ) => {
      delays.push(ms ?? 0);
      handler();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);

    try {
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.05);
      await expect(
        retry(
          async () => {
            throw httpError(503);
          },
          { maxAttempts: 3, initialDelay: 1000, maxDelay: 30_000 },
        ),
      ).rejects.toBeTruthy();
      randomSpy.mockRestore();
    } finally {
      timeoutSpy.mockRestore();
    }

    expect(delays.length).toBe(2);
    expect(delays.every((ms) => ms < 1000)).toBe(true);
  });

  it('honours Retry-After from a rate-limited dependency', async () => {
    const delays: number[] = [];
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
      handler: () => void,
      ms?: number,
    ) => {
      delays.push(ms ?? 0);
      handler();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);

    try {
      let attempts = 0;
      const value = await retry(
        async () => {
          attempts += 1;
          if (attempts === 1) throw httpError(429, { retryAfterSeconds: 9 });
          return 'ok';
        },
        { maxAttempts: 3, initialDelay: 1000 },
      );
      expect(value).toBe('ok');
    } finally {
      timeoutSpy.mockRestore();
    }

    expect(delays).toEqual([9000]);
  });

  it('keeps its documented strategies usable', () => {
    expect(retryStrategies.network.maxAttempts).toBe(3);
  });
});
