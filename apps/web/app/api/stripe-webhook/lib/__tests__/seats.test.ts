import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { MAX_PURCHASABLE_SEATS } from '@agiworkforce/types';
import {
  buildPurchasedSeatRecord,
  resolveCheckoutSessionSeats,
  resolveSubscriptionSeats,
} from '../seats';

describe('resolveSubscriptionSeats', () => {
  it('reads the seat count from the subscription item quantity', () => {
    expect(resolveSubscriptionSeats({ items: { data: [{ quantity: 25 }] } })).toBe(25);
  });

  it('defaults to 1 when Stripe reports no usable quantity', () => {
    expect(resolveSubscriptionSeats({ items: { data: [{ quantity: null }] } })).toBe(1);
    expect(resolveSubscriptionSeats({ items: { data: [{}] } })).toBe(1);
    expect(resolveSubscriptionSeats({ items: { data: [] } })).toBe(1);
    expect(resolveSubscriptionSeats({ items: null })).toBe(1);
    expect(resolveSubscriptionSeats({})).toBe(1);
  });

  it('never returns a quantity below 1 or above the Stripe item ceiling', () => {
    expect(resolveSubscriptionSeats({ items: { data: [{ quantity: 0 }] } })).toBe(1);
    expect(resolveSubscriptionSeats({ items: { data: [{ quantity: -8 }] } })).toBe(1);
    expect(resolveSubscriptionSeats({ items: { data: [{ quantity: 1.5 }] } })).toBe(1);
    expect(
      resolveSubscriptionSeats({ items: { data: [{ quantity: MAX_PURCHASABLE_SEATS + 5 }] } }),
    ).toBe(MAX_PURCHASABLE_SEATS);
  });
});

describe('resolveCheckoutSessionSeats', () => {
  it('reads the seat count from the session line item', () => {
    expect(resolveCheckoutSessionSeats({ line_items: { data: [{ quantity: 4 }] } })).toBe(4);
  });

  it('returns null when the session carries no expanded line item', () => {
    expect(resolveCheckoutSessionSeats({})).toBeNull();
    expect(resolveCheckoutSessionSeats({ line_items: { data: [] } })).toBeNull();
    expect(resolveCheckoutSessionSeats({ line_items: { data: [{ quantity: 0 }] } })).toBeNull();
  });
});

describe('buildPurchasedSeatRecord', () => {
  it('reports the purchased seat count for a per-seat tier', () => {
    expect(buildPurchasedSeatRecord('team', { items: { data: [{ quantity: 30 }] } })).toEqual({
      planTier: 'team',
      seats: 30,
      perSeat: true,
    });
  });

  it('pins per-account tiers to a single seat whatever Stripe reports', () => {
    expect(buildPurchasedSeatRecord('pro', { items: { data: [{ quantity: 12 }] } })).toEqual({
      planTier: 'pro',
      seats: 1,
      perSeat: false,
    });
  });

  it('fails closed on an unknown tier', () => {
    expect(buildPurchasedSeatRecord('not_a_tier', { items: { data: [{ quantity: 12 }] } })).toEqual(
      {
        planTier: 'not_a_tier',
        seats: 1,
        perSeat: false,
      },
    );
  });
});
