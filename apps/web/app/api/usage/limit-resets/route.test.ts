import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
type RlsModule = typeof import('@/lib/server/rls-db');
type CsrfModule = typeof import('@/lib/csrf');
type RateLimitModule = typeof import('@/lib/rate-limit');
type AuditModule = typeof import('@/lib/security-audit');
type NeonModule = typeof import('@/lib/server/neon-db');
type PromotionModule = typeof import('@/lib/services/usage-limit-promotion-service');

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  recordAuditEvent: vi.fn(),
  getNeonDb: vi.fn(),
  applyUsageLimitReset: vi.fn(),
  readAccountLimitCaps: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsModule>()),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  requireCsrfToken: mocks.requireCsrfToken,
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<AuditModule>()),
  recordAuditEvent: mocks.recordAuditEvent,
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<NeonModule>()),
  getNeonDb: mocks.getNeonDb,
}));
vi.mock('@/lib/services/usage-limit-promotion-service', async (importOriginal) => ({
  ...(await importOriginal<PromotionModule>()),
  applyUsageLimitReset: mocks.applyUsageLimitReset,
  readAccountLimitCaps: mocks.readAccountLimitCaps,
}));

import { POST } from './route';

const USER_ID = 'user_reset';
const SCOPED = { query: vi.fn(), execute: vi.fn() };
const SERVICE = { query: vi.fn(), execute: vi.fn() };
const CAPS = { session: 1_000_000, weekly: 10_000_000, flagshipWeekly: 3_000_000 };
const GRANT = '6f1c2a54-1b8a-4c3e-9d0f-2a7b8c9d0e1f';

function request(body: unknown, key: string | null = 'agi.usage.reset.0001') {
  return new NextRequest('https://agiworkforce.com/api/usage/limit-resets', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(key === null ? {} : { 'idempotency-key': key }),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUserScopedDb.mockResolvedValue({ db: SCOPED, userId: USER_ID, organizationId: null });
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.getNeonDb.mockReturnValue(SERVICE);
  mocks.readAccountLimitCaps.mockResolvedValue({ planTier: 'pro', caps: CAPS });
  mocks.applyUsageLimitReset.mockResolvedValue({
    status: 'applied',
    grantId: GRANT,
    promotionId: 'spring-reset',
    appliedAt: '2026-10-22T12:00:00.000Z',
    refreshedCredits: 1_980,
  });
});

describe('POST /api/usage/limit-resets', () => {
  it("applies the caller's reset for the caller's own plan and records it", async () => {
    const response = await POST(request({ grantId: GRANT }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'applied',
      grant_id: GRANT,
      applied_at: '2026-10-22T12:00:00.000Z',
    });
    expect(mocks.readAccountLimitCaps).toHaveBeenCalledWith(SCOPED, USER_ID);
    expect(mocks.applyUsageLimitReset).toHaveBeenCalledWith(SERVICE, {
      userId: USER_ID,
      planTier: 'pro',
      applyKey: 'agi.usage.reset.0001',
      grantId: GRANT,
      caps: CAPS,
    });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        eventType: 'usage_limit_reset_applied',
        detail: expect.objectContaining({ resourceId: GRANT, source: 'spring-reset' }),
      }),
    );
  });

  it('answers a retry with the same reset and records nothing new', async () => {
    mocks.applyUsageLimitReset.mockResolvedValueOnce({
      status: 'already_applied',
      grantId: GRANT,
      promotionId: 'spring-reset',
      appliedAt: '2026-10-22T12:00:00.000Z',
      refreshedCredits: 1_980,
    });

    const response = await POST(request({ grantId: GRANT }));

    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe('already_applied');
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('refuses without an idempotency key, before touching any reset', async () => {
    const response = await POST(request({ grantId: GRANT }, null));

    expect(response.status).toBe(400);
    expect(mocks.applyUsageLimitReset).not.toHaveBeenCalled();
  });

  it('says why a reset was refused', async () => {
    mocks.applyUsageLimitReset.mockResolvedValueOnce({
      status: 'refused',
      reason: 'not_near_limit',
    });

    const response = await POST(request({ grantId: null }));

    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).toContain(
      'A reset can be used once you are close to a limit.',
    );
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('stops at a failed CSRF check', async () => {
    mocks.requireCsrfToken.mockResolvedValueOnce(
      NextResponse.json({ error: 'csrf' }, { status: 403 }),
    );

    const response = await POST(request({ grantId: GRANT }));

    expect(response.status).toBe(403);
    expect(mocks.applyUsageLimitReset).not.toHaveBeenCalled();
  });
});
