import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  csrf: vi.fn(async (_request: unknown): Promise<Response | null> => null),
  requirePlatformAdmin: vi.fn(),
  logSecurityEvent: vi.fn(async (_event: unknown) => undefined),
  isStripeConfigured: vi.fn(() => true),
  listPendingRefundRequests: vi.fn(),
  lookupAccountBilling: vi.fn(),
  declineRefundRequest: vi.fn(),
  issueOperatorRefund: vi.fn(),
  db: { query: vi.fn(), execute: vi.fn() },
}));

vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/logger')>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/csrf')>()),
  requireCsrfToken: mocks.csrf,
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/security-audit')>()),
  logSecurityEvent: mocks.logSecurityEvent,
}));
vi.mock('@/lib/auth-guards', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth-guards')>()),
  requirePlatformAdmin: mocks.requirePlatformAdmin,
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/neon-db')>()),
  getNeonDb: () => mocks.db,
}));
vi.mock('@/lib/server/payments/stripe-provider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/payments/stripe-provider')>()),
  isStripeConfigured: mocks.isStripeConfigured,
}));
vi.mock('@/lib/services/billing-refund-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/billing-refund-service')>()),
  listPendingRefundRequests: mocks.listPendingRefundRequests,
  lookupAccountBilling: mocks.lookupAccountBilling,
  declineRefundRequest: mocks.declineRefundRequest,
  issueOperatorRefund: mocks.issueOperatorRefund,
}));

import { createError } from '@/lib/errors';
import { RefundRequestRefusal } from '@/lib/services/billing-refund-service';
import { GET, POST } from '../route';

const URL_BASE = 'https://app.test/api/admin/billing-refunds';
const REQUEST_ID = '77777777-7777-4777-8777-777777777777';
const CHARGE_ID = 'ch_3PqRsTuVwXyZ1234';
const IDEMPOTENCY_KEY = 'operator-refund-0001';

