import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { SubscriptionService } from './subscription-service';

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

describe('getSubscription, lapsed store subscriptions', () => {
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
    const db = dbReturning(
      baseRow({ apple_original_transaction_id: 'apple-tx-1', current_period_end: null }),
    );
    const sub = await SubscriptionService.getSubscription(db, 'user-1');
    expect(sub?.status).toBe('active');
  });

  it('never expires a Stripe-linked row, even with a stale period end', async () => {
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
