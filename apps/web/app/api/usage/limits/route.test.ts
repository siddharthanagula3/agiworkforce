// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
type ScanModule0 = typeof import('@/lib/logger');
type ScanModule1 = typeof import('@/lib/server/rls-db');
type ScanModule2 = typeof import('@/lib/rate-limit');
type ScanModule3 = typeof import('@/lib/cors');
type ScanModule4 = typeof import('@/lib/services/entitlement-resolution');
type ScanModule5 = typeof import('@/lib/services/tier-unit-quota-service');
type ScanModule6 = typeof import('@/lib/server/file-storage');
type ScanModule7 = typeof import('@/lib/services/account-usage-history-service');

const mocks = vi.hoisted(() => ({
  userScopedDb: vi.fn(),
  plan: vi.fn(),
  units: vi.fn(),
  images: vi.fn(),
  slots: vi.fn(),
  storage: vi.fn(),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  logger: mocks.logger,
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  getUserScopedDb: (...args: unknown[]) => mocks.userScopedDb(...args),
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  withRateLimitHandler: (handler: unknown) => handler,
  readManagedTurnSlots: (...args: unknown[]) => mocks.slots(...args),
}));
vi.mock('@/lib/cors', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  handleCorsPreflightRequest: vi.fn(() => null),
  withCorsRoute: (handler: unknown) => handler,
}));
vi.mock('@/lib/services/entitlement-resolution', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  resolveEntitledPlanTier: (...args: unknown[]) => mocks.plan(...args),
}));
vi.mock('@/lib/services/tier-unit-quota-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule5>()),
  readTierUnitUsage: (...args: unknown[]) => mocks.units(...args),
}));
vi.mock('@/lib/server/file-storage', async (importOriginal) => ({
  ...(await importOriginal<ScanModule6>()),
  readFileStorageMeter: (...args: unknown[]) => mocks.storage(...args),
}));
vi.mock('@/lib/services/account-usage-history-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule7>()),
  readMonthlyImageUsage: (...args: unknown[]) => mocks.images(...args),
}));

import { ApiKeyScopeError } from '@/lib/api-key-scope-error';
import { IpNotAllowedError } from '@/lib/ip-allow-list-gate';
import { MfaRequiredError } from '@/lib/mfa-policy-gate';
import { GET } from './route';

const USER = 'user_2abcDEF';
const DB = { query: vi.fn() };
const PERIOD = {
  periodStart: '2026-09-01T00:00:00.000Z',
  resetAt: '2026-10-01T00:00:00.000Z',
  units: [
    { unit: 'voice_minutes', consumed: 12, hardLimit: 60, softLimit: 48 },
    { unit: 'computer_use_requests', consumed: 3, hardLimit: null, softLimit: null },
  ],
};
const IMAGES = { images: 4, requests: 2, credits: 12 };
const STORAGE = { usedBytes: 52_428_800, limitBytes: 10_737_418_240 };

function limits(): Promise<Response> {
  return GET(new NextRequest('http://localhost:3000/api/usage/limits'));
}

beforeEach(() => {
  mocks.userScopedDb.mockResolvedValue({ db: DB, userId: USER, organizationId: null });
  mocks.plan.mockResolvedValue('pro');
  mocks.units.mockResolvedValue(PERIOD);
  mocks.images.mockResolvedValue(IMAGES);
  mocks.slots.mockResolvedValue({ limit: 3, active: 1 });
  mocks.storage.mockResolvedValue(STORAGE);
});

describe('GET /api/usage/limits', () => {
  it('reports this month for the plan the account is entitled to, in units and credits', async () => {
    const response = await limits();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      planTier: 'pro',
      periodStart: PERIOD.periodStart,
      resetAt: PERIOD.resetAt,
      units: PERIOD.units,
      images: IMAGES,
      responses: { limit: 3, active: 1 },
      storage: STORAGE,
    });
    expect(mocks.plan).toHaveBeenCalledWith(DB, USER);
    expect(mocks.units).toHaveBeenCalledWith(DB, USER, 'pro');
    expect(mocks.images).toHaveBeenCalledWith(DB, USER);
    expect(mocks.slots).toHaveBeenCalledWith({ userId: USER, planTier: 'pro' });
    expect(mocks.storage).toHaveBeenCalledWith({ db: DB, userId: USER, organizationId: null });
    expect(mocks.userScopedDb).toHaveBeenCalledWith(expect.anything(), {
      apiKeyScope: 'usage:read',
    });
  });

  it('still answers when the running response count cannot be read, and says it is unknown', async () => {
    mocks.slots.mockRejectedValue(new Error('redis unavailable'));

    const response = await limits();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ responses: null, units: PERIOD.units });
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER }),
      'Running response count unavailable',
    );
  });

  it('answers 500 without the cause when the entitled plan cannot be resolved', async () => {
    mocks.plan.mockRejectedValue(new Error('relation "subscriptions" does not exist'));

    const response = await limits();

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('subscriptions');
    expect(mocks.units).not.toHaveBeenCalled();
  });

  it('answers 500 when a monthly counter cannot be read', async () => {
    mocks.images.mockRejectedValue(new Error('timeout'));

    const response = await limits();

    expect(response.status).toBe(500);
  });

  it('refuses a caller who is not signed in', async () => {
    mocks.userScopedDb.mockRejectedValue(new Error('no session'));

    const response = await limits();

    expect(response.status).toBe(401);
    expect(mocks.plan).not.toHaveBeenCalled();
  });

  it.each([
    [
      'an API key without the usage read scope',
      new ApiKeyScopeError('API key does not have the required scope'),
    ],
    [
      'a workspace that requires MFA',
      new MfaRequiredError('Multi-factor authentication is required'),
    ],
    ['an address outside the workspace allow list', new IpNotAllowedError()],
  ])(
    'passes through the refusal for %s rather than reporting a sign-in problem',
    async (_case, error) => {
      mocks.userScopedDb.mockRejectedValue(error);

      const response = await limits();

      expect(response.status).toBe(403);
      expect(mocks.plan).not.toHaveBeenCalled();
    },
  );
});
