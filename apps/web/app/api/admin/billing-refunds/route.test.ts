import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
type ScanModule0 = typeof import('@/lib/csrf');
type ScanModule1 = typeof import('@/lib/rate-limit');
type ScanModule2 = typeof import('@/lib/auth-guards');
type ScanModule3 = typeof import('@/lib/security-audit');
type ScanModule4 = typeof import('@/lib/server/neon-db');
type ScanModule5 = typeof import('@/lib/server/payments/stripe-provider');
type ScanModule6 = typeof import('@/lib/services/billing-refund-service');

const mocks = vi.hoisted(() => ({
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  requirePlatformAdmin: vi.fn(),
  logSecurityEvent: vi.fn(),
  getNeonDb: vi.fn(),
  isStripeConfigured: vi.fn(),
  declineRefundRequest: vi.fn(),
  issueOperatorRefund: vi.fn(),
  listPendingRefundRequests: vi.fn(),
  lookupAccountBilling: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  requireCsrfToken: mocks.requireCsrfToken,
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@/lib/auth-guards', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  requirePlatformAdmin: mocks.requirePlatformAdmin,
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  logSecurityEvent: mocks.logSecurityEvent,
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  getNeonDb: mocks.getNeonDb,
}));
vi.mock('@/lib/server/payments/stripe-provider', async (importOriginal) => ({
  ...(await importOriginal<ScanModule5>()),
  isStripeConfigured: mocks.isStripeConfigured,
}));
vi.mock('@/lib/services/billing-refund-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule6>()),
  declineRefundRequest: mocks.declineRefundRequest,
  issueOperatorRefund: mocks.issueOperatorRefund,
  listPendingRefundRequests: mocks.listPendingRefundRequests,
  lookupAccountBilling: mocks.lookupAccountBilling,
}));

import { GET, POST } from './route';
import { createError } from '@/lib/errors';
import { RefundRequestRefusal } from '@/lib/services/billing-refund-service';

const OPERATOR_ID = 'operator_1';
const DB = { query: vi.fn(), execute: vi.fn() };
const REQUEST_ID = '5d1f7a52-3a4c-4f4e-9c61-2f7d8f0c1a11';
const CHARGE_ID = 'ch_3PabcdefGHIJ';
const PENDING = [{ id: REQUEST_ID, userId: 'user_1', chargeId: CHARGE_ID, status: 'pending' }];
const DECLINED = { id: REQUEST_ID, userId: 'user_1', chargeId: CHARGE_ID, status: 'declined' };
const REFUNDED = {
  refundId: 're_1',
  refundStatus: 'succeeded',
  amountCents: 2_000,
  currency: 'usd',
  userId: 'user_1',
  planEnded: false,
  request: null,
};

function get(query?: string) {
  const url = new URL('https://agiworkforce.com/api/admin/billing-refunds');
  if (query !== undefined) url.searchParams.set('q', query);
  return new NextRequest(url);
}

function post(body: unknown, idempotencyKey: string | null = 'operator-refund-1') {
  return new NextRequest('https://agiworkforce.com/api/admin/billing-refunds', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
}

const refund = {
  action: 'refund',
  chargeId: CHARGE_ID,
  amountCents: null,
  note: 'Charged twice on the same day',
  stripeReason: 'duplicate',
  requestId: null,
  endPlan: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.requirePlatformAdmin.mockResolvedValue({ userId: OPERATOR_ID });
  mocks.logSecurityEvent.mockResolvedValue(undefined);
  mocks.getNeonDb.mockReturnValue(DB);
  mocks.isStripeConfigured.mockReturnValue(true);
  mocks.listPendingRefundRequests.mockResolvedValue(PENDING);
  mocks.lookupAccountBilling.mockResolvedValue({ userId: 'user_1', charges: [] });
  mocks.declineRefundRequest.mockResolvedValue(DECLINED);
  mocks.issueOperatorRefund.mockResolvedValue(REFUNDED);
});

