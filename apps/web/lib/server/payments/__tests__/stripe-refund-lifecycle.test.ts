import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const stripeMocks = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  listPayments: vi.fn(),
  retrieveSubscription: vi.fn(),
}));
vi.mock('@/lib/server/stripe-client', () => {
  const client = {
    refunds: { create: stripeMocks.create, list: stripeMocks.list },
    invoicePayments: { list: stripeMocks.listPayments },
    subscriptions: { retrieve: stripeMocks.retrieveSubscription },
  };
  return { getStripeClient: () => client, getStripeClientOrNull: () => client };
});

import {
  findStripeRefundsForRequest,
  readStripeSubscriptionPayment,
  refundStripeCharge,
} from '../stripe-provider';

const INPUT = {
  chargeReference: 'ch_1',
  amountMinorUnits: 400,
  reason: 'requested_by_customer' as const,
  metadata: { refund_request_id: 'req-1' },
  idempotencyKey: 'refund-request:req-1',
};

function refund(status: string | null, metadata: Record<string, string> = {}, id = 're_1') {
  return { id, amount: 400, currency: 'usd', status, metadata };
}

function listing(refunds: ReturnType<typeof refund>[]) {
  return {
    async *[Symbol.asyncIterator]() {
      yield* refunds;
    },
  };
}

beforeEach(() => vi.clearAllMocks());

describe('refundStripeCharge status mapping', () => {
  it('reports only a succeeded refund as refunded', async () => {
    stripeMocks.create.mockResolvedValueOnce(refund('succeeded'));

    await expect(refundStripeCharge(INPUT)).resolves.toMatchObject({ outcome: 'refunded' });
  });

  it.each(['pending', 'requires_action', null])(
    'keeps a %s refund pending instead of final',
    async (status) => {
      stripeMocks.create.mockResolvedValueOnce(refund(status));

      await expect(refundStripeCharge(INPUT)).resolves.toMatchObject({
        outcome: 'pending',
        refund: { reference: 're_1', status },
      });
    },
  );

  it.each(['failed', 'canceled'])('treats a %s refund as rejected', async (status) => {
    stripeMocks.create.mockResolvedValueOnce(refund(status));

    await expect(refundStripeCharge(INPUT)).resolves.toEqual({
      outcome: 'rejected',
      code: `refund_${status}`,
    });
  });
});

describe('findStripeRefundsForRequest', () => {
  it('returns the succeeded refund carrying the request id and ignores other requests', async () => {
    stripeMocks.list.mockReturnValueOnce(
      listing([
        refund('succeeded', { refund_request_id: 'other' }, 're_other'),
        refund('failed', { refund_request_id: 'req-1' }, 're_failed'),
        refund('succeeded', { refund_request_id: 'req-1' }, 're_ok'),
      ]),
    );

    const found = await findStripeRefundsForRequest('ch_1', 'req-1');

    expect(found.active).toMatchObject({ outcome: 'refunded', refund: { reference: 're_ok' } });
    expect(found.failedAttempts).toBe(1);
  });

  it('returns a pending refund when nothing has succeeded', async () => {
    stripeMocks.list.mockReturnValueOnce(
      listing([refund('pending', { refund_request_id: 'req-1' }, 're_wait')]),
    );

    const found = await findStripeRefundsForRequest('ch_1', 'req-1');

    expect(found.active).toMatchObject({ outcome: 'pending', refund: { reference: 're_wait' } });
  });

  it('finds nothing when no refund carries the request id', async () => {
    stripeMocks.list.mockReturnValueOnce(listing([refund('succeeded')]));

    await expect(findStripeRefundsForRequest('ch_1', 'req-1')).resolves.toEqual({
      active: null,
      failedAttempts: 0,
    });
  });
});

describe('readStripeSubscriptionPayment', () => {
  it('names the subscription that the payment paid', async () => {
    stripeMocks.listPayments.mockResolvedValueOnce({
      data: [
        {
          invoice: {
            deleted: false,
            lines: { data: [{ period: { start: 1_700_000_000, end: 1_702_000_000 } }] },
            parent: { subscription_details: { subscription: 'sub_paid' } },
          },
        },
      ],
    });
    stripeMocks.retrieveSubscription.mockResolvedValueOnce({ id: 'sub_paid', metadata: {} });

    await expect(readStripeSubscriptionPayment('pi_1')).resolves.toMatchObject({
      subscriptionReference: 'sub_paid',
    });
  });
});
