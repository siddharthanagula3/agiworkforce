import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

import { APIException } from '@shared/stores/query-client';
import { resetRetryBudgets } from '@agiworkforce/utils/retry-policy';
import { EnhancedAPIClient } from '../api-enhanced';
import { apiClient } from '../api';

const baseClient = apiClient as unknown as Record<
  'get' | 'post' | 'put' | 'delete',
  ReturnType<typeof vi.fn>
>;

function apiException(status: number, code?: string): APIException {
  return new APIException({ message: `HTTP ${status}`, status, ...(code ? { code } : {}) });
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

beforeEach(() => {
  vi.clearAllMocks();
  resetRetryBudgets();
});

describe('EnhancedAPIClient consumes the one shared retry policy', () => {
  it('honours Retry-After on a GET instead of its own fixed ladder', async () => {
    const { delays, restore } = captureDelays();
    try {
      baseClient.get
        .mockRejectedValueOnce(
          Object.assign(apiException(429), { headers: { 'retry-after': '4' } }),
        )
        .mockResolvedValueOnce({ data: 'ok' });
      await new EnhancedAPIClient().request('/x');
    } finally {
      restore();
    }
    expect(delays).toEqual([4000]);
  });

  it('jitters the backoff so a fleet of clients does not retry in lockstep', async () => {
    const seen = new Set<number>();
    for (let run = 0; run < 12; run++) {
      const { delays, restore } = captureDelays();
      try {
        resetRetryBudgets();
        baseClient.get.mockReset();
        baseClient.get
          .mockRejectedValueOnce(apiException(503))
          .mockResolvedValueOnce({ data: 'ok' });
        await new EnhancedAPIClient().request('/x');
      } finally {
        restore();
      }
      for (const delay of delays) seen.add(delay);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('never replays a POST whose request may already have been applied', async () => {
    const inFlightLoss = Object.assign(new APIException({ message: 'ECONNRESET socket hang up' }), {
      code: 'ECONNRESET',
    });
    baseClient.post.mockRejectedValue(inFlightLoss);
    await expect(new EnhancedAPIClient().post('/x', {})).rejects.toBe(inFlightLoss);
    expect(baseClient.post).toHaveBeenCalledTimes(1);
  });

  it('still replays that same request on an idempotent PUT', async () => {
    const { restore } = captureDelays();
    const inFlightLoss = Object.assign(new APIException({ message: 'ECONNRESET socket hang up' }), {
      code: 'ECONNRESET',
    });
    try {
      baseClient.put.mockRejectedValueOnce(inFlightLoss).mockResolvedValueOnce({ data: 'ok' });
      await new EnhancedAPIClient().put('/x', {});
    } finally {
      restore();
    }
    expect(baseClient.put).toHaveBeenCalledTimes(2);
  });

  it('still retries an idempotent PUT', async () => {
    const { restore } = captureDelays();
    try {
      baseClient.put.mockRejectedValueOnce(apiException(503)).mockResolvedValueOnce({ data: 'ok' });
      await new EnhancedAPIClient().put('/x', {});
    } finally {
      restore();
    }
    expect(baseClient.put).toHaveBeenCalledTimes(2);
  });

  it('rethrows the original APIException, not the retry wrapper', async () => {
    const { restore } = captureDelays();
    const original = apiException(503);
    try {
      baseClient.get.mockRejectedValue(original);
      await expect(new EnhancedAPIClient().request('/x')).rejects.toBe(original);
    } finally {
      restore();
    }
  });

  it('lets the AUTH_FAILED handler veto a retry', async () => {
    baseClient.get.mockRejectedValue(apiException(401, 'AUTH_FAILED'));
    await expect(new EnhancedAPIClient().request('/x')).rejects.toBeInstanceOf(APIException);
    expect(baseClient.get).toHaveBeenCalledTimes(1);
  });

  it('degrades to a single attempt once the shared retry budget is spent', async () => {
    const { restore } = captureDelays();
    try {
      baseClient.get.mockRejectedValue(apiException(503));
      for (let run = 0; run < 60; run++) {
        await expect(new EnhancedAPIClient().request('/x')).rejects.toBeInstanceOf(APIException);
      }
      const callsBefore = baseClient.get.mock.calls.length;
      await expect(new EnhancedAPIClient().request('/x')).rejects.toBeInstanceOf(APIException);
      expect(baseClient.get.mock.calls.length - callsBefore).toBe(1);
    } finally {
      restore();
    }
  });
});
