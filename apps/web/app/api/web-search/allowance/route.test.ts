// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createError } from '@/lib/errors';

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  scoped: vi.fn(),
  clerkAuth: vi.fn(),
  accountActive: vi.fn(),
  plan: vi.fn(),
  allowance: vi.fn(),
}));

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  withRateLimit: mocks.rateLimit,
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/rls-db')>()),
  getUserScopedDb: mocks.scoped,
}));
vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-auth')>()),
  getClerkAuthUser: mocks.clerkAuth,
  assertAccountActive: mocks.accountActive,
}));
vi.mock('@/lib/services/entitlement-resolution', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/entitlement-resolution')>()),
  resolveEntitledPlanTier: mocks.plan,
}));
vi.mock('@/lib/web-search/search-budget', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/web-search/search-budget')>()),
  readSearchAllowance: mocks.allowance,
}));

const { GET } = await import('./route');

beforeEach(() => {
  mocks.rateLimit.mockReset().mockResolvedValue(null);
  mocks.scoped.mockReset().mockResolvedValue({ userId: 'account-1', db: { scoped: true } });
  mocks.accountActive.mockReset().mockResolvedValue(undefined);
  mocks.plan.mockReset().mockResolvedValue('free');
  mocks.allowance.mockReset().mockResolvedValue({
    status: 'exhausted',
    used: 20,
    limit: 20,
    windowDays: 30,
  });
});

it('returns an authenticated user-scoped, uncached allowance', async () => {
  const request = new NextRequest('https://agiworkforce.com/api/web-search/allowance');
  const response = await GET(request);
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(await response.json()).toEqual({
    status: 'exhausted',
    used: 20,
    limit: 20,
    windowDays: 30,
  });
  expect(mocks.scoped).toHaveBeenCalledWith(request, { resolveOrganization: false });
  expect(mocks.clerkAuth).not.toHaveBeenCalled();
  expect(mocks.accountActive).toHaveBeenCalledWith('account-1');
  expect(mocks.plan).toHaveBeenCalledWith({ scoped: true }, 'account-1');
  expect(mocks.allowance).toHaveBeenCalledWith({
    userId: 'account-1',
    planTier: 'free',
    db: { scoped: true },
  });
});

it('does not read an allowance when authentication fails', async () => {
  mocks.scoped.mockRejectedValue(createError.unauthorized());
  const response = await GET(new NextRequest('https://agiworkforce.com/api/web-search/allowance'));
  expect(response.status).toBe(401);
  expect(mocks.allowance).not.toHaveBeenCalled();
});
