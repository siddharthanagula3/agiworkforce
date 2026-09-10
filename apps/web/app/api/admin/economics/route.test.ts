import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  withRateLimit: vi.fn(),
  readEconomicsSummary: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth-guards', () => ({ requirePlatformAdmin: mocks.requirePlatformAdmin }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/features/admin/services/economics-summary', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/admin/services/economics-summary')
  >('@/features/admin/services/economics-summary');
  return { ...actual, readEconomicsSummary: mocks.readEconomicsSummary };
});
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { NextRequest } from 'next/server';

import { createError } from '@/lib/errors';
import { GET } from './route';

function request(query = ''): NextRequest {
  return new NextRequest(`https://agiworkforce.com/api/admin/economics${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.requirePlatformAdmin.mockResolvedValue({ userId: 'user_admin' });
  mocks.readEconomicsSummary.mockResolvedValue({ groups: [], totals: {} });
});

describe('GET /api/admin/economics', () => {
  /**
   * requirePlatformAdmin answers 404 rather than 403 on purpose: an operator
   * console must not confirm its own existence to a customer.
   */
  it('refuses a customer and never reads the ledger', async () => {
    mocks.requirePlatformAdmin.mockRejectedValue(createError.notFound('Not found.'));

    const response = await GET(request());

    expect(response.status).toBe(404);
    expect(mocks.readEconomicsSummary).not.toHaveBeenCalled();
  });

  it('reads the summary for an admin and does not cache it', async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.readEconomicsSummary).toHaveBeenCalledTimes(1);
  });

  it('passes the requested window and grouping through', async () => {
    await GET(request('?from=2026-08-01&to=2026-08-31&group_by=provider'));

    const input = mocks.readEconomicsSummary.mock.calls[0]?.[0];
    expect(input.groupBy).toBe('provider');
    expect(input.from.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(input.to.toISOString()).toBe('2026-08-31T00:00:00.000Z');
  });

  it('falls back to the total grouping when the parameter is not a grouping', async () => {
    await GET(request('?group_by=whatever'));

    expect(mocks.readEconomicsSummary.mock.calls[0]?.[0].groupBy).toBe('total');
  });

  it('answers the rate limiter before touching the guard', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await GET(request());

    expect(response.status).toBe(429);
    expect(mocks.requirePlatformAdmin).not.toHaveBeenCalled();
  });
});
