import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { MOBILE_IAP_PRODUCT_DEFINITIONS } from '@agiworkforce/types';
import { recordVerifiedMobileIapPurchase } from './mobile-iap-ledger-service';
import { SubscriptionService } from './subscription-service';
import type { VerifiedMobileIapPurchase } from '@/lib/server/mobile-iap-store-verification';

const topUp = {
  ...MOBILE_IAP_PRODUCT_DEFINITIONS.find((item) => item.kind === 'top_up')!,
  productId: 'fixture.topup',
};

const subscriptionProduct = {
  ...MOBILE_IAP_PRODUCT_DEFINITIONS.find(
    (item) => item.kind === 'subscription' && item.planTier === 'pro',
  )!,
  productId: 'fixture.subscription',
};

function verifiedSubscription(): VerifiedMobileIapPurchase {
  return {
    platform: 'ios',
    product: subscriptionProduct as VerifiedMobileIapPurchase['product'],
    storeTransactionId: 'transaction-sub-1',
    purchaseTokenHash: 'token-hash-sub-1',
    originalTransactionId: 'original-apple-2',
    purchasedAt: new Date('2026-08-01T00:00:00.000Z'),
    expiresAt: new Date('2026-09-01T00:00:00.000Z'),
    environment: 'sandbox',
    entitlementStatus: 'active',
  };
}

function verified(): VerifiedMobileIapPurchase {
  return {
    platform: 'ios',
    product: topUp,
    storeTransactionId: 'transaction-1',
    purchaseTokenHash: 'token-hash-1',
    originalTransactionId: null,
    purchasedAt: new Date('2026-08-01T00:00:00.000Z'),
    expiresAt: null,
    environment: 'sandbox',
    entitlementStatus: 'active',
  };
}

function harness(
  options: {
    existingUser?: string;
    subscriptionStatus?: string;
    subscriptionOwner?: Record<string, string | null>;
  } = {},
) {
  const execute = vi.fn(async () => undefined);
  const query = vi.fn(async (sql: string, _params?: readonly unknown[]) => {
    if (sql.includes('from public.mobile_iap_transactions') && options.existingUser) {
      return [{ user_id: options.existingUser, status: 'granted' }];
    }
    if (sql.includes('from public.mobile_iap_transactions')) return [];
    if (sql.includes('from public.subscriptions')) {
      return [
        {
          id: 'sub-1',
          plan_tier: 'pro',
          status: options.subscriptionStatus ?? 'active',
          stripe_subscription_id: null,
          apple_original_transaction_id: 'original-apple-1',
          google_purchase_token: null,
          current_period_start: '2026-08-01T00:00:00.000Z',
          current_period_end: '2026-09-01T00:00:00.000Z',
          ...options.subscriptionOwner,
        },
      ];
    }
    if (sql.includes('insert into public.mobile_iap_transactions')) return [{ id: 'receipt-1' }];
    if (sql.includes('insert into public.subscriptions')) return [{ id: 'sub-1' }];
    if (sql.includes('public.get_credit_balance')) return [{ account_id: 'account-1' }];
    return [];
  });
  const db = {
    query,
    execute,
    transaction: vi.fn(async (callback: (tx: DatabaseAdapter) => Promise<unknown>) =>
      callback(db as unknown as DatabaseAdapter),
    ),
  } as unknown as DatabaseAdapter;
  return { db, query, execute };
}

afterEach(() => vi.restoreAllMocks());

describe('verified mobile IAP ledger', () => {
  it('grants exactly the canonical $10 / 500-unit top-up once', async () => {
    const h = harness();
    await expect(
      recordVerifiedMobileIapPurchase({
        db: h.db,
        userId: 'user-1',
        purchaseToken: 'fixture-token',
        verified: verified(),
      }),
    ).resolves.toMatchObject({ status: 'granted', unitsGranted: 500 });
    expect(h.execute).toHaveBeenCalledWith('select public.add_credits($1, $2, $3, $4, $5)', [
      'user-1',
      'account-1',
      1_000,
      expect.stringContaining('transaction-1'),
      'purchase',
    ]);
  });

  it('returns an idempotent result without granting a replay', async () => {
    const h = harness({ existingUser: 'user-1' });
    await expect(
      recordVerifiedMobileIapPurchase({
        db: h.db,
        userId: 'user-1',
        purchaseToken: 'fixture-token',
        verified: verified(),
      }),
    ).resolves.toMatchObject({ status: 'already_processed', unitsGranted: 500 });
    expect(h.execute).not.toHaveBeenCalled();
  });

  it('rejects a receipt previously bound to a different AGI account', async () => {
    const h = harness({ existingUser: 'user-2' });
    await expect(
      recordVerifiedMobileIapPurchase({
        db: h.db,
        userId: 'user-1',
        purchaseToken: 'fixture-token',
        verified: verified(),
      }),
    ).rejects.toThrow(/another account/i);
  });

  it('does not grant a top-up without an active paid subscription', async () => {
    const h = harness({ subscriptionStatus: 'canceled' });
    vi.spyOn(SubscriptionService, 'allocateCreditsForPeriod');
    await expect(
      recordVerifiedMobileIapPurchase({
        db: h.db,
        userId: 'user-1',
        purchaseToken: 'fixture-token',
        verified: verified(),
      }),
    ).rejects.toThrow(/active paid plan/i);
    expect(h.execute).not.toHaveBeenCalled();
  });

  it('releases an ended web subscription so the store purchase is the only owner', async () => {
    const h = harness({
      subscriptionStatus: 'canceled',
      subscriptionOwner: {
        stripe_subscription_id: 'sub_live123',
        apple_original_transaction_id: null,
      },
    });
    vi.spyOn(SubscriptionService, 'allocateCreditsForPeriod').mockResolvedValue('account-1');

    await expect(
      recordVerifiedMobileIapPurchase({
        db: h.db,
        userId: 'user-1',
        purchaseToken: 'fixture-token',
        verified: verifiedSubscription(),
      }),
    ).resolves.toMatchObject({ status: 'active', kind: 'subscription' });

    const upsert = h.query.mock.calls.find(([sql]) =>
      String(sql).includes('insert into public.subscriptions'),
    );
    expect(upsert).toBeDefined();
    expect(String(upsert![0])).toContain('stripe_subscription_id = case when $7');
    expect((upsert![1] as unknown[])[6]).toBe(true);
  });

  it('refuses a store purchase while the web subscription is still entitled', async () => {
    const h = harness({
      subscriptionStatus: 'active',
      subscriptionOwner: {
        stripe_subscription_id: 'sub_live123',
        apple_original_transaction_id: null,
      },
    });

    await expect(
      recordVerifiedMobileIapPurchase({
        db: h.db,
        userId: 'user-1',
        purchaseToken: 'fixture-token',
        verified: verifiedSubscription(),
      }),
    ).rejects.toThrow(/active web subscription/i);
  });

  it('keeps the store owner on a same-platform renewal', async () => {
    const h = harness({ subscriptionStatus: 'active' });
    vi.spyOn(SubscriptionService, 'allocateCreditsForPeriod').mockResolvedValue('account-1');

    await expect(
      recordVerifiedMobileIapPurchase({
        db: h.db,
        userId: 'user-1',
        purchaseToken: 'fixture-token',
        verified: verifiedSubscription(),
      }),
    ).resolves.toMatchObject({ status: 'active' });

    const upsert = h.query.mock.calls.find(([sql]) =>
      String(sql).includes('insert into public.subscriptions'),
    );
    expect((upsert![1] as unknown[])[6]).toBe(false);
  });
});
