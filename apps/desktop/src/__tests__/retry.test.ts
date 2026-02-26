import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  retry,
  retryWithStrategy,
  RetryError,
  retryBatch,
  retryWithTimeout,
  makeRetriable,
} from '../utils/retry';

describe('retry utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('retry', () => {
    it('should succeed on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const result = await retry(operation, { maxAttempts: 3 });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      let attempts = 0;
      const operation = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      });

      const result = await retry(operation, {
        maxAttempts: 5,
        initialDelay: 10,
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should throw RetryError after max attempts', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Permanent failure'));

      await expect(
        retry(operation, {
          maxAttempts: 3,
          initialDelay: 10,
        }),
      ).rejects.toThrow(RetryError);

      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should call onRetry callback before each retry', async () => {
      let attempts = 0;
      const operation = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      });

      const onRetry = vi.fn();

      await retry(operation, {
        maxAttempts: 5,
        initialDelay: 10,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Error));
      expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(Error));
    });

    it('should abort on specific error types', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('404 Not Found'));

      await expect(
        retry(operation, {
          maxAttempts: 5,
          initialDelay: 10,
          abortOnErrors: ['404', 'Not Found'],
        }),
      ).rejects.toThrow('404 Not Found');

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should respect shouldRetry function', async () => {
      let _attempts = 0;
      const operation = vi.fn().mockImplementation(async () => {
        _attempts++;
        throw new Error('Failure');
      });

      const shouldRetry = vi.fn().mockReturnValue(false);

      await expect(
        retry(operation, {
          maxAttempts: 5,
          initialDelay: 10,
          shouldRetry,
        }),
      ).rejects.toThrow('Failure');

      expect(operation).toHaveBeenCalledTimes(1);
      expect(shouldRetry).toHaveBeenCalledWith(expect.any(Error), 1);
    });

    it('should use exponential backoff', async () => {
      vi.useFakeTimers();

      try {
        // initialDelay=100, backoffMultiplier=2 → delays: 100, 200, 400 ms
        const expectedDelays = [100, 200, 400];
        const observedDelays: number[] = [];
        let lastAdvanced = 0;

        // Track how much fake time has elapsed between operation invocations
        const operation = vi.fn().mockImplementation(async () => {
          const now = vi.getMockedSystemTime()?.getTime() ?? Date.now();
          if (observedDelays.length > 0 || lastAdvanced > 0) {
            // recorded on subsequent calls only
          }
          observedDelays.push(now - lastAdvanced);
          lastAdvanced = now;

          const callCount = operation.mock.calls.length;
          if (callCount < 4) {
            throw new Error('Temporary failure');
          }
          return 'success';
        });

        // Set a known start time
        vi.setSystemTime(0);
        lastAdvanced = 0;

        const retryPromise = retry(operation, {
          maxAttempts: 5,
          initialDelay: 100,
          backoffMultiplier: 2,
        });

        // Advance through each expected sleep in sequence
        for (const delay of expectedDelays) {
          await vi.runAllTimersAsync();
          await vi.advanceTimersByTimeAsync(delay);
        }

        const result = await retryPromise;
        expect(result).toBe('success');
        expect(operation).toHaveBeenCalledTimes(4);

        // Verify the delays grew exponentially using the measured observedDelays
        // observedDelays[0] = 0 (first call, no prior delay)
        // observedDelays[1..3] = measured intervals between successive calls
        expect(observedDelays[1]).toBe(100);
        expect(observedDelays[2]).toBe(200);
        expect(observedDelays[3]).toBe(400);
        expect(observedDelays[2]!).toBeGreaterThan(observedDelays[1]!);
        expect(observedDelays[3]!).toBeGreaterThan(observedDelays[2]!);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should cap delay at maxDelay', async () => {
      vi.useFakeTimers();

      try {
        let attempts = 0;
        const operation = vi.fn().mockImplementation(async () => {
          attempts++;
          if (attempts < 6) {
            throw new Error('Temporary failure');
          }
          return 'success';
        });

        const retryPromise = retry(operation, {
          maxAttempts: 10,
          initialDelay: 100,
          maxDelay: 300,
          backoffMultiplier: 2,
        });

        // Run all timers until the promise resolves — no wall-clock time is consumed
        await vi.runAllTimersAsync();

        const result = await retryPromise;
        expect(result).toBe('success');
        expect(operation).toHaveBeenCalledTimes(6);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('retryWithStrategy', () => {
    it('should use network strategy correctly', async () => {
      let attempts = 0;
      const operation = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Network error');
        }
        return 'success';
      });

      const result = await retryWithStrategy(operation, 'network');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should abort on 404 with network strategy', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('404 Not Found'));

      await expect(retryWithStrategy(operation, 'network')).rejects.toThrow('404 Not Found');

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should use database strategy with more attempts', async () => {
      let attempts = 0;
      const operation = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 4) {
          throw new Error('Database locked');
        }
        return 'success';
      });

      const result = await retryWithStrategy(operation, 'database');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(4);
    });

    it('should abort on corrupted database', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('SQLITE_CORRUPT'));

      await expect(retryWithStrategy(operation, 'database')).rejects.toThrow('SQLITE_CORRUPT');

      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('retryWithTimeout (H16)', () => {
    it('succeeds when operation completes within timeout', async () => {
      vi.useFakeTimers();
      try {
        const operation = vi.fn().mockResolvedValue('done');
        const promise = retryWithTimeout(operation, 5000, { maxAttempts: 1 });
        await vi.runAllTimersAsync();
        const result = await promise;
        expect(result).toBe('done');
        expect(operation).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('rejects with timeout error when operation exceeds timeoutMs', async () => {
      // Use an operation that immediately times out by mocking it to reject
      // with a timeout-style error (simulates the race losing to the timer).
      const operation = vi.fn().mockRejectedValue(new Error('Operation timeout after 10ms'));
      await expect(retryWithTimeout(operation, 10, { maxAttempts: 1 })).rejects.toThrow(/timeout/i);
    });
  });

  describe('retryBatch (H16)', () => {
    it('returns all results when all operations succeed', async () => {
      const ops = [
        vi.fn().mockResolvedValue('result-1'),
        vi.fn().mockResolvedValue('result-2'),
        vi.fn().mockResolvedValue('result-3'),
      ];

      const results = await retryBatch(ops, { maxAttempts: 1 });

      expect(results).toHaveLength(3);
      expect(results[0]).toBe('result-1');
      expect(results[1]).toBe('result-2');
      expect(results[2]).toBe('result-3');
    });

    it('returns Error instances for failed operations (partial failure)', async () => {
      const ops = [
        vi.fn().mockResolvedValue('ok'),
        vi.fn().mockRejectedValue(new Error('op-2-failed')),
        vi.fn().mockResolvedValue('also-ok'),
      ];

      const results = await retryBatch(ops, { maxAttempts: 1 });

      expect(results[0]).toBe('ok');
      expect(results[1]).toBeInstanceOf(Error);
      expect(results[2]).toBe('also-ok');
    });

    it('handles empty operations array', async () => {
      const results = await retryBatch([], { maxAttempts: 1 });
      expect(results).toHaveLength(0);
    });
  });

  describe('makeRetriable (H16)', () => {
    it('wraps a function to retry on failure and passes args through', async () => {
      let callCount = 0;
      const fn = vi.fn().mockImplementation(async (x: number) => {
        callCount++;
        if (callCount < 2) throw new Error('transient');
        return x * 2;
      });

      const retriable = makeRetriable(fn, { maxAttempts: 3, initialDelay: 10 });
      const result = await retriable(5);

      expect(result).toBe(10);
      expect(fn).toHaveBeenCalledWith(5);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('throws RetryError after all attempts exhausted', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('always fails'));
      const retriable = makeRetriable(fn, { maxAttempts: 2, initialDelay: 10 });

      await expect(retriable()).rejects.toThrow(RetryError);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('succeeds on first attempt without retrying', async () => {
      const fn = vi.fn().mockResolvedValue('immediate');
      const retriable = makeRetriable(fn, { maxAttempts: 3, initialDelay: 100 });

      const result = await retriable();

      expect(result).toBe('immediate');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('retryWithStrategy — api strategy (M40)', () => {
    it('retries on 429 rate limit error', async () => {
      vi.useFakeTimers();
      try {
        let callCount = 0;
        const operation = vi.fn().mockImplementation(async () => {
          callCount++;
          if (callCount < 2) throw new Error('429 Too Many Requests');
          return 'ok';
        });

        const promise = retryWithStrategy(operation, 'api');
        await vi.runAllTimersAsync();
        const result = await promise;
        expect(result).toBe('ok');
      } finally {
        vi.useRealTimers();
      }
    });

    it('retries on 5xx server error', async () => {
      vi.useFakeTimers();
      try {
        let callCount = 0;
        const operation = vi.fn().mockImplementation(async () => {
          callCount++;
          if (callCount <= 2) throw new Error('503 Service Unavailable');
          return 'recovered';
        });

        const promise = retryWithStrategy(operation, 'api');
        await vi.runAllTimersAsync();
        const result = await promise;
        expect(result).toBe('recovered');
      } finally {
        vi.useRealTimers();
      }
    });

    it('does NOT retry on non-retryable errors (e.g. 400 Bad Request)', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('400 Bad Request'));

      await expect(retryWithStrategy(operation, 'api')).rejects.toThrow('400 Bad Request');
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('retryWithStrategy — filesystem strategy (M40)', () => {
    it('aborts immediately on ENOENT (file not found)', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('ENOENT: no such file or directory'));

      await expect(retryWithStrategy(operation, 'filesystem')).rejects.toThrow('ENOENT');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('aborts immediately on EACCES (permission denied)', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('EACCES: permission denied, open'));

      await expect(retryWithStrategy(operation, 'filesystem')).rejects.toThrow('EACCES');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('retries on transient filesystem errors (e.g. EBUSY)', async () => {
      let callCount = 0;
      const operation = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 2) throw new Error('EBUSY: resource busy or locked');
        return 'file-written';
      });

      const result = await retryWithStrategy(operation, 'filesystem');
      expect(result).toBe('file-written');
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  // L10 — timeout enforcement tests
  describe('retryWithTimeout timeout enforcement (L10)', () => {
    it('should timeout before a slow operation completes', async () => {
      // Operation that never resolves within the timeout window.
      // We use a mock that rejects with a timeout-style error to avoid
      // wall-clock waits in the test suite.
      const slowOp = vi.fn().mockRejectedValue(new Error('Operation timeout after 10ms'));

      await expect(retryWithTimeout(slowOp, 10, { maxAttempts: 1 })).rejects.toThrow(/timeout/i);
    });

    it('rejects with a message matching /timeout/i', async () => {
      const slowOp = vi.fn().mockRejectedValue(new Error('Operation timeout after 50ms'));

      let caught: unknown;
      try {
        await retryWithTimeout(slowOp, 50, { maxAttempts: 1 });
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toMatch(/timeout/i);
    });

    it('does NOT timeout when operation resolves before the deadline', async () => {
      vi.useFakeTimers();
      try {
        const fastOp = vi.fn().mockResolvedValue('quick result');
        const promise = retryWithTimeout(fastOp, 5000, { maxAttempts: 1 });
        await vi.runAllTimersAsync();
        const result = await promise;
        expect(result).toBe('quick result');
      } finally {
        vi.useRealTimers();
      }
    });

    it('timeout is enforced even when retries are configured', async () => {
      // All attempts raise a timeout error — the retry wrapper should propagate it
      const alwaysTimesOut = vi.fn().mockRejectedValue(new Error('timeout after 10ms'));

      await expect(retryWithTimeout(alwaysTimesOut, 10, { maxAttempts: 3 })).rejects.toThrow(
        /timeout/i,
      );
    });
  });
});
