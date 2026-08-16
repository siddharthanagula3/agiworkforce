import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { SubscriptionService } from './subscription-service';

/**
 * A store-billed subscription has no webhook telling us it lapsed: there is no
 * Apple ASSN V2 endpoint, no Play RTDN endpoint, and no re-verification cron.
 * Before this, cancelling in the App Store left `status = 'active'` forever and
 * the paid tier was permanent.
 *
 * `getSubscription` is the one reader every server-side entitlement check
 * shares, so expiry is derived here. These cases pin the boundary — especially
 * the ones that must NOT expire, because over-expiring revokes access from
 * paying customers.
 */
const DAY = 24 * 60 * 60 * 1000;

function dbReturning(row: Record<string, unknown> | null): DatabaseAdapter {
  return {
    query: vi.fn(async () => (row ? [row] : [])),
    execute: vi.fn(),
    transaction: vi.fn(),
    withUser: vi.fn(),
    withOrg: vi.fn(),
    dispose: vi.fn(),
  } as unknown as DatabaseAdapter;
}

function baseRow(overrides: Record<string, unknown>) {
  return {
    id: 'sub-1',
    user_id: 'user-1',
    plan_tier: 'pro',
    status: 'active',
    current_period_start: new Date(Date.now() - 40 * DAY).toISOString(),
    current_period_end: new Date(Date.now() - 30 * DAY).toISOString(),
    stripe_subscription_id: null,
    stripe_price_id: null,
    apple_original_transaction_id: null,
    google_purchase_token: null,
    ...overrides,
  };
}

describe('getSubscription — lapsed store subscriptions', () => {
  it('expires an Apple subscription whose period ended beyond the grace window', async () => {
    const db = dbReturning(baseRow({ apple_original_transaction_id: 'apple-tx-1' }));
    const sub = await SubscriptionService.getSubscription(db, 'user-1');
    expect(sub?.status).toBe('expired');
  });

  it('expires a Google subscription whose period ended beyond the grace window', async () => {
    const db = dbReturning(baseRow({ google_purchase_token: 'play-token-1' }));
    const sub = await SubscriptionService.getSubscription(db, 'user-1');
    expect(sub?.status).toBe('expired');
  });

  it('keeps a store subscription inside the renewal grace window entitled', async () => {
    // Apple and Google can both report a renewal after the previous period has
    // technically ended; expiring on the exact boundary revokes access from
    // paying customers during ordinary renewal lag.
    const db = dbReturning(
      baseRow({
        apple_original_transaction_id: 'apple-tx-1',
        current_period_end: new Date(Date.now() - 1 * DAY).toISOString(),
      }),
    );
    const sub = await SubscriptionService.getSubscription(db, 'user-1');
    expect(sub?.status).toBe('active');
  });

  it('never expires a row with a null period end', async () => {
    // `current_period_end` is nullable on historical store records and manual
    // provisions. Treating null as expired would downgrade real subscribers
    // and every manually provisioned Team/Enterprise row.
    const db = dbReturning(
      baseRow({ apple_original_transaction_id: 'apple-tx-1', current_period_end: null }),
    );
    const sub = await SubscriptionService.getSubscription(db, 'user-1');
    expect(sub?.status).toBe('active');
  });

  it('never expires a Stripe-linked row, even with a stale period end', async () => {
    // Stripe owns its own lifecycle through webhooks; deriving expiry here
    // would fight it.
    //
    // The id has to be WELL FORMED to prove that. `isStripeSubscriptionId` is
    // /^sub_[A-Za-z0-9]+$/, so the previous fixture `sub_stripe_123` — with an
    // underscore after the prefix — failed it. That left ownership
    // 'unverified' with a store identifier present, which is exactly the case
    // the store-expiry rule is meant to catch, so the row expired and the test
    // read as a Stripe regression when it was really a malformed fixture.
    const db = dbReturning(
      baseRow({
        stripe_subscription_id: 'sub_1P0AbCdEfGhIjKlMnOpQrSt',
        apple_original_transaction_id: 'apple-tx-1',
      }),
    );
    const sub = await SubscriptionService.getSubscription(db, 'user-1');
    expect(sub?.status).toBe('active');
  });

  it('never expires a manually provisioned row that carries no store identity', async () => {
    const db = dbReturning(baseRow({ plan_tier: 'enterprise' }));
    const sub = await SubscriptionService.getSubscription(db, 'user-1');
    expect(sub?.status).toBe('active');
  });

  it('surfaces the store identifiers so callers can tell which channel owns the row', async () => {
    const db = dbReturning(
      baseRow({
        apple_original_transaction_id: 'apple-tx-1',
        current_period_end: new Date(Date.now() + 30 * DAY).toISOString(),
      }),
    );
    const sub = await SubscriptionService.getSubscription(db, 'user-1');
    expect(sub?.apple_original_transaction_id).toBe('apple-tx-1');
    expect(sub?.google_purchase_token).toBeNull();
  });
});
