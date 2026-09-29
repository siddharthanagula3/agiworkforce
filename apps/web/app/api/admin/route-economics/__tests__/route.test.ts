import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getClerkAuthUser: vi.fn(),
  assertAccountActive: vi.fn(),
  withRateLimit: vi.fn(),
  readRouteEconomics: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: mocks.getClerkAuthUser,
  assertAccountActive: mocks.assertAccountActive,
}));
vi.mock('@/lib/server/identity', () => ({ getIdentityUser: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/features/admin/services/route-economics', () => ({
  readRouteEconomics: mocks.readRouteEconomics,
}));

import { createError } from '@/lib/errors';
import { GET } from '../route';

const OPERATOR = 'operator_1';
const ECONOMICS = { routes: [{ route: 'chat', costMicros: 1200 }], windowDays: 30 };

function request(): NextRequest {
  return new NextRequest('http://localhost/api/admin/route-economics');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AGI_PLATFORM_ADMIN_USER_IDS', OPERATOR);
  mocks.getClerkAuthUser.mockResolvedValue({ userId: OPERATOR });
  mocks.assertAccountActive.mockResolvedValue(undefined);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.readRouteEconomics.mockResolvedValue(ECONOMICS);
});

describe('GET /api/admin/route-economics', () => {
  it('rejects a signed-out caller with 401', async () => {
    mocks.getClerkAuthUser.mockRejectedValue(createError.unauthorized());

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.readRouteEconomics).not.toHaveBeenCalled();
  });

  it('answers 404 to a signed-in user who is not a platform operator', async () => {
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'org_owner_1' });

    const response = await GET(request());

    expect(response.status).toBe(404);
    expect(mocks.readRouteEconomics).not.toHaveBeenCalled();
  });

  it('refuses a suspended operator', async () => {
    mocks.assertAccountActive.mockRejectedValue(createError.forbidden('Account unavailable'));

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(mocks.readRouteEconomics).not.toHaveBeenCalled();
  });

  it('returns the economics to an operator without caching', async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual(ECONOMICS);
    expect(mocks.assertAccountActive).toHaveBeenCalledWith(OPERATOR);
  });
});
