import { describe, expect, it, vi } from 'vitest';

type PricingModule = typeof import('@/lib/pricing');

vi.mock('server-only', () => ({}));

vi.mock('@/lib/pricing', async (importOriginal) => {
  const actual = await importOriginal<PricingModule>();
  const points: Record<string, ReturnType<PricingModule['getPricePointForPriceId']>> = {
    price_fixture_basic_inr: {
      plan: 'basic',
      interval: 'monthly',
      currency: 'inr',
      envVar: 'STRIPE_PRICE_BASIC_MONTHLY_INR',
    },
    price_fixture_basic_usd: {
      plan: 'basic',
      interval: 'monthly',
      currency: 'usd',
      envVar: 'STRIPE_PRICE_BASIC_MONTHLY_USD',
    },
  };
  return {
    ...actual,
    getPricePointForPriceId: (priceId: string) => points[priceId] ?? null,
  };
});

import { revenueContextOfSubscription } from '../revenue-context';

describe('revenueContextOfSubscription', () => {
  it('reads the currency of a Stripe subscription from its price point', () => {
    expect(revenueContextOfSubscription({ stripe_price_id: 'price_fixture_basic_inr' })).toEqual({
      channel: 'web',
      currency: 'inr',
    });
    expect(revenueContextOfSubscription({ stripe_price_id: 'price_fixture_basic_usd' })).toEqual({
      channel: 'web',
      currency: 'usd',
    });
  });

  it('names the store a mobile subscription was bought in', () => {
    expect(revenueContextOfSubscription({ apple_original_transaction_id: 'txn' })).toEqual({
      channel: 'ios',
      currency: 'usd',
    });
    expect(revenueContextOfSubscription({ google_purchase_token: 'tok' })).toEqual({
      channel: 'android',
      currency: 'usd',
    });
  });

  it('knows nothing about a price it was not configured with, or no subscription', () => {
    expect(revenueContextOfSubscription({ stripe_price_id: 'price_unknown' })).toBeNull();
    expect(revenueContextOfSubscription(null)).toBeNull();
    expect(revenueContextOfSubscription({})).toBeNull();
  });
});
