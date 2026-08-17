import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  applySubscriptionOwnerHandoff,
  resolveSubscriptionOwnerHandoff,
} from './subscription-owner-handoff';
import { resolveSubscriptionBillingSource } from './subscription-billing-owner';

function row(overrides: Record<string, unknown> = {}) {
  return {
    plan_tier: 'pro',
    status: 'active',
    stripe_subscription_id: null,
    apple_original_transaction_id: null,
    google_purchase_token: null,
    current_period_end: null,
    ...overrides,
  };
}

function stubDb(existing: Record<string, unknown> | null) {
  const execute = vi.fn(async () => undefined);
  const query = vi.fn(async () => (existing ? [existing] : []));
  return {
    db: { query, execute } as unknown as DatabaseAdapter,
    query,
    execute,
  };
}

describe('subscription owner handoff', () => {
  it('leaves a row alone when the incoming channel already owns it', () => {
    const handoff = resolveSubscriptionOwnerHandoff(
      row({ apple_original_transaction_id: 'apple-tx-1' }),
      'ios',
    );

    expect(handoff.incumbents).toEqual([]);
    expect(handoff.blocked).toBe(false);
    expect(handoff.clearsApple).toBe(false);
  });

  it('refuses a handoff while the other channel is still entitled', () => {
    const handoff = resolveSubscriptionOwnerHandoff(
      row({ apple_original_transaction_id: 'apple-tx-1', status: 'trialing' }),
      'stripe',
    );

    expect(handoff.incumbents).toEqual(['ios']);
    expect(handoff.incumbentEntitled).toBe(true);
    expect(handoff.blocked).toBe(true);
    expect(handoff.clearsApple).toBe(false);
  });

  it('hands a terminal store subscription over to web billing', () => {
    const handoff = resolveSubscriptionOwnerHandoff(
      row({ google_purchase_token: 'play-token-1', status: 'expired' }),
      'stripe',
    );

    expect(handoff.blocked).toBe(false);
    expect(handoff.clearsGoogle).toBe(true);
    expect(handoff.clearsStripe).toBe(false);
  });

  it('hands a lapsed store subscription over once its renewal grace elapsed', () => {
    const handoff = resolveSubscriptionOwnerHandoff(
      row({
        apple_original_transaction_id: 'apple-tx-legacy',
        status: 'active',
        current_period_end: '2026-08-09T11:59:59.000Z',
      }),
      'stripe',
      Date.parse('2026-08-13T12:00:00.000Z'),
    );

    expect(handoff.blocked).toBe(false);
    expect(handoff.clearsApple).toBe(true);
  });

  it('hands a non-entitled web subscription over to a store purchase', () => {
    const handoff = resolveSubscriptionOwnerHandoff(
      row({ stripe_subscription_id: 'sub_live123', status: 'canceled' }),
      'ios',
    );

    expect(handoff.incumbents).toEqual(['stripe']);
    expect(handoff.blocked).toBe(false);
    expect(handoff.clearsStripe).toBe(true);
  });

  it('clears the losing identifiers so exactly one effective owner survives', async () => {
    const existing = row({
      apple_original_transaction_id: 'apple-tx-1',
      status: 'expired',
    });
    const stub = stubDb(existing);

    const handoff = await applySubscriptionOwnerHandoff(stub.db, 'user-1', 'stripe');

    expect(handoff.clearsApple).toBe(true);
    expect(stub.execute).toHaveBeenCalledTimes(1);
    const [sql, params] = stub.execute.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('apple_original_transaction_id');
    expect(params).toEqual(['user-1', false, true, false]);

    expect(
      resolveSubscriptionBillingSource({
        ...existing,
        apple_original_transaction_id: null,
        stripe_subscription_id: 'sub_live123',
      } as never),
    ).toBe('stripe');
  });

  it('writes nothing when the previous owner is still entitled', async () => {
    const stub = stubDb(row({ apple_original_transaction_id: 'apple-tx-1', status: 'active' }));

    const handoff = await applySubscriptionOwnerHandoff(stub.db, 'user-1', 'stripe');

    expect(handoff.blocked).toBe(true);
    expect(stub.execute).not.toHaveBeenCalled();
  });

  it('writes nothing for a user with no subscription row', async () => {
    const stub = stubDb(null);

    const handoff = await applySubscriptionOwnerHandoff(stub.db, 'user-1', 'stripe');

    expect(handoff.incumbents).toEqual([]);
    expect(stub.execute).not.toHaveBeenCalled();
  });
});