function get(query = '') {
  return new NextRequest(`${URL_BASE}${query}`);
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(URL_BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function refundAction(over: Record<string, unknown> = {}) {
  return {
    action: 'refund',
    chargeId: CHARGE_ID,
    amountCents: 1_000,
    note: 'Charged twice for the same upgrade',
    stripeReason: 'duplicate',
    requestId: REQUEST_ID,
    endPlan: false,
    ...over,
  };
}

function securityDetails() {
  return mocks.logSecurityEvent.mock.calls.map(
    ([event]) => (event as { details: Record<string, unknown> }).details,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.csrf.mockResolvedValue(null);
  mocks.isStripeConfigured.mockReturnValue(true);
  mocks.requirePlatformAdmin.mockResolvedValue({ userId: 'operator-1' });
  mocks.listPendingRefundRequests.mockResolvedValue([{ id: REQUEST_ID, status: 'pending' }]);
  mocks.lookupAccountBilling.mockResolvedValue({ userId: 'user-1', charges: [], requests: [] });
  mocks.declineRefundRequest.mockResolvedValue({
    id: REQUEST_ID,
    userId: 'user-1',
    chargeId: CHARGE_ID,
    status: 'declined',
  });
  mocks.issueOperatorRefund.mockResolvedValue({
    refundId: 're_1',
    refundStatus: 'succeeded',
    amountCents: 1_000,
    currency: 'usd',
    userId: 'user-1',
    planEnded: false,
    request: null,
  });
});

describe('GET /api/admin/billing-refunds', () => {
  it('hides the console from anyone who is not a platform operator', async () => {
    mocks.requirePlatformAdmin.mockRejectedValueOnce(createError.notFound('Not found.'));

    const response = await GET(get());

    expect(response.status).toBe(404);
    expect(mocks.listPendingRefundRequests).not.toHaveBeenCalled();
  });

  it('lists the pending refund requests for an operator, uncached', async () => {
    const response = await GET(get());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual({
      pending: [{ id: REQUEST_ID, status: 'pending' }],
    });
    expect(mocks.listPendingRefundRequests).toHaveBeenCalledWith(mocks.db);
  });

  it('looks an account up by the query it is given', async () => {
    const response = await GET(get('?q=cus_Abc123'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ account: { userId: 'user-1' } });
    expect(mocks.lookupAccountBilling).toHaveBeenCalledWith(mocks.db, 'cus_Abc123');
  });

  it('answers 404 when no account matches the lookup', async () => {
    mocks.lookupAccountBilling.mockResolvedValueOnce(null);

    const response = await GET(get('?q=nobody@example.com'));

    expect(response.status).toBe(404);
    expect(await response.text()).toContain('No account matches that lookup.');
  });

  it('rejects an overlong lookup before reading anything', async () => {
    const response = await GET(get(`?q=${'a'.repeat(321)}`));

    expect(response.status).toBe(400);
    expect(mocks.lookupAccountBilling).not.toHaveBeenCalled();
  });

  it('answers 503 for a lookup when Stripe is not configured', async () => {
    mocks.isStripeConfigured.mockReturnValue(false);

    const response = await GET(get('?q=cus_Abc123'));

    expect(response.status).toBe(503);
    expect(mocks.lookupAccountBilling).not.toHaveBeenCalled();
  });

  it('maps a refusal from the refund service to its status', async () => {
    mocks.lookupAccountBilling.mockRejectedValueOnce(
      new RefundRequestRefusal('That payment is already refunded.', 409),
    );

    expect((await GET(get('?q=ch_3PqRsTuVwXyZ1234'))).status).toBe(409);
  });
});

describe('POST /api/admin/billing-refunds', () => {
  it('refuses a request without a CSRF token before checking the operator', async () => {
    mocks.csrf.mockResolvedValueOnce(new Response(null, { status: 403 }));

    const response = await POST(post(refundAction(), { 'idempotency-key': IDEMPOTENCY_KEY }));

    expect(response.status).toBe(403);
    expect(mocks.requirePlatformAdmin).not.toHaveBeenCalled();
    expect(mocks.issueOperatorRefund).not.toHaveBeenCalled();
  });

  it('hides the action from anyone who is not a platform operator', async () => {
    mocks.requirePlatformAdmin.mockRejectedValueOnce(createError.notFound('Not found.'));

    const response = await POST(post(refundAction(), { 'idempotency-key': IDEMPOTENCY_KEY }));

    expect(response.status).toBe(404);
    expect(mocks.issueOperatorRefund).not.toHaveBeenCalled();
  });

  it.each([
    [{ action: 'refund', chargeId: 'not-a-charge', amountCents: 10, note: 'x' }],
    [refundAction({ stripeReason: 'goodwill' })],
    [refundAction({ amountCents: -5 })],
    [refundAction({ note: '' })],
    [{ action: 'decline', requestId: 'not-a-uuid', note: 'x' }],
    [{ action: 'void', requestId: REQUEST_ID, note: 'x' }],
  ])('rejects the malformed action %j', async (body) => {
    const response = await POST(post(body, { 'idempotency-key': IDEMPOTENCY_KEY }));

    expect(response.status).toBe(400);
    expect(mocks.issueOperatorRefund).not.toHaveBeenCalled();
    expect(mocks.declineRefundRequest).not.toHaveBeenCalled();
  });

  it('declines a refund request and records the operator decision', async () => {
    const response = await POST(
      post({ action: 'decline', requestId: REQUEST_ID, note: 'Outside the refund window' }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ request: { status: 'declined' } });
    expect(mocks.declineRefundRequest).toHaveBeenCalledWith(mocks.db, {
      operatorUserId: 'operator-1',
      requestId: REQUEST_ID,
      note: 'Outside the refund window',
    });
    expect(securityDetails()).toEqual([
      {
        action: 'refund_request_declined',
        requestId: REQUEST_ID,
        targetUserId: 'user-1',
        chargeId: CHARGE_ID,
        reason: 'Outside the refund window',
      },
    ]);
  });

  it('maps a declined request that is no longer pending to 409 and records nothing', async () => {
    mocks.declineRefundRequest.mockRejectedValueOnce(
      new RefundRequestRefusal('That refund request is not pending.', 409),
    );

    const response = await POST(post({ action: 'decline', requestId: REQUEST_ID, note: 'x' }));

    expect(response.status).toBe(409);
    expect(mocks.logSecurityEvent).not.toHaveBeenCalled();
  });

  it('requires an Idempotency-Key so a retried refund cannot pay out twice', async () => {
    const response = await POST(post(refundAction()));

    expect(response.status).toBe(400);
    expect(mocks.issueOperatorRefund).not.toHaveBeenCalled();
  });

  it('issues a refund with the operator, reason and key, and records it', async () => {
    const response = await POST(post(refundAction(), { 'idempotency-key': IDEMPOTENCY_KEY }));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toMatchObject({ refundId: 're_1', amountCents: 1_000 });
    expect(mocks.issueOperatorRefund).toHaveBeenCalledWith(mocks.db, {
      operatorUserId: 'operator-1',
      chargeId: CHARGE_ID,
      amountCents: 1_000,
      note: 'Charged twice for the same upgrade',
      stripeReason: 'duplicate',
      requestId: REQUEST_ID,
      endPlan: false,
      idempotencyKey: IDEMPOTENCY_KEY,
    });
    expect(securityDetails()).toEqual([
      expect.objectContaining({
        action: 'charge_refunded',
        chargeId: CHARGE_ID,
        refundId: 're_1',
        amountCents: 1_000,
        targetUserId: 'user-1',
        planEnded: false,
        stripeReason: 'duplicate',
      }),
    ]);
  });

  it.each([
    [404, 'No payment has that charge id.'],
    [409, 'This payment is disputed.'],
    [400, 'That amount is more than the payment has left to refund.'],
  ] as const)('maps a %i refusal from the refund service', async (status, message) => {
    mocks.issueOperatorRefund.mockRejectedValueOnce(new RefundRequestRefusal(message, status));

    const response = await POST(post(refundAction(), { 'idempotency-key': IDEMPOTENCY_KEY }));

    expect(response.status).toBe(status);
    expect(mocks.logSecurityEvent).not.toHaveBeenCalled();
  });

  it('answers 503 for a refund when Stripe is not configured', async () => {
    mocks.isStripeConfigured.mockReturnValue(false);

    const response = await POST(post(refundAction(), { 'idempotency-key': IDEMPOTENCY_KEY }));

    expect(response.status).toBe(503);
    expect(mocks.issueOperatorRefund).not.toHaveBeenCalled();
  });
});
