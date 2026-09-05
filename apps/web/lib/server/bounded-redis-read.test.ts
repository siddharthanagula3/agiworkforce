import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { logger } from '@/lib/logger';
import {
  readRedisWithinBudget,
  REDIS_REQUEST_PATH_READ_TIMEOUT_ENV,
  resolveRequestPathRedisReadTimeoutMs,
  wasRedisReadAbandoned,
} from './bounded-redis-read';

const TINY_BUDGET_MS = 5;
const OUTLIVES_BUDGET_MS = 200;
const CONFIGURED_BUDGET_MS = 40;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('readRedisWithinBudget', () => {
  it('returns the value when the read settles inside the budget', async () => {
    const result = await readRedisWithinBudget(Promise.resolve({ hit: true }), OUTLIVES_BUDGET_MS);
    expect(wasRedisReadAbandoned(result)).toBe(false);
    expect(result).toEqual({ hit: true });
  });

  it('abandons a read that outlives the budget', async () => {
    const slow = new Promise((resolve) => {
      setTimeout(() => resolve({ hit: true }), OUTLIVES_BUDGET_MS);
    });
    const startedAt = Date.now();
    const result = await readRedisWithinBudget(slow, TINY_BUDGET_MS);
    expect(wasRedisReadAbandoned(result)).toBe(true);
    expect(Date.now() - startedAt).toBeLessThan(OUTLIVES_BUDGET_MS);
    await slow;
  });

  it('lets a rejection inside the budget reach the caller', async () => {
    await expect(
      readRedisWithinBudget(Promise.reject(new Error('upstash down')), OUTLIVES_BUDGET_MS),
    ).rejects.toThrow('upstash down');
  });

  it('does not surface a rejection that arrives after abandonment', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const late = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('late failure')), TINY_BUDGET_MS * 2);
    });

    const result = await readRedisWithinBudget(late, TINY_BUDGET_MS);
    expect(wasRedisReadAbandoned(result)).toBe(true);
    await late.catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, TINY_BUDGET_MS * 4));

    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});

describe('resolveRequestPathRedisReadTimeoutMs', () => {
  it('takes a configured budget', () => {
    vi.stubEnv(REDIS_REQUEST_PATH_READ_TIMEOUT_ENV, String(CONFIGURED_BUDGET_MS));
    expect(resolveRequestPathRedisReadTimeoutMs()).toBe(CONFIGURED_BUDGET_MS);
  });

  it('falls back to the default and reports an unusable budget', () => {
    vi.stubEnv(REDIS_REQUEST_PATH_READ_TIMEOUT_ENV, 'soon');
    const withDefault = resolveRequestPathRedisReadTimeoutMs();
    vi.unstubAllEnvs();

    expect(withDefault).toBe(resolveRequestPathRedisReadTimeoutMs());
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('rejects a budget below one millisecond', () => {
    vi.stubEnv(REDIS_REQUEST_PATH_READ_TIMEOUT_ENV, '0');
    const withDefault = resolveRequestPathRedisReadTimeoutMs();
    vi.unstubAllEnvs();

    expect(withDefault).toBe(resolveRequestPathRedisReadTimeoutMs());
  });
});
