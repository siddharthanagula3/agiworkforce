import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyCronRequest: vi.fn(),
  rollUpProductMetrics: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/cron-auth', () => ({ verifyCronRequest: mocks.verifyCronRequest }));
vi.mock('@/features/admin/services/product-metrics', () => ({
  rollUpProductMetrics: mocks.rollUpProductMetrics,
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: mocks.warn, error: mocks.error, debug: vi.fn() },
}));

import { NextRequest } from 'next/server';

import { GET } from './route';

const ROUTE = '/api/cron/roll-up-product-metrics';

function request(): NextRequest {
  return new NextRequest(`https://agiworkforce.com${ROUTE}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyCronRequest.mockReturnValue(true);
  mocks.rollUpProductMetrics.mockResolvedValue({ day: '2026-09-16', written: 25, purged: 12 });
});

describe(`GET ${ROUTE}`, () => {
  it('admits only the scheduler credential, and rolls nothing up without it', async () => {
    mocks.verifyCronRequest.mockReturnValue(false);

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.rollUpProductMetrics).not.toHaveBeenCalled();
  });

  it('reports the day it snapshotted and what it purged', async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      day: '2026-09-16',
      written: 25,
      purged: 12,
    });
  });

  it('answers 500 without leaking the failure to the scheduler body', async () => {
    mocks.rollUpProductMetrics.mockRejectedValue(new Error('connection terminated'));

    const response = await GET(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Internal server error' });
    expect(mocks.error).toHaveBeenCalled();
  });
});
