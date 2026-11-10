import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NormalizedCharge } from '@/lib/server/payments/domain';

type StripeProviderModule = typeof import('@/lib/server/payments/stripe-provider');
type NeonDbModule = typeof import('@/lib/server/neon-db');
type NotificationModule = typeof import('../notification-service');

const mocks = vi.hoisted(() => ({
  retrieveStripeCharge: vi.fn(),
  refundStripeCharge: vi.fn(),
  findStripeRefundsForRequest: vi.fn(),
  readStripeSubscriptionPayment: vi.fn(),
  readStripeCustomerCountry: vi.fn(),
  cancelStripeSubscriptionNow: vi.fn(),
  getNeonDb: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/payments/stripe-provider', async (importOriginal) => ({
  ...(await importOriginal<StripeProviderModule>()),
  retrieveStripeCharge: mocks.retrieveStripeCharge,
  refundStripeCharge: mocks.refundStripeCharge,
  findStripeRefundsForRequest: mocks.findStripeRefundsForRequest,
  readStripeSubscriptionPayment: mocks.readStripeSubscriptionPayment,
  readStripeCustomerCountry: mocks.readStripeCustomerCountry,
  cancelStripeSubscriptionNow: mocks.cancelStripeSubscriptionNow,
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<NeonDbModule>()),
  getNeonDb: mocks.getNeonDb,
}));
vi.mock('../notification-service', async (importOriginal) => ({
  ...(await importOriginal<NotificationModule>()),
  insertNotification: vi.fn(async () => 'inserted'),
}));

import {
  declineRefundRequest,
  fileRefundRequest,
  issueOperatorRefund,
} from '../billing-refund-service';
import { insertNotification } from '../notification-service';

const USER_ID = 'customer-1';
const CUSTOMER_ID = 'cus_customer1';
const CHARGE_ID = 'ch_plan00001';
const REQUEST_ID = 'request-1';
const NOW = new Date('2026-10-20T12:00:00.000Z');

interface Row {
  id: string;
  user_id: string;
  charge_id: string;
  charge_kind: string;
  charge_amount_cents: number;
  charge_currency: string;
  charge_created_at: string;
  reason: string;
  details: null;
  statutory_withdrawal: boolean;
  billing_country: string | null;
  assessment: string;
  assessed_refund_cents: number | null;
  status: string;
  refund_amount_cents: number | null;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
}

function pendingRow(overrides: Partial<Row> = {}): Row {
  return {
    id: REQUEST_ID,
    user_id: USER_ID,
    charge_id: CHARGE_ID,
    charge_kind: 'plan',
    charge_amount_cents: 2_000,
    charge_currency: 'usd',
    charge_created_at: NOW.toISOString(),
    reason: 'accidental_purchase',
    details: null,
    statutory_withdrawal: false,
    billing_country: 'US',
    assessment: 'unused_within_policy',
    assessed_refund_cents: 2_000,
    status: 'pending',
    refund_amount_cents: null,
    decision_note: null,
    decided_at: null,
    created_at: NOW.toISOString(),
    ...overrides,
  };
}

function planCharge(overrides: Partial<NormalizedCharge> = {}): NormalizedCharge {
  return {
    reference: CHARGE_ID,
    paymentReference: 'pi_plan00001',
    customerReference: CUSTOMER_ID,
    kind: 'subscription',
    amount: { currency: 'usd', minorUnits: 2_000 },
    refundedMinorUnits: 0,
    createdAt: new Date(NOW.getTime() - 86_400_000),
    settled: true,
    disputed: false,
    billingCountry: 'US',
    cardCountry: 'US',
    receiptUrl: null,
    purchasedLedgerCents: null,
    withdrawalConsent: null,
    ...overrides,
  };
}

function requestDb(initial: Row) {
  const row = { ...initial };
  const locks: string[] = [];
  const adapter = (): DatabaseAdapter =>
    ({
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (/where id = \$1\s+for update/u.test(sql)) {
          locks.push(String(params[0]));
          return [{ ...row }];
        }
        if (/^\s*update public\.billing_refund_requests/u.test(sql)) {
          if (row.status !== 'pending') return [];
          row.status = String(params[1]);
          row.refund_amount_cents = (params[4] as number | null) ?? null;
          row.decision_note = (params[6] as string | null) ?? null;
          return [{ ...row }];
        }
        if (/where user_id = \$1 and charge_id = \$2/u.test(sql)) return [{ ...row }];
        if (/select user_id, charge_id, status/u.test(sql)) {
          return [
            {
              user_id: row.user_id,
              charge_id: row.charge_id,
              status: row.status,
              assessment: row.assessment,
              assessed_refund_cents: row.assessed_refund_cents,
            },
          ];
        }
        if (sql.includes('from profiles profile')) {
          return [{ user_id: USER_ID, stripe_subscription_id: 'sub_currentplan' }];
        }
        throw new Error(`Unexpected SQL in refund request fake: ${sql}`);
      }),
      execute: vi.fn(async () => 0),
      transaction: async <T>(fn: (tx: DatabaseAdapter) => Promise<T>) => fn(adapter()),
    }) as unknown as DatabaseAdapter;
  return { db: adapter(), row, locks };
}

