import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  withRateLimit: vi.fn(),
  readCostOperations: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth-guards', () => ({ requirePlatformAdmin: mocks.requirePlatformAdmin }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/services/cost-rollups', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/cost-rollups')>(
    '@/lib/services/cost-rollups',
  );
  return { ...actual, readCostOperations: mocks.readCostOperations };
});
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { NextRequest } from 'next/server';

import { createError } from '@/lib/errors';
import { GET } from './route';

function request(query = ''): NextRequest {
  return new NextRequest(`https://agiworkforce.com/api/admin/cost-operations${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.requirePlatformAdmin.mockResolvedValue({ userId: 'user_admin' });
  mocks.readCostOperations.mockResolvedValue({ rollup: { rows: [] }, loopSuspects: [] });
});

describe('GET /api/admin/cost-operations', () => {
  it('refuses a customer and never reads the ledger', async () => {
    mocks.requirePlatformAdmin.mockRejectedValue(createError.notFound('Not found.'));

    const response = await GET(request());

    expect(response.status).toBe(404);
    expect(mocks.readCostOperations).not.toHaveBeenCalled();
  });

  it('stops at the rate limiter before it authenticates', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    expect((await GET(request())).status).toBe(429);
    expect(mocks.requirePlatformAdmin).not.toHaveBeenCalled();
  });

  it('reads the report for an admin and does not cache it', async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.readCostOperations).toHaveBeenCalledTimes(1);
  });

  it('passes the requested window and dimension through', async () => {
    await GET(request('?from=2026-08-01&to=2026-08-31&group_by=workspace'));

    const input = mocks.readCostOperations.mock.calls[0]?.[0];
    expect(input.dimension).toBe('workspace');
    expect(input.from.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(input.to.toISOString()).toBe('2026-08-31T00:00:00.000Z');
  });

  it('falls back to capability when the dimension is not one', async () => {
    await GET(request('?group_by=whatever'));

    expect(mocks.readCostOperations.mock.calls[0]?.[0].dimension).toBe('capability');
  });

  it('ignores a loop threshold that is not a positive number', async () => {
    await GET(request('?loop_event_threshold=-4&loop_window_minutes=30'));

    const input = mocks.readCostOperations.mock.calls[0]?.[0];
    expect(input.eventThreshold).toBeUndefined();
    expect(input.windowMinutes).toBe(30);
  });
});
