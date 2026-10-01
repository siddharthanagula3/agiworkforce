import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
type ScanModule0 = typeof import('@/lib/server/rls-db');
type ScanModule1 = typeof import('@/lib/rate-limit');
type ScanModule2 = typeof import('@/lib/server/stripe-client');
type ScanModule3 = typeof import('@/lib/server/billing-owner-row');
type ScanModule4 = typeof import('@/lib/server/payments/stripe-provider');

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  withRateLimit: vi.fn(),
  getStripeClientOrNull: vi.fn(),
  readBillingOwnerRow: vi.fn(),
  resolveBillingCustomerId: vi.fn(),
  readPaymentHistory: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@/lib/server/stripe-client', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  getStripeClientOrNull: mocks.getStripeClientOrNull,
}));
vi.mock('@/lib/server/billing-owner-row', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  readBillingOwnerRow: mocks.readBillingOwnerRow,
  resolveBillingCustomerId: mocks.resolveBillingCustomerId,
}));
vi.mock('@/lib/server/payments/stripe-provider', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  readPaymentHistory: mocks.readPaymentHistory,
}));

import { GET } from './route';
import { MfaRequiredError } from '@/lib/mfa-policy-gate';

const USER_ID = 'user_receipts';
const DB = { query: vi.fn(), execute: vi.fn() };
const STRIPE = { id: 'stripe-client' };
const ROW = { plan_tier: 'pro', status: 'active', stripe_customer_id: 'cus_123' };
const RECEIPT = {
  id: 'pi_topup_1',
  createdAt: '2026-09-20T10:00:00.000Z',
  credits: 1_000,
  amountCents: 2_000,
  refundedCents: 0,
  currency: 'usd',
  status: 'paid',
  autoReload: false,
  receiptUrl: 'https://pay.stripe.com/receipts/1',
};

function get() {
  return new NextRequest('https://agiworkforce.com/api/billing/receipts');
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUserScopedDb.mockResolvedValue({ db: DB, userId: USER_ID, organizationId: null });
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.getStripeClientOrNull.mockReturnValue(STRIPE);
  mocks.readBillingOwnerRow.mockResolvedValue(ROW);
  mocks.resolveBillingCustomerId.mockResolvedValue('cus_123');
  mocks.readPaymentHistory.mockResolvedValue({ receipts: [RECEIPT], refunds: [] });
});

describe('GET /api/billing/receipts', () => {
  it("lists the caller's credit purchase receipts from their own Stripe customer", async () => {
    const response = await GET(get());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ receipts: [RECEIPT] });
    expect(mocks.getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      resolveOrganization: false,
    });
    expect(mocks.resolveBillingCustomerId).toHaveBeenCalledWith(DB, USER_ID, ROW);
    expect(mocks.readPaymentHistory).toHaveBeenCalledWith(STRIPE, 'cus_123');
  });

  it('refuses a caller with no session', async () => {
    mocks.getUserScopedDb.mockRejectedValueOnce(new Error('no session'));

    const response = await GET(get());

    expect(response.status).toBe(401);
    expect(mocks.readPaymentHistory).not.toHaveBeenCalled();
  });

  it('answers a workspace MFA refusal as the denial it is', async () => {
    mocks.getUserScopedDb.mockRejectedValueOnce(
      new MfaRequiredError('Your workspace requires two-factor authentication.'),
    );

    const response = await GET(get());

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'MFA_REQUIRED' } });
  });

  it('answers with the rate limiter before reading anything', async () => {
    mocks.withRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: { code: 'RATE_LIMITED' } }, { status: 429 }),
    );

    const response = await GET(get());

    expect(response.status).toBe(429);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('returns no receipts when billing is not configured', async () => {
    mocks.getStripeClientOrNull.mockReturnValueOnce(null);

    const response = await GET(get());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ receipts: [] });
    expect(mocks.readPaymentHistory).not.toHaveBeenCalled();
  });

  it('returns no receipts for an account that has never paid through Stripe', async () => {
    mocks.resolveBillingCustomerId.mockResolvedValueOnce(null);

    const response = await GET(get());

    expect(await response.json()).toEqual({ receipts: [] });
    expect(mocks.readPaymentHistory).not.toHaveBeenCalled();
  });

  it('says the receipts could not be loaded when Stripe fails', async () => {
    mocks.readPaymentHistory.mockRejectedValueOnce(new Error('stripe 500'));

    const response = await GET(get());

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { message: 'Your credit purchase receipts could not be loaded. Please try again.' },
    });
  });
});