function succeeded(reference = 're_1', minorUnits = 2_000) {
  return {
    outcome: 'refunded' as const,
    refund: { reference, status: 'succeeded', amount: { currency: 'usd', minorUnits } },
  };
}

function fileFor(db: DatabaseAdapter) {
  return fileRefundRequest({
    db,
    userId: USER_ID,
    customerId: CUSTOMER_ID,
    chargeId: CHARGE_ID,
    reason: 'accidental_purchase',
    details: null,
    now: NOW,
  });
}

const OPERATOR_INPUT = {
  operatorUserId: 'operator-1',
  chargeId: CHARGE_ID,
  amountCents: null,
  note: 'Refund approved.',
  stripeReason: 'requested_by_customer' as const,
  requestId: REQUEST_ID,
  endPlan: true,
  idempotencyKey: 'form-key-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.retrieveStripeCharge.mockResolvedValue(planCharge());
  mocks.findStripeRefundsForRequest.mockResolvedValue({ active: null, failedAttempts: 0 });
  mocks.readStripeSubscriptionPayment.mockResolvedValue({
    subscriptionReference: 'sub_refundedplan',
    servicePeriod: null,
    withdrawalConsent: null,
  });
  mocks.readStripeCustomerCountry.mockResolvedValue(null);
  mocks.cancelStripeSubscriptionNow.mockResolvedValue(true);
  mocks.refundStripeCharge.mockResolvedValue(succeeded());
});

describe('automatic refund settlement', () => {
  it('cancels the subscription the refunded payment paid, not the current one', async () => {
    const { db, row } = requestDb(pendingRow());
    mocks.getNeonDb.mockReturnValue(db);

    const { request } = await fileFor(db);

    expect(mocks.cancelStripeSubscriptionNow).toHaveBeenCalledTimes(1);
    expect(mocks.cancelStripeSubscriptionNow).toHaveBeenCalledWith('sub_refundedplan');
    expect(request.status).toBe('refunded');
    expect(row.status).toBe('refunded');
  });

  it('cancels no subscription when the payment cannot be traced to one', async () => {
    mocks.readStripeSubscriptionPayment.mockResolvedValue(null);
    const { db } = requestDb(pendingRow());
    mocks.getNeonDb.mockReturnValue(db);

    const { request } = await fileFor(db);

    expect(mocks.cancelStripeSubscriptionNow).not.toHaveBeenCalled();
    expect(request.status).toBe('refunded');
  });

  it.each(['pending', 'requires_action'])(
    'keeps the request pending, ends no plan and tells nobody while the refund is %s',
    async (status) => {
      mocks.refundStripeCharge.mockResolvedValue({
        outcome: 'pending',
        refund: { reference: 're_1', status, amount: { currency: 'usd', minorUnits: 2_000 } },
      });
      const { db, row } = requestDb(pendingRow());
      mocks.getNeonDb.mockReturnValue(db);

      const { request } = await fileFor(db);

      expect(request.status).toBe('pending');
      expect(row.status).toBe('pending');
      expect(mocks.cancelStripeSubscriptionNow).not.toHaveBeenCalled();
      expect(insertNotification).not.toHaveBeenCalled();
    },
  );

  it('replays a request whose refund already succeeded at Stripe without refunding again', async () => {
    mocks.findStripeRefundsForRequest.mockResolvedValue({
      active: succeeded('re_existing'),
      failedAttempts: 0,
    });
    const { db, row } = requestDb(pendingRow());
    mocks.getNeonDb.mockReturnValue(db);

    const { request, created } = await fileFor(db);

    expect(created).toBe(false);
    expect(mocks.refundStripeCharge).not.toHaveBeenCalled();
    expect(request).toMatchObject({ status: 'refunded', refundAmountCents: 2_000 });
    expect(row.status).toBe('refunded');
    expect(mocks.cancelStripeSubscriptionNow).toHaveBeenCalledWith('sub_refundedplan');
  });

  it('files a new refund under a fresh key after an earlier attempt failed', async () => {
    mocks.findStripeRefundsForRequest.mockResolvedValue({ active: null, failedAttempts: 1 });
    const { db } = requestDb(pendingRow());
    mocks.getNeonDb.mockReturnValue(db);

    await fileFor(db);

    expect(mocks.refundStripeCharge).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: `refund-request:${REQUEST_ID}:1` }),
    );
  });

  it('keeps the request pending for a retry when the plan cancellation throws', async () => {
    mocks.cancelStripeSubscriptionNow.mockRejectedValueOnce(new Error('stripe 500'));
    const { db } = requestDb(pendingRow());
    mocks.getNeonDb.mockReturnValue(db);

    const { request } = await fileFor(db);

    expect(request.status).toBe('pending');
  });

  it('settles under the request row lock and refunds nothing for a request already decided', async () => {
    const { db, locks } = requestDb(pendingRow({ status: 'declined' }));
    mocks.getNeonDb.mockReturnValue(db);
    const decided = await fileFor(db);

    expect(decided.request.status).toBe('declined');
    expect(mocks.refundStripeCharge).not.toHaveBeenCalled();

    const pending = requestDb(pendingRow());
    mocks.getNeonDb.mockReturnValue(pending.db);
    await fileFor(pending.db);
    expect(pending.locks).toEqual([REQUEST_ID]);
    expect(locks).toEqual([]);
  });
});

