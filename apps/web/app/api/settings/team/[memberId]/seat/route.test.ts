import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  class SeatTypePaymentPendingError extends Error {
    readonly paymentUrl: string | null;
    constructor(pending: { paymentUrl: string | null }) {
      super('pending');
      this.paymentUrl = pending.paymentUrl;
    }
  }
  return {
    SeatTypePaymentPendingError,
    changeMemberSeatType: vi.fn(),
    requireTeamAdminAccess: vi.fn(),
    recordAuditEvent: vi.fn(async () => undefined),
    invalidateCache: vi.fn(async () => undefined),
    csrf: vi.fn<() => Promise<Response | null>>(async () => null),
  };
});

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/csrf')>()),
  requireCsrfToken: mocks.csrf,
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/logger')>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/security-audit')>()),
  recordAuditEvent: mocks.recordAuditEvent,
}));
vi.mock('@/lib/server/request-context-cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/request-context-cache')>()),
  invalidateActiveOrganizationCache: mocks.invalidateCache,
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/neon-db')>()),
  getNeonDb: vi.fn(() => ({ privileged: true })),
}));
vi.mock('@/lib/server/stripe-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/stripe-client')>()),
  getStripeClient: vi.fn(() => ({ stripe: true })),
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/rls-db')>()),
  getUserScopedDb: vi.fn(async () => ({ db: { scoped: true }, userId: 'admin-user' })),
}));
vi.mock('@/app/api/settings/team/team-admin-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/api/settings/team/team-admin-access')>()),
  requireTeamAdminAccess: mocks.requireTeamAdminAccess,
}));
vi.mock('@/lib/services/team-seat-type-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/team-seat-type-service')>()),
  SeatTypePaymentPendingError: mocks.SeatTypePaymentPendingError,
  changeMemberSeatType: mocks.changeMemberSeatType,
}));

import { AppError, type ErrorCodeValue } from '@/lib/errors';
import { PATCH } from './route';

const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = `${ORGANIZATION}:member-1`;

function patch(body: unknown, headers: Record<string, string> = {}) {
  return PATCH(
    new NextRequest(`https://agiworkforce.com/api/settings/team/${MEMBER_ID}/seat`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ memberId: MEMBER_ID }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.csrf.mockResolvedValue(null);
  mocks.requireTeamAdminAccess.mockResolvedValue({ plan: 'team', canManageTeam: true });
  mocks.changeMemberSeatType.mockResolvedValue({
    seatType: 'premium',
    previousSeatType: 'standard',
    billing: 'charged_now',
    premiumPaidThrough: null,
    seats: { standard: 2, premium: 1 },
  });
});

describe('PATCH /api/settings/team/[memberId]/seat', () => {
  it('changes the seat type on the caller connection and reports what was billed', async () => {
    const response = await patch({ seatType: 'premium' }, { 'Idempotency-Key': 'attempt-7' });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      seatType: 'premium',
      billing: 'charged_now',
      premiumPaidThrough: null,
      seats: { standard: 2, premium: 1 },
    });
    expect(mocks.changeMemberSeatType).toHaveBeenCalledWith(
      { scoped: true },
      { privileged: { privileged: true }, stripe: { stripe: true } },
      {
        organizationId: ORGANIZATION,
        administrator: { kind: 'member', userId: 'admin-user' },
        targetUserId: 'member-1',
        seatType: 'premium',
        idempotencyKey: 'attempt-7',
      },
    );
  });

  it('refuses a workspace without an active Team plan before any seat is touched', async () => {
    mocks.requireTeamAdminAccess.mockRejectedValue(
      new AppError('SUBSCRIPTION_REQUIRED' as ErrorCodeValue, 'Team required', 403),
    );

    const response = await patch({ seatType: 'premium' });

    expect(response.status).toBe(403);
    expect(mocks.changeMemberSeatType).not.toHaveBeenCalled();
  });

  it('passes on the refusal of a caller whose role cannot manage members', async () => {
    mocks.changeMemberSeatType.mockRejectedValue(
      new AppError('FORBIDDEN' as ErrorCodeValue, 'Your workspace role does not allow it', 403),
    );

    const response = await patch({ seatType: 'premium' });

    expect(response.status).toBe(403);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('stops at the CSRF check', async () => {
    mocks.csrf.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await patch({ seatType: 'premium' });

    expect(response.status).toBe(403);
    expect(mocks.requireTeamAdminAccess).not.toHaveBeenCalled();
    expect(mocks.changeMemberSeatType).not.toHaveBeenCalled();
  });

  it.each([
    { seatType: 'gold' },
    {},
    { seatType: 'premium', price: 0 },
    { seatType: 'team_premium' },
  ])('rejects the body %j', async (body) => {
    const response = await patch(body);

    expect(response.status).toBe(400);
    expect(mocks.changeMemberSeatType).not.toHaveBeenCalled();
  });

  it('answers an incomplete charge with 402 and says the member is still on Standard', async () => {
    mocks.changeMemberSeatType.mockRejectedValue(
      new mocks.SeatTypePaymentPendingError({ paymentUrl: 'https://invoice.stripe.test/in_1' }),
    );

    const response = await patch({ seatType: 'premium' });

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      paymentActionRequired: true,
      paymentUrl: 'https://invoice.stripe.test/in_1',
    });
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('records who changed which seat, from which type to which', async () => {
    await patch({ seatType: 'premium' });

    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-user',
        eventType: 'plan_changed',
        organizationId: ORGANIZATION,
        detail: expect.objectContaining({
          resourceType: 'organization_member',
          targetUserId: 'member-1',
          previousPlanTier: 'team',
          planTier: 'team_premium',
          source: 'seat_type',
          status: 'charged_now',
        }),
      }),
    );
    expect(mocks.invalidateCache).toHaveBeenCalledWith('member-1');
  });

  it('records nothing when the member already held that seat type', async () => {
    mocks.changeMemberSeatType.mockResolvedValue({
      seatType: 'premium',
      previousSeatType: 'premium',
      billing: 'none',
      premiumPaidThrough: null,
      seats: { standard: 2, premium: 1 },
    });

    const response = await patch({ seatType: 'premium' });

    expect(response.status).toBe(200);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });
});
