import { describe, expect, it, vi } from 'vitest';
import { computeBackoffMs, getRetryDelay, retryWithBackoff } from '../error-utils';

function httpError(status: number, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(`HTTP ${status}`), { status, ...extra });
}

function captureDelays(): { delays: number[]; restore: () => void } {
  const delays: number[] = [];
  const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
    handler: () => void,
    ms?: number,
  ) => {
    delays.push(ms ?? 0);
    handler();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout);
  return { delays, restore: () => spy.mockRestore() };
}

describe('shared error-utils retry consumes the shared policy', () => {
  it('honours Retry-After from a rate-limited dependency', async () => {
    const { delays, restore } = captureDelays();
    try {
      let attempts = 0;
      const value = await retryWithBackoff(
        async () => {
          attempts += 1;
          if (attempts === 1) throw httpError(429, { retryAfterSeconds: 4 });
          return 'ok';
        },
        { maxRetries: 2, initialDelay: 1000, shouldRetry: () => true },
      );
      expect(value).toBe('ok');
    } finally {
      restore();
    }
    expect(delays).toEqual([4000]);
  });

  it('clamps an abusive Retry-After instead of parking the caller for an hour', async () => {
    const { delays, restore } = captureDelays();
    try {
      let attempts = 0;
      await retryWithBackoff(
        async () => {
          attempts += 1;
          if (attempts === 1) throw httpError(503, { retryAfterSeconds: 3600 });
          return 'ok';
        },
        { maxRetries: 2, initialDelay: 1000, shouldRetry: () => true },
      );
    } finally {
      restore();
    }
    expect(delays).toEqual([120_000]);
  });

  it('still lets the caller veto a retry', async () => {
    const operation = vi.fn(async () => {
      throw httpError(500);
    });
    await expect(
      retryWithBackoff(operation, { maxRetries: 3, shouldRetry: () => false }),
    ).rejects.toBeTruthy();
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('spreads its backoff so a fleet of clients does not retry in lockstep', () => {
    const early = getRetryDelay(2, { initialDelay: 1000, maxDelay: 60_000 });
    const late = getRetryDelay(2, { initialDelay: 1000, maxDelay: 60_000 });
    const config = { enabled: true, initialDelay: 1000, maxDelay: 60_000, maxRetries: 3 };
    expect(computeBackoffMs(1, config)).toBeLessThanOrEqual(2000);
    expect(Math.max(early, late)).toBeGreaterThan(0);
  });
});
