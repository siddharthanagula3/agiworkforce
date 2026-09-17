import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  withRateLimit: vi.fn(),
  readProductMetrics: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth-guards', () => ({ requirePlatformAdmin: mocks.requirePlatformAdmin }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/features/admin/services/product-metrics', () => ({
  readProductMetrics: mocks.readProductMetrics,
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { NextRequest } from 'next/server';

import { createError } from '@/lib/errors';
import { GET } from './route';

const ROUTE = '/api/admin/product-metrics';

function request(query = ''): NextRequest {
  return new NextRequest(`https://agiworkforce.com${ROUTE}${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.requirePlatformAdmin.mockResolvedValue({ userId: 'user_admin' });
  mocks.readProductMetrics.mockResolvedValue({ from: '', to: '', metrics: [] });
});

describe(`GET ${ROUTE}`, () => {
  /**
   * requirePlatformAdmin answers 404 rather than 403 on purpose: an operator
   * console must not confirm its own existence to a customer.
   */
  it('refuses a customer and never measures anything', async () => {
    mocks.requirePlatformAdmin.mockRejectedValue(createError.notFound('Not found.'));

    const response = await GET(request());

    expect(response.status).toBe(404);
    expect(mocks.readProductMetrics).not.toHaveBeenCalled();
  });

  it('stops at the rate limit before the admin gate', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await GET(request());

    expect(response.status).toBe(429);
    expect(mocks.requirePlatformAdmin).not.toHaveBeenCalled();
  });

  it('measures the requested window', async () => {
    await GET(request('?from=2026-08-01T00:00:00.000Z&to=2026-09-01T00:00:00.000Z'));

    const [input] = mocks.readProductMetrics.mock.calls[0] as [{ from: Date; to: Date }];
    expect(input.from.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(input.to.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('falls back to the last thirty days when a bound is unreadable', async () => {
    await GET(request('?from=whenever&to=2026-09-01T00:00:00.000Z'));

    const [input] = mocks.readProductMetrics.mock.calls[0] as [{ from: Date; to: Date }];
    const days = (input.to.getTime() - input.from.getTime()) / 86_400_000;
    expect(days).toBe(30);
  });

  it('never caches a figure about the business', async () => {
    const response = await GET(request());

    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
});