describe('operator refund settlement', () => {
  it('shares the automatic refund when the request already has one at Stripe', async () => {
    mocks.retrieveStripeCharge.mockResolvedValue(planCharge({ refundedMinorUnits: 2_000 }));
    mocks.findStripeRefundsForRequest.mockResolvedValue({
      active: succeeded('re_auto'),
      failedAttempts: 0,
    });
    const { db, row } = requestDb(pendingRow());

    const result = await issueOperatorRefund(db, OPERATOR_INPUT);

    expect(mocks.refundStripeCharge).not.toHaveBeenCalled();
    expect(result).toMatchObject({ refundId: 're_auto', request: { status: 'refunded' } });
    expect(row.status).toBe('refunded');
  });

  it('uses the request-scoped key so an operator cannot add a second refund for one request', async () => {
    const { db } = requestDb(pendingRow());

    await issueOperatorRefund(db, OPERATOR_INPUT);

    expect(mocks.refundStripeCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: `refund-request:${REQUEST_ID}`,
        metadata: expect.objectContaining({ refund_request_id: REQUEST_ID }),
      }),
    );
  });

  it('leaves the request pending and ends no plan when Stripe has not finished the refund', async () => {
    mocks.refundStripeCharge.mockResolvedValue({
      outcome: 'pending',
      refund: {
        reference: 're_1',
        status: 'pending',
        amount: { currency: 'usd', minorUnits: 2_000 },
      },
    });
    const { db, row } = requestDb(pendingRow());

    const result = await issueOperatorRefund(db, OPERATOR_INPUT);

    expect(result).toMatchObject({ refundStatus: 'pending', planEnded: false, request: null });
    expect(row.status).toBe('pending');
    expect(mocks.cancelStripeSubscriptionNow).not.toHaveBeenCalled();
  });

  it('refuses a second refund for a request that is no longer pending', async () => {
    const { db } = requestDb(pendingRow());
    await issueOperatorRefund(db, OPERATOR_INPUT);

    await expect(issueOperatorRefund(db, OPERATOR_INPUT)).rejects.toMatchObject({ status: 409 });
    expect(mocks.refundStripeCharge).toHaveBeenCalledTimes(1);
  });
});

describe('declining a refund request', () => {
  it('refuses to decline a request Stripe already refunded', async () => {
    mocks.findStripeRefundsForRequest.mockResolvedValue({
      active: succeeded('re_auto'),
      failedAttempts: 0,
    });
    const { db, row } = requestDb(pendingRow());

    await expect(
      declineRefundRequest(db, {
        operatorUserId: 'operator-1',
        requestId: REQUEST_ID,
        note: 'No.',
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(row.status).toBe('pending');
  });

  it('declines a request that has no refund at Stripe', async () => {
    const { db, row } = requestDb(pendingRow());

    await declineRefundRequest(db, {
      operatorUserId: 'operator-1',
      requestId: REQUEST_ID,
      note: 'Outside the window.',
    });

    expect(row.status).toBe('declined');
  });
});
