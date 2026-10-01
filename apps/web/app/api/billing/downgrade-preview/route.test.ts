import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
type ScanModule0 = typeof import('@/lib/server/rls-db');
type ScanModule1 = typeof import('@/lib/csrf');
type ScanModule2 = typeof import('@/lib/rate-limit');
type ScanModule3 = typeof import('@/lib/security-audit');
type ScanModule4 = typeof import('@/lib/server/stripe-client');
type ScanModule5 = typeof import('@/lib/server/stripe-upgrade-subscription');
type ScanModule6 = typeof import('@/lib/server/stripe-plan-change');

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  recordAuditEvent: vi.fn(),
  getStripeClientOrNull: vi.fn(),
  requireManagedStripeSubscription: vi.fn(),
  refreshManagedStripeSubscription: vi.fn(),
  currentPlanOf: vi.fn(),
  readPlanChangeState: vi.fn(),
  scheduleDowngrade: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  requireCsrfToken: mocks.requireCsrfToken,
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  recordAuditEvent: mocks.recordAuditEvent,
}));
vi.mock('@/lib/server/stripe-client', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  getStripeClientOrNull: mocks.getStripeClientOrNull,
}));
vi.mock('@/lib/server/stripe-upgrade-subscription', async (importOriginal) => ({
  ...(await importOriginal<ScanModule5>()),
  requireManagedStripeSubscription: mocks.requireManagedStripeSubscription,
  refreshManagedStripeSubscription: mocks.refreshManagedStripeSubscription,
}));
vi.mock('@/lib/server/stripe-plan-change', async (importOriginal) => ({
  ...(await importOriginal<ScanModule6>()),
  currentPlanOf: mocks.currentPlanOf,
  readPlanChangeState: mocks.readPlanChangeState,
  scheduleDowngrade: mocks.scheduleDowngrade,
}));

import { GET, POST } from './route';
import { createError } from '@/lib/errors';

const USER_ID = 'user_downgrade';
const DB = { query: vi.fn(), execute: vi.fn() };
const STRIPE = { id: 'stripe-client' };
const MANAGED = { subscriptionId: 'sub_live123', customerId: 'cus_123' };
const REFRESHED = { subscriptionId: 'sub_live123', customerId: 'cus_123', refreshed: true };
const STATE = { plan: 'pro', options: ['basic'], scheduledChange: null };
const SCHEDULED = {
  plan: 'pro',
  options: ['basic'],
  scheduledChange: { plan: 'basic', effectiveAt: '2026-10-27T00:00:00.000Z' },
};

function get() {
  return new NextRequest('https://agiworkforce.com/api/billing/downgrade-preview');
}

function post(body: unknown, idempotencyKey: string | null = 'downgrade-key-1') {
  return new NextRequest('https://agiworkforce.com/api/billing/downgrade-preview', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUserScopedDb.mockResolvedValue({ db: DB, userId: USER_ID, organizationId: null });
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.recordAuditEvent.mockResolvedValue(undefined);
  mocks.getStripeClientOrNull.mockReturnValue(STRIPE);
  mocks.requireManagedStripeSubscription.mockResolvedValue(MANAGED);
  mocks.refreshManagedStripeSubscription.mockResolvedValue(REFRESHED);
  mocks.currentPlanOf.mockReturnValue('pro');
  mocks.readPlanChangeState.mockImplementation(async (_stripe, managed) =>
    managed === REFRESHED ? SCHEDULED : STATE,
  );
  mocks.scheduleDowngrade.mockResolvedValue(undefined);
});