describe('GET /api/admin/billing-refunds', () => {
  it('lists the pending refund requests for a platform operator, never cached', async () => {
    const response = await GET(get());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ pending: PENDING });
    expect(mocks.listPendingRefundRequests).toHaveBeenCalledWith(DB);
  });

  it('hides the console from anyone who is not a platform operator', async () => {
    mocks.requirePlatformAdmin.mockRejectedValueOnce(createError.notFound('Not found.'));

    const response = await GET(get());

    expect(response.status).toBe(404);
    expect(mocks.listPendingRefundRequests).not.toHaveBeenCalled();
  });

  it('looks an account up by the operator query', async () => {
    const response = await GET(get('user@example.com'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ account: { userId: 'user_1', charges: [] } });
    expect(mocks.lookupAccountBilling).toHaveBeenCalledWith(DB, 'user@example.com');
  });

  it('answers 404 when no account matches the lookup', async () => {
    mocks.lookupAccountBilling.mockResolvedValueOnce(null);

    const response = await GET(get('nobody@example.com'));

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { message: 'No account matches that lookup.' },
    });
  });

  it('rejects a lookup over 320 characters', async () => {
    const response = await GET(get('x'.repeat(321)));

    expect(response.status).toBe(400);
    expect(mocks.lookupAccountBilling).not.toHaveBeenCalled();
  });

  it('refuses a lookup when Stripe is not configured', async () => {
    mocks.isStripeConfigured.mockReturnValueOnce(false);

    const response = await GET(get('user@example.com'));

    expect(response.status).toBe(503);
    expect(mocks.lookupAccountBilling).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/billing-refunds', () => {
  it('issues a refund under the operator idempotency key and records who did it and why', async () => {
    const response = await POST(post(refund));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(REFUNDED);
    expect(mocks.issueOperatorRefund).toHaveBeenCalledWith(DB, {
      operatorUserId: OPERATOR_ID,
      chargeId: CHARGE_ID,
      amountCents: null,
      note: 'Charged twice on the same day',
      stripeReason: 'duplicate',
      requestId: null,
      endPlan: false,
      idempotencyKey: 'operator-refund-1',
    });
    expect(mocks.logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: OPERATOR_ID,
        eventType: 'admin_action',
        severity: 'high',
        endpoint: '/api/admin/billing-refunds',
        details: expect.objectContaining({
          action: 'charge_refunded',
          refundId: 're_1',
          targetUserId: 'user_1',
          reason: 'Charged twice on the same day',
        }),
      }),
    );
  });

  it('declines a pending request with the operator note', async () => {
    const response = await POST(
      post({ action: 'decline', requestId: REQUEST_ID, note: 'Outside the refund window' }, null),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ request: DECLINED });
    expect(mocks.declineRefundRequest).toHaveBeenCalledWith(DB, {
      operatorUserId: OPERATOR_ID,
      requestId: REQUEST_ID,
      note: 'Outside the refund window',
    });
    expect(mocks.logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ action: 'refund_request_declined' }),
      }),
    );
  });

  it('refuses a write that fails the CSRF check before resolving the operator', async () => {
    mocks.requireCsrfToken.mockResolvedValueOnce(
      NextResponse.json({ error: { code: 'CSRF_REQUIRED' } }, { status: 403 }),
    );

    const response = await POST(post(refund));

    expect(response.status).toBe(403);
    expect(mocks.requirePlatformAdmin).not.toHaveBeenCalled();
    expect(mocks.issueOperatorRefund).not.toHaveBeenCalled();
  });

  it('hides the action from anyone who is not a platform operator', async () => {
    mocks.requirePlatformAdmin.mockRejectedValueOnce(createError.notFound('Not found.'));

    const response = await POST(post(refund));

    expect(response.status).toBe(404);
    expect(mocks.issueOperatorRefund).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown action', { action: 'void', requestId: REQUEST_ID, note: 'x' }],
    ['a charge id that is not a payment', { ...refund, chargeId: 'in_123456789' }],
    ['a refund with no note', { ...refund, note: '   ' }],
    ['a zero amount', { ...refund, amountCents: 0 }],
    ['a Stripe reason outside the list', { ...refund, stripeReason: 'goodwill' }],
    ['a decline without a request id', { action: 'decline', note: 'x' }],
  ])('rejects %s', async (_label, body) => {
    const response = await POST(post(body));

    expect(response.status).toBe(400);
    expect(mocks.issueOperatorRefund).not.toHaveBeenCalled();
    expect(mocks.declineRefundRequest).not.toHaveBeenCalled();
  });

  it('requires an idempotency key before it moves money', async () => {
    const response = await POST(post(refund, null));

    expect(response.status).toBe(400);
    expect(mocks.issueOperatorRefund).not.toHaveBeenCalled();
  });

  it('refuses a refund when Stripe is not configured', async () => {
    mocks.isStripeConfigured.mockReturnValueOnce(false);

    const response = await POST(post(refund));

    expect(response.status).toBe(503);
    expect(mocks.issueOperatorRefund).not.toHaveBeenCalled();
  });

  it('maps a refusal from the refund rules to its status and audits nothing', async () => {
    mocks.issueOperatorRefund.mockRejectedValueOnce(
      new RefundRequestRefusal('That payment is disputed with the bank.', 409),
    );

    const response = await POST(post(refund));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { message: 'That payment is disputed with the bank.' },
    });
    expect(mocks.logSecurityEvent).not.toHaveBeenCalled();
  });

  it('maps an unknown request on decline to 404', async () => {
    mocks.declineRefundRequest.mockRejectedValueOnce(
      new RefundRequestRefusal('No pending request has that id.', 404),
    );

    const response = await POST(post({ action: 'decline', requestId: REQUEST_ID, note: 'x' }));

    expect(response.status).toBe(404);
  });
});
