import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { RefundRequestView, RefundableChargeView } from '@/lib/billing/refund-requests';
type ScanModule0 = typeof import('@/lib/server/rls-db');
type ScanModule1 = typeof import('@/lib/csrf');
type ScanModule2 = typeof import('@/lib/rate-limit');
type ScanModule3 = typeof import('@/lib/security-audit');
type ScanModule4 = typeof import('@/lib/server/billing-owner-row');
type ScanModule5 = typeof import('@/lib/server/payments/stripe-provider');
type ScanModule6 = typeof import('@/lib/services/billing-refund-service');

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  recordAuditEvent: vi.fn(),
  readBillingOwnerRow: vi.fn(),
  resolveBillingCustomerId: vi.fn(),
  isStripeConfigured: vi.fn(),
  fileRefundRequest: vi.fn(),
  listRefundRequests: vi.fn(),
  listRefundableCharges: vi.fn(),
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
vi.mock('@/lib/server/billing-owner-row', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  readBillingOwnerRow: mocks.readBillingOwnerRow,
  resolveBillingCustomerId: mocks.resolveBillingCustomerId,
}));
vi.mock('@/lib/server/payments/stripe-provider', async (importOriginal) => ({
  ...(await importOriginal<ScanModule5>()),
  isStripeConfigured: mocks.isStripeConfigured,
}));
vi.mock('@/lib/services/billing-refund-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule6>()),
  fileRefundRequest: mocks.fileRefundRequest,
  listRefundRequests: mocks.listRefundRequests,
  listRefundableCharges: mocks.listRefundableCharges,
}));

import { GET, POST } from './route';
import { MfaRequiredError } from '@/lib/mfa-policy-gate';
import { RefundRequestRefusal } from '@/lib/services/billing-refund-service';

const USER_ID = 'user_refund_request';
const DB = { query: vi.fn(), execute: vi.fn() };
const ROW = {
  plan_tier: 'pro',
  status: 'active',
  stripe_customer_id: 'cus_123',
  stripe_subscription_id: 'sub_123',
};
const CHARGE_ID = 'ch_3PabcdefGHIJ';

const REQUEST_VIEW: RefundRequestView = {
  id: 'rr_1',
  chargeId: CHARGE_ID,
  chargeKind: 'top_up',
  chargeAmountCents: 2_000,
  chargeCurrency: 'usd',
  chargeCreatedAt: '2026-09-20T10:00:00.000Z',
  reason: 'accidental_purchase',
  details: null,
  assessment: 'unused_within_policy',
  assessedRefundCents: 2_000,
  status: 'pending',
  refundAmountCents: null,
  decisionNote: null,
  decidedAt: null,
  createdAt: '2026-09-21T10:00:00.000Z',
};

const CHARGE_VIEW: RefundableChargeView = {
  id: CHARGE_ID,
  kind: 'top_up',
  amountCents: 2_000,
  refundedCents: 0,
  refundableCents: 2_000,
  currency: 'usd',
  createdAt: '2026-09-20T10:00:00.000Z',
  billingCountry: 'DE',
  disputed: false,
  withdrawalEligible: true,
  withdrawalRefundCents: 2_000,
  withdrawalProrated: false,
  receiptUrl: null,
};

function get() {
  return new NextRequest('https://agiworkforce.com/api/billing/refund-requests');
}

function post(body: unknown) {
  return new NextRequest('https://agiworkforce.com/api/billing/refund-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUserScopedDb.mockResolvedValue({ db: DB, userId: USER_ID, organizationId: null });
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.recordAuditEvent.mockResolvedValue(undefined);
  mocks.readBillingOwnerRow.mockResolvedValue(ROW);
  mocks.resolveBillingCustomerId.mockResolvedValue('cus_123');
  mocks.isStripeConfigured.mockReturnValue(true);
  mocks.listRefundRequests.mockResolvedValue([REQUEST_VIEW]);
  mocks.listRefundableCharges.mockResolvedValue([CHARGE_VIEW]);
  mocks.fileRefundRequest.mockResolvedValue({ request: REQUEST_VIEW, created: true });
});