describe('GET /api/billing/downgrade-preview', () => {
  it('states the plans the caller can move to from the managed subscription', async () => {
    const response = await GET(get());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(STATE);
    expect(mocks.requireManagedStripeSubscription).toHaveBeenCalledWith(STRIPE, DB, USER_ID);
    expect(mocks.readPlanChangeState).toHaveBeenCalledWith(STRIPE, MANAGED);
  });

  it('refuses a caller with no session', async () => {
    mocks.getUserScopedDb.mockRejectedValueOnce(createError.unauthorized());

    const response = await GET(get());

    expect(response.status).toBe(401);
    expect(mocks.requireManagedStripeSubscription).not.toHaveBeenCalled();
  });

  it('says billing is unavailable when Stripe is not configured', async () => {
    mocks.getStripeClientOrNull.mockReturnValueOnce(null);

    const response = await GET(get());

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { message: 'Billing is unavailable right now. Nothing was changed.' },
    });
  });

  it('relays the refusal for an account with no plan billed by AGI Workforce', async () => {
    mocks.requireManagedStripeSubscription.mockRejectedValueOnce(
      createError.conflict('This account has no active paid plan to change.'),
    );

    const response = await GET(get());

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { message: 'This account has no active paid plan to change.' },
    });
  });

  it('maps a Stripe read failure to a retryable 503', async () => {
    mocks.readPlanChangeState.mockRejectedValueOnce(new Error('stripe timeout'));

    const response = await GET(get());

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { message: 'Your plan options could not be loaded. Please try again.' },
    });
  });
});

describe('POST /api/billing/downgrade-preview', () => {
  it('schedules the switch under a caller-bound idempotency key, audits it and returns the new state', async () => {
    const response = await POST(post({ plan: 'basic' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(SCHEDULED);
    expect(mocks.scheduleDowngrade).toHaveBeenCalledWith(
      STRIPE,
      MANAGED,
      'basic',
      `downgrade:${USER_ID}:basic:downgrade-key-1`,
    );
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        eventType: 'plan_changed',
        detail: expect.objectContaining({
          resourceId: 'sub_live123',
          previousPlanTier: 'pro',
          planTier: 'basic',
          status: 'scheduled',
        }),
      }),
    );
    expect(mocks.readPlanChangeState).toHaveBeenLastCalledWith(STRIPE, REFRESHED);
  });

  it.each([
    ['a plan off the individual ladder', { plan: 'team' }],
    ['the free plan', { plan: 'free' }],
    ['no plan', {}],
    ['an unexpected field', { plan: 'basic', effectiveAt: 'now' }],
  ])('rejects %s before touching Stripe', async (_label, body) => {
    const response = await POST(post(body));

    expect(response.status).toBe(400);
    expect(mocks.requireManagedStripeSubscription).not.toHaveBeenCalled();
    expect(mocks.scheduleDowngrade).not.toHaveBeenCalled();
  });

  it('requires an idempotency key so a retry cannot schedule twice', async () => {
    const response = await POST(post({ plan: 'basic' }, null));

    expect(response.status).toBe(400);
    expect(mocks.scheduleDowngrade).not.toHaveBeenCalled();
  });

  it('refuses a write that fails the CSRF check', async () => {
    mocks.requireCsrfToken.mockResolvedValueOnce(
      NextResponse.json({ error: { code: 'CSRF_REQUIRED' } }, { status: 403 }),
    );

    const response = await POST(post({ plan: 'basic' }));

    expect(response.status).toBe(403);
    expect(mocks.scheduleDowngrade).not.toHaveBeenCalled();
  });

  it('relays a refusal the plan change raises itself', async () => {
    mocks.scheduleDowngrade.mockRejectedValueOnce(
      createError.conflict('Your plan is already switching to Basic.'),
    );

    const response = await POST(post({ plan: 'basic' }));

    expect(response.status).toBe(409);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('says nothing changed when Stripe fails to schedule the switch', async () => {
    mocks.scheduleDowngrade.mockRejectedValueOnce(new Error('stripe 500'));

    const response = await POST(post({ plan: 'basic' }));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: {
        message: 'The plan change could not be scheduled. Nothing was changed; please try again.',
      },
    });
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('keeps the audit and says the switch is scheduled when only the refresh fails', async () => {
    mocks.refreshManagedStripeSubscription.mockRejectedValueOnce(new Error('stripe timeout'));

    const response = await POST(post({ plan: 'basic' }));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: {
        message:
          'Your plan change is scheduled, but its details could not be loaded. Refresh to see them.',
      },
    });
    expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1);
  });
});
