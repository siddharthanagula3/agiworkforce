import { describe, it, expect, vi, beforeEach } from 'vitest';
import { retry, retryWithStrategy, RetryError } from '../utils/retry';

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
});
