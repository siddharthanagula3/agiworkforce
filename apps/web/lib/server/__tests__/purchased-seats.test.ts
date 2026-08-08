import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockGetSubscription } = vi.hoisted(() => ({
  mockGetSubscription: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    getSubscription: (...args: unknown[]) => mockGetSubscription(...args),
  },
}));

import { resolvePurchasedSeatsForOwner } from '../purchased-seats';

const db = {} as never;

function stripeReturning(subscription: unknown) {
  return { subscriptions: { retrieve: vi.fn(async () => subscription) } };
}

describe('resolvePurchasedSeatsForOwner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads the seat count from the Stripe subscription item quantity', async () => {
    mockGetSubscription.mockResolvedValue({
      plan_tier: 'team',
      status: 'active',
      stripe_subscription_id: 'sub_123',
    });

    const result = await resolvePurchasedSeatsForOwner(
      db,
      'owner-1',
      stripeReturning({
        items: { data: [{ quantity: 7 }] },
        customer: 'cus_123',
      }) as never,
    );

    expect(result).toEqual({
      seats: 7,
      planTier: 'team',
      stripeSubscriptionId: 'sub_123',
      stripeCustomerId: 'cus_123',
    });
  });

  it('accepts an expanded customer object as well as a customer id string', async () => {
    mockGetSubscription.mockResolvedValue({
      plan_tier: 'team',
      status: 'active',
      stripe_subscription_id: 'sub_123',
    });

    const result = await resolvePurchasedSeatsForOwner(
      db,
      'owner-1',
      stripeReturning({
        items: { data: [{ quantity: 3 }] },
        customer: { id: 'cus_expanded' },
      }) as never,
    );

    expect(result?.stripeCustomerId).toBe('cus_expanded');
  });

  it('returns null on a per-account plan so pro buyers never provision seats', async () => {
    mockGetSubscription.mockResolvedValue({
      plan_tier: 'pro',
      status: 'active',
      stripe_subscription_id: 'sub_123',
    });

    const stripe = stripeReturning({ items: { data: [{ quantity: 9 }] } });
    await expect(resolvePurchasedSeatsForOwner(db, 'owner-1', stripe as never)).resolves.toBeNull();
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it('returns null when the Team plan is store-billed and has no Stripe subscription', async () => {
    mockGetSubscription.mockResolvedValue({
      plan_tier: 'team',
      status: 'active',
      stripe_subscription_id: null,
      apple_original_transaction_id: '1000000123',
    });

    await expect(
      resolvePurchasedSeatsForOwner(db, 'owner-1', stripeReturning({}) as never),
    ).resolves.toBeNull();
  });

  it('falls back to null rather than throwing when Stripe is unreachable', async () => {
    // Under-provisioning is recoverable — the next customer.subscription.updated
    // webhook finds the organization and writes the real number. Failing the
    // create call instead would leave a paying customer with no organization.
    mockGetSubscription.mockResolvedValue({
      plan_tier: 'team',
      status: 'active',
      stripe_subscription_id: 'sub_123',
    });

    const stripe = {
      subscriptions: {
        retrieve: vi.fn(async () => {
          throw new Error('stripe is down');
        }),
      },
    };

    await expect(resolvePurchasedSeatsForOwner(db, 'owner-1', stripe as never)).resolves.toBeNull();
  });

  it('returns null when no Stripe client is configured', async () => {
    mockGetSubscription.mockResolvedValue({
      plan_tier: 'team',
      status: 'active',
      stripe_subscription_id: 'sub_123',
    });

    await expect(resolvePurchasedSeatsForOwner(db, 'owner-1', null)).resolves.toBeNull();
  });

  it('returns null when the user has no subscription at all', async () => {
    mockGetSubscription.mockResolvedValue(null);

    await expect(
      resolvePurchasedSeatsForOwner(db, 'owner-1', stripeReturning({}) as never),
    ).resolves.toBeNull();
  });
});
