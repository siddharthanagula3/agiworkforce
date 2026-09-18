import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  withRateLimit: vi.fn(async (..._args: unknown[]): Promise<Response | null> => null),
  readReleaseDashboard: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: (...args: unknown[]) => mocks.withRateLimit(...args),
}));

vi.mock('@/lib/auth-guards', () => ({
  requirePlatformAdmin: (...args: unknown[]) => mocks.requirePlatformAdmin(...args),
}));

vi.mock('@/lib/services/release-ledger-service', () => ({
  readReleaseDashboard: (...args: unknown[]) => mocks.readReleaseDashboard(...args),
}));

import { createError } from '@/lib/errors';
import { GET } from '../route';

const DASHBOARD = {
  serving: { commit: 'abc1234', environment: 'production', deploymentId: 'dpl_1', region: 'iad1' },
  ledger: [],
  events: [],
  chain: { intact: true, brokenAt: null },
  lastRollback: null,
  lastDrill: null,
  drillAgeDays: null,
  ledgerMatchesServing: null,
  retentionDays: 400,
  unreadable: [],
};

function request(): NextRequest {
  return new NextRequest('http://localhost:3000/api/admin/releases', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.requirePlatformAdmin.mockResolvedValue({ userId: 'operator_1' });
  mocks.readReleaseDashboard.mockResolvedValue(DASHBOARD);
});

describe('the release dashboard route', () => {
  it('answers not found to anyone who is not a platform operator', async () => {
    mocks.requirePlatformAdmin.mockRejectedValue(createError.notFound('Not found.'));

    const response = await GET(request());

    expect(response.status).toBe(404);
    expect(mocks.readReleaseDashboard).not.toHaveBeenCalled();
  });

  it('never reaches the ledger when the rate limiter already answered', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await GET(request());

    expect(response.status).toBe(429);
    expect(mocks.requirePlatformAdmin).not.toHaveBeenCalled();
    expect(mocks.readReleaseDashboard).not.toHaveBeenCalled();
  });

  it('serves the dashboard to an operator and never caches it', async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual(DASHBOARD);
  });
});
