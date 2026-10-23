import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
type PromotionModule = typeof import('@/lib/services/usage-limit-promotion-service');

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn(async () => null),
}));

const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  recordAuditEvent: vi.fn(async (..._args: unknown[]) => undefined),
  listUsageLimitPromotions: vi.fn(),
  upsertUsageLimitPromotion: vi.fn(),
  getNeonDb: vi.fn(() => ({ query: vi.fn(), execute: vi.fn() })),
}));

vi.mock('@/lib/auth-guards', () => ({
  requirePlatformAdmin: (...args: unknown[]) => mocks.requirePlatformAdmin(...args),
}));
vi.mock('@/lib/security-audit', () => ({
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(async () => undefined),
  recordAuditEvent: (...args: unknown[]) => mocks.recordAuditEvent(...args),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => mocks.getNeonDb(),
}));
vi.mock('@/lib/services/usage-limit-promotion-service', async (importOriginal) => ({
  ...(await importOriginal<PromotionModule>()),
  listUsageLimitPromotions: (...args: unknown[]) => mocks.listUsageLimitPromotions(...args),
  upsertUsageLimitPromotion: (...args: unknown[]) => mocks.upsertUsageLimitPromotion(...args),
}));

import { createError } from '@/lib/errors';
import { GET, PUT } from '../route';

const UPLIFT = {
  id: 'code-week',
  kind: 'limit_uplift',
  enabled: true,
  startsAt: '2026-10-22T00:00:00Z',
  endsAt: '2026-10-31T00:00:00Z',
  plans: ['pro', 'max'],
  costCeilingCredits: 200_000,
  upliftPercent: 50,
  upliftWindows: ['weekly'],
  upliftWorkloads: ['code'],
};

const STORED = {
  ...UPLIFT,
  description: '',
  startsAt: '2026-10-22T00:00:00.000Z',
  endsAt: '2026-10-31T00:00:00.000Z',
  costCeilingMicrousd: 1_000_000_000,
  committedMicrousd: 5_000_000,
  version: 2,
  updatedAt: '2026-10-22T00:00:00.000Z',
};

function request(method: string, body?: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/admin/usage-promotions', {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePlatformAdmin.mockResolvedValue({ userId: 'operator-1' });
  mocks.listUsageLimitPromotions.mockResolvedValue([STORED]);
  mocks.upsertUsageLimitPromotion.mockResolvedValue(STORED);
});

describe('admin usage promotions', () => {
  it('lists promotions in credits for platform admins only', async () => {
    const response = await GET(request('GET'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.promotions[0]).toMatchObject({
      costCeilingCredits: 200_000,
      committedCredits: 1_000,
    });
    expect(body.promotions[0]).not.toHaveProperty('costCeilingMicrousd');
    expect(body.plans).not.toContain('free');

    mocks.requirePlatformAdmin.mockRejectedValueOnce(createError.forbidden());
    expect((await GET(request('GET'))).status).toBe(403);
  });

  it('saves a promotion at the version it was loaded at and records the change', async () => {
    const response = await PUT(request('PUT', { expectedVersion: 1, promotion: UPLIFT }));
    expect(response.status).toBe(200);
    expect(mocks.upsertUsageLimitPromotion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'code-week', upliftPercent: 50 }),
      1,
      'operator-1',
    );
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'usage_promotion_changed',
        detail: expect.objectContaining({ resourceId: 'code-week', status: 'updated' }),
      }),
    );
  });

  it('reports a stale version as a conflict and records nothing', async () => {
    mocks.upsertUsageLimitPromotion.mockResolvedValueOnce(null);
    const response = await PUT(request('PUT', { expectedVersion: 1, promotion: UPLIFT }));
    expect(response.status).toBe(409);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('refuses a promotion with no amounts or a plan without limits', async () => {
    const { upliftPercent: _dropped, ...noPercent } = UPLIFT;
    expect(
      (await PUT(request('PUT', { expectedVersion: null, promotion: noPercent }))).status,
    ).toBe(400);
    expect(
      (
        await PUT(
          request('PUT', { expectedVersion: null, promotion: { ...UPLIFT, plans: ['free'] } }),
        )
      ).status,
    ).toBe(400);
    expect(mocks.upsertUsageLimitPromotion).not.toHaveBeenCalled();
  });

  it('refuses a caller who is not a platform admin before reading the body', async () => {
    mocks.requirePlatformAdmin.mockRejectedValueOnce(createError.forbidden());
    expect((await PUT(request('PUT', { expectedVersion: 1, promotion: UPLIFT }))).status).toBe(403);
    expect(mocks.upsertUsageLimitPromotion).not.toHaveBeenCalled();
  });
});
