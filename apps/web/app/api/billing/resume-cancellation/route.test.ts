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
  currentPlanOf: vi.fn(),
  keepCurrentPlan: vi.fn(),
  readPlanChangeState: vi.fn(),
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
}));
vi.mock('@/lib/server/stripe-plan-change', async (importOriginal) => ({
  ...(await importOriginal<ScanModule6>()),
  currentPlanOf: mocks.currentPlanOf,
  keepCurrentPlan: mocks.keepCurrentPlan,
  readPlanChangeState: mocks.readPlanChangeState,
}));

import { POST } from './route';
import { createError } from '@/lib/errors';

const USER_ID = 'user_resume';
const STRIPE = { id: 'stripe-client' };
const MANAGED = { subscriptionId: 'sub_live123', customerId: 'cus_123' };
const KEPT_MANAGED = { subscriptionId: 'sub_live123', customerId: 'cus_123', kept: true };
const STATE = { plan: 'pro', cancelAt: null, scheduledChange: null };

const db = { query: vi.fn(), execute: vi.fn() };

function post(idempotencyKey: string | null = 'resume-key-1') {
  return new NextRequest('https://agiworkforce.com/api/billing/resume-cancellation', {
    method: 'POST',
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUserScopedDb.mockResolvedValue({ db, userId: USER_ID, organizationId: null });
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.recordAuditEvent.mockResolvedValue(undefined);
  mocks.getStripeClientOrNull.mockReturnValue(STRIPE);
  mocks.requireManagedStripeSubscription.mockResolvedValue(MANAGED);
  mocks.currentPlanOf.mockReturnValue('pro');
  mocks.keepCurrentPlan.mockResolvedValue({
    managed: KEPT_MANAGED,
    cancelAtPeriodEnd: false,
    canceledAt: null,
  });
  mocks.readPlanChangeState.mockResolvedValue(STATE);
  db.execute.mockResolvedValue(1);
});

describe('POST /api/billing/resume-cancellation', () => {
  it('keeps the plan in Stripe, clears the stored cancellation and audits the resume', async () => {
    const response = await POST(post());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(STATE);
    expect(mocks.keepCurrentPlan).toHaveBeenCalledWith(
      STRIPE,
      MANAGED,
      `keep-plan:${USER_ID}:resume-key-1`,
    );
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining('update public.subscriptions'),
      [USER_ID, false, null, 'sub_live123'],
    );
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        eventType: 'plan_changed',
        detail: expect.objectContaining({ planTier: 'pro', status: 'resumed' }),
      }),
    );
    expect(mocks.readPlanChangeState).toHaveBeenCalledWith(STRIPE, KEPT_MANAGED);
  });

  it('refuses a caller with no session', async () => {
    mocks.getUserScopedDb.mockRejectedValueOnce(createError.unauthorized());

    const response = await POST(post());

    expect(response.status).toBe(401);
    expect(mocks.keepCurrentPlan).not.toHaveBeenCalled();
  });

  it('refuses a write that fails the CSRF check', async () => {
    mocks.requireCsrfToken.mockResolvedValueOnce(
      NextResponse.json({ error: { code: 'CSRF_REQUIRED' } }, { status: 403 }),
    );

    const response = await POST(post());

    expect(response.status).toBe(403);
    expect(mocks.keepCurrentPlan).not.toHaveBeenCalled();
  });

  it('requires an idempotency key so a retry cannot resume twice', async () => {
    const response = await POST(post(null));

    expect(response.status).toBe(400);
    expect(mocks.keepCurrentPlan).not.toHaveBeenCalled();
  });

  it('says billing is unavailable when Stripe is not configured', async () => {
    mocks.getStripeClientOrNull.mockReturnValueOnce(null);

    const response = await POST(post());

    expect(response.status).toBe(503);
    expect(mocks.keepCurrentPlan).not.toHaveBeenCalled();
  });

  it('relays the refusal for an account with no plan to resume', async () => {
    mocks.requireManagedStripeSubscription.mockRejectedValueOnce(
      createError.conflict('This account has no active paid plan to change.'),
    );

    const response = await POST(post());

    expect(response.status).toBe(409);
    expect(mocks.keepCurrentPlan).not.toHaveBeenCalled();
  });

  it('says nothing changed when Stripe refuses to keep the plan', async () => {
    mocks.keepCurrentPlan.mockRejectedValueOnce(new Error('stripe 500'));

    const response = await POST(post());

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { message: 'Your plan could not be resumed. Nothing was changed; please try again.' },
    });
    expect(db.execute).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('still reports the resume when the stored flag waits for the webhook', async () => {
    db.execute.mockRejectedValueOnce(new Error('rls denied'));

    const response = await POST(post());

    expect(response.status).toBe(200);
    expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1);
  });

  it('says the plan was resumed when only the state read fails', async () => {
    mocks.readPlanChangeState.mockRejectedValueOnce(new Error('stripe timeout'));

    const response = await POST(post());

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: {
        message: 'Your plan was resumed, but its details could not be loaded. Refresh to see them.',
      },
    });
    expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1);
  });
});