describe('GET /api/billing/refund-requests', () => {
  it("lists the caller's requests and the payments they can still ask to refund", async () => {
    const response = await GET(get());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ requests: [REQUEST_VIEW], charges: [CHARGE_VIEW] });
    expect(mocks.listRefundRequests).toHaveBeenCalledWith(DB, USER_ID);
    expect(mocks.listRefundableCharges).toHaveBeenCalledWith(DB, USER_ID, 'cus_123');
  });

  it('lists requests without payments when billing is not configured', async () => {
    mocks.isStripeConfigured.mockReturnValueOnce(false);

    const response = await GET(get());

    expect(await response.json()).toEqual({ requests: [REQUEST_VIEW], charges: [] });
    expect(mocks.listRefundableCharges).not.toHaveBeenCalled();
  });

  it('refuses a caller with no session and relays an MFA denial', async () => {
    mocks.getUserScopedDb.mockRejectedValueOnce(new Error('no session'));
    expect((await GET(get())).status).toBe(401);

    mocks.getUserScopedDb.mockRejectedValueOnce(
      new MfaRequiredError('Your workspace requires two-factor authentication.'),
    );
    expect((await GET(get())).status).toBe(403);

    expect(mocks.listRefundRequests).not.toHaveBeenCalled();
  });

  it('says the payments could not be loaded when Stripe fails', async () => {
    mocks.listRefundableCharges.mockRejectedValueOnce(new Error('stripe 500'));

    const response = await GET(get());

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { message: 'Your payments could not be loaded. Please try again.' },
    });
  });
});

describe('POST /api/billing/refund-requests', () => {
  const valid = { chargeId: CHARGE_ID, reason: 'accidental_purchase', details: '  bought twice  ' };

  it('files the request against the caller customer, audits it and answers 201', async () => {
    const response = await POST(post(valid));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ request: REQUEST_VIEW });
    expect(mocks.fileRefundRequest).toHaveBeenCalledWith({
      db: DB,
      userId: USER_ID,
      customerId: 'cus_123',
      subscriptionId: 'sub_123',
      chargeId: CHARGE_ID,
      reason: 'accidental_purchase',
      details: 'bought twice',
    });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        eventType: 'refund_requested',
        detail: expect.objectContaining({
          resourceId: 'rr_1',
          reason: 'accidental_purchase',
          status: 'pending',
          variant: 'unused_within_policy',
        }),
      }),
    );
  });

  it('answers 200 with the existing request instead of filing it twice', async () => {
    mocks.fileRefundRequest.mockResolvedValueOnce({ request: REQUEST_VIEW, created: false });

    const response = await POST(post(valid));

    expect(response.status).toBe(200);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('rate limits refund requests per caller', async () => {
    mocks.withRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: { code: 'RATE_LIMITED' } }, { status: 429 }),
    );

    const response = await POST(post(valid));

    expect(response.status).toBe(429);
    expect(mocks.withRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'billing-refund-request',
      `user:${USER_ID}`,
    );
    expect(mocks.fileRefundRequest).not.toHaveBeenCalled();
  });

  it.each([
    ['a charge id that is not a Stripe payment', { chargeId: 'in_123456789', reason: 'other' }],
    ['a reason outside the list', { chargeId: CHARGE_ID, reason: 'changed_my_mind' }],
    [
      'details over 2,000 characters',
      { chargeId: CHARGE_ID, reason: 'other', details: 'x'.repeat(2_001) },
    ],
    ['an unexpected field', { chargeId: CHARGE_ID, reason: 'other', amountCents: 100 }],
  ])('rejects %s before reading billing', async (_label, body) => {
    const response = await POST(post(body));

    expect(response.status).toBe(400);
    expect(mocks.readBillingOwnerRow).not.toHaveBeenCalled();
    expect(mocks.fileRefundRequest).not.toHaveBeenCalled();
  });

  it('refuses a write that fails the CSRF check', async () => {
    mocks.requireCsrfToken.mockResolvedValueOnce(
      NextResponse.json({ error: { code: 'CSRF_REQUIRED' } }, { status: 403 }),
    );

    const response = await POST(post(valid));

    expect(response.status).toBe(403);
    expect(mocks.fileRefundRequest).not.toHaveBeenCalled();
  });

  it('says refunds are unavailable when billing is not configured', async () => {
    mocks.isStripeConfigured.mockReturnValueOnce(false);

    const response = await POST(post(valid));

    expect(response.status).toBe(503);
    expect(mocks.fileRefundRequest).not.toHaveBeenCalled();
  });

  it('answers 404 for an account with no payments to refund', async () => {
    mocks.resolveBillingCustomerId.mockResolvedValueOnce(null);

    const response = await POST(post(valid));

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { message: 'There are no payments on this account to refund.' },
    });
  });

  it.each([
    [404, 'That payment is not on your account.'],
    [409, 'That payment has already been refunded.'],
    [400, 'That payment is too old to refund here.'],
  ] as const)(
    'maps a %s refusal from the refund rules to the same status',
    async (status, message) => {
      mocks.fileRefundRequest.mockRejectedValueOnce(new RefundRequestRefusal(message, status));

      const response = await POST(post(valid));

      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ error: { message } });
      expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
    },
  );

  it('maps an unexpected failure to a generic 500', async () => {
    mocks.fileRefundRequest.mockRejectedValueOnce(new Error('stripe key revoked'));

    const response = await POST(post(valid));

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('stripe key revoked');
  });
});
