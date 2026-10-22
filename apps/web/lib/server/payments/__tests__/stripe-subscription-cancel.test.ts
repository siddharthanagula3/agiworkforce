import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const stripeMocks = vi.hoisted(() => ({
  retrieve: vi.fn(),
  cancel: vi.fn(),
  list: vi.fn(),
}));
vi.mock('@/lib/server/stripe-client', () => {
  const client = {
    subscriptions: {
      retrieve: stripeMocks.retrieve,
      cancel: stripeMocks.cancel,
      list: stripeMocks.list,
    },
  };
  return { getStripeClient: () => client, getStripeClientOrNull: () => client };
});

import { cancelLiveStripeSubscriptionsNow, cancelStripeSubscriptionNow } from '../stripe-provider';

function listing(subscriptions: Array<{ id: string; status: string }>) {
  return {
    async *[Symbol.asyncIterator]() {
      yield* subscriptions;
    },
  };
}

function missing(): Error {
  return Object.assign(new Error('No such subscription'), { code: 'resource_missing' });
}

const statuses = new Map<string, string>();

beforeEach(() => {
  vi.clearAllMocks();
  statuses.clear();
  stripeMocks.retrieve.mockImplementation(async (id: string) => {
    const status = statuses.get(id);
    if (!status) throw missing();
    return { id, status };
  });
  stripeMocks.cancel.mockResolvedValue({});
  stripeMocks.list.mockReturnValue(listing([]));
});

describe('cancelStripeSubscriptionNow', () => {
  it('cancels a live subscription without proration or a final invoice', async () => {
    statuses.set('sub_live1', 'active');

    await expect(cancelStripeSubscriptionNow('sub_live1')).resolves.toBe(true);
    expect(stripeMocks.cancel).toHaveBeenCalledWith('sub_live1', {
      prorate: false,
      invoice_now: false,
    });
  });

  it('treats an already ended or missing subscription as done, so a retry converges', async () => {
    statuses.set('sub_ended1', 'canceled');

    await expect(cancelStripeSubscriptionNow('sub_ended1')).resolves.toBe(false);
    await expect(cancelStripeSubscriptionNow('sub_gone1')).resolves.toBe(false);
    expect(stripeMocks.cancel).not.toHaveBeenCalled();
  });

  it('surfaces any other Stripe failure', async () => {
    stripeMocks.retrieve.mockRejectedValue(new Error('api_connection_error'));

    await expect(cancelStripeSubscriptionNow('sub_live1')).rejects.toThrow('api_connection_error');
  });
});

describe('cancelLiveStripeSubscriptionsNow', () => {
  it('cancels the tracked subscription and every other live one on the customer', async () => {
    statuses.set('sub_tracked1', 'active');
    statuses.set('sub_extra1', 'past_due');
    statuses.set('sub_old1', 'canceled');
    stripeMocks.list.mockReturnValue(
      listing([
        { id: 'sub_tracked1', status: 'active' },
        { id: 'sub_extra1', status: 'past_due' },
        { id: 'sub_old1', status: 'canceled' },
      ]),
    );

    const canceled = await cancelLiveStripeSubscriptionsNow({
      subscriptionReference: 'sub_tracked1',
      customerReference: 'cus_owner1',
    });

    expect(stripeMocks.list).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_owner1', status: 'all' }),
    );
    expect(canceled.sort()).toEqual(['sub_extra1', 'sub_tracked1']);
    expect(stripeMocks.cancel).toHaveBeenCalledTimes(2);
  });

  it('does not reach Stripe when there is nothing billing to end', async () => {
    await expect(
      cancelLiveStripeSubscriptionsNow({ subscriptionReference: null, customerReference: null }),
    ).resolves.toEqual([]);
    expect(stripeMocks.list).not.toHaveBeenCalled();
    expect(stripeMocks.retrieve).not.toHaveBeenCalled();
  });

  it('throws when a cancel fails, so the caller keeps the linkage and retries', async () => {
    statuses.set('sub_tracked1', 'active');
    stripeMocks.cancel.mockRejectedValue(new Error('rate_limit'));

    await expect(
      cancelLiveStripeSubscriptionsNow({
        subscriptionReference: 'sub_tracked1',
        customerReference: null,
      }),
    ).rejects.toThrow('rate_limit');
  });
});
