import { describe, expect, it, vi } from 'vitest';
import { retryWithBackoff } from '../retry';

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

describe('retryWithBackoff', () => {
  it('returns the value and the attempt count on success', async () => {
    const result = await retryWithBackoff(async () => 'ok');
    expect(result).toMatchObject({ success: true, data: 'ok', attempts: 1 });
  });

  it('honours Retry-After from a rate-limited dependency instead of its own curve', async () => {
    const { delays, restore } = captureDelays();
    try {
      let attempts = 0;
      const result = await retryWithBackoff(
        async () => {
          attempts += 1;
          if (attempts === 1) throw httpError(429, { retryAfterSeconds: 6 });
          return 'ok';
        },
        { maxRetries: 2, initialDelayMs: 50, maxDelayMs: 200 },
      );
      expect(result.success).toBe(true);
    } finally {
      restore();
    }
    expect(delays).toEqual([6000]);
  });

  it('refuses to replay a non-idempotent call that may already have applied', async () => {
    const { restore } = captureDelays();
    const operation = vi.fn(async () => {
      throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    });
    try {
      const result = await retryWithBackoff(operation, { maxRetries: 3, idempotent: false });
      expect(result.success).toBe(false);
    } finally {
      restore();
    }
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('replays that same failure when the caller declares the call idempotent', async () => {
    const { restore } = captureDelays();
    let calls = 0;
    try {
      const result = await retryWithBackoff(
        async () => {
          calls += 1;
          if (calls < 3) throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
          return 'ok';
        },
        { maxRetries: 3, idempotent: true },
      );
      expect(result).toMatchObject({ success: true, data: 'ok' });
    } finally {
      restore();
    }
    expect(calls).toBe(3);
  });

  it('stops when the caller says the error is not retryable', async () => {
    const operation = vi.fn(async () => {
      throw new Error('nope');
    });
    const result = await retryWithBackoff(operation, {
      maxRetries: 5,
      isRetryable: () => false,
    });
    expect(result.success).toBe(false);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('stops immediately on an aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const operation = vi.fn(async () => 'never');
    const result = await retryWithBackoff(operation, { signal: controller.signal });
    expect(result.success).toBe(false);
    expect(operation).not.toHaveBeenCalled();
  });
});
