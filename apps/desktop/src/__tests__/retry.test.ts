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
        })
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

      // Should be called before 2nd and 3rd attempts
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
        })
      ).rejects.toThrow('404 Not Found');

      // Should fail immediately, not retry
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should respect shouldRetry function', async () => {
      let attempts = 0;
      const operation = vi.fn().mockImplementation(async () => {
        attempts++;
        throw new Error('Failure');
      });

      const shouldRetry = vi.fn().mockReturnValue(false);

      await expect(
        retry(operation, {
          maxAttempts: 5,
          initialDelay: 10,
          shouldRetry,
        })
      ).rejects.toThrow('Failure');

      // Should fail immediately because shouldRetry returns false
      expect(operation).toHaveBeenCalledTimes(1);
      expect(shouldRetry).toHaveBeenCalledWith(expect.any(Error), 1);
    });

    it('should use exponential backoff', async () => {
      let attempts = 0;
      const delays: number[] = [];
      const startTime = Date.now();

      const operation = vi.fn().mockImplementation(async () => {
        if (attempts > 0) {
          delays.push(Date.now() - startTime);
        }
        attempts++;
        if (attempts < 4) {
          throw new Error('Temporary failure');
        }
        return 'success';
      });

      await retry(operation, {
        maxAttempts: 5,
        initialDelay: 100,
        backoffMultiplier: 2,
      });

      // Verify exponential backoff (approximately)
      // First retry: ~100ms, second: ~200ms, third: ~400ms
      expect(delays[0]).toBeGreaterThanOrEqual(90);
      expect(delays[1]).toBeGreaterThanOrEqual(190);
      expect(delays[2]).toBeGreaterThanOrEqual(390);
    });

    it('should cap delay at maxDelay', async () => {
      let attempts = 0;
      const operation = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 6) {
          throw new Error('Temporary failure');
        }
        return 'success';
      });

      const startTime = Date.now();

      await retry(operation, {
        maxAttempts: 10,
        initialDelay: 100,
        maxDelay: 300,
        backoffMultiplier: 2,
      });

      const totalTime = Date.now() - startTime;

      // With unlimited backoff: 100 + 200 + 400 + 800 + 1600 = 3100ms
      // With 300ms cap: 100 + 200 + 300 + 300 + 300 = 1200ms
      // Should be closer to 1200ms than 3100ms
      expect(totalTime).toBeLessThan(2000);
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

      // Should fail immediately on 404
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

      // Should fail immediately on corruption
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });
});
