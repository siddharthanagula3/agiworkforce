import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { MICROUSD_PER_CREDIT, MOBILE_IAP_PRODUCT_DEFINITIONS } from '@agiworkforce/types';
import { recordCogsAdjustment } from './cogs-ledger-service';
import {
  STORE_TEST_PURCHASE_REFUSED,
  recordVerifiedMobileIapPurchase,
} from './mobile-iap-ledger-service';
import { SubscriptionService } from './subscription-service';
import { readStoreTestPurchasesAllowed } from '@/lib/feature-flags/store-test-purchase-gate';
import { logger } from '@/lib/logger';
import type { VerifiedMobileIapPurchase } from '@/lib/server/mobile-iap-store-verification';

type CogsModule = typeof import('./cogs-ledger-service');

vi.mock('./cogs-ledger-service', async (importOriginal) => ({
  ...(await importOriginal<CogsModule>()),
  recordCogsAdjustment: vi.fn(async () => undefined),
}));

vi.mock('@/lib/feature-flags/store-test-purchase-gate', () => ({
  readStoreTestPurchasesAllowed: vi.fn(async () => false),
}));

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
    environment: 'production',
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
    environment: 'production',
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
  const execute = vi.fn(async (..._args: unknown[]): Promise<undefined> => undefined);
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.mocked(recordCogsAdjustment).mockClear();
  vi.mocked(readStoreTestPurchasesAllowed).mockReset().mockResolvedValue(false);
});

type Harness = ReturnType<typeof harness>;

function executed(h: Harness, fragment: string): unknown[][] {
  return (h.execute.mock.calls as unknown as Array<[string, unknown[]]>)
    .filter(([sql]) => sql.includes(fragment))
    .map(([, params]) => params);
}

function creditGrants(h: Harness): unknown[][] {
  return executed(h, 'add_credits_microusd');
}

function refundRequests(h: Harness): unknown[][] {
  return executed(h, 'insert into public.billing_refund_requests');
}

function planWrites(h: Harness): unknown[][] {
  return h.query.mock.calls.filter(([sql]) =>
    String(sql).includes('insert into public.subscriptions'),
  );
}

describe('verified mobile IAP ledger', () => {
  it('grants the $10 store pack its 500 credits, two per ledger cent, once', async () => {
    const h = harness();
    await expect(
      recordVerifiedMobileIapPurchase({
        db: h.db,
        userId: 'user-1',
        purchaseToken: 'fixture-token',
        verified: verified(),
      }),
    ).resolves.toMatchObject({ status: 'granted', unitsGranted: 500 });
    expect(h.execute).toHaveBeenCalledWith(
      'select public.add_credits_microusd($1, $2, $3, $4, $5, $6)',
      [
        'user-1',
        'account-1',
        500 * MICROUSD_PER_CREDIT,
        'Mobile ios top-up transaction-1',
        'purchase',
        JSON.stringify({
          charged_cents: 1_000,
          charged_currency: 'usd',
          store_environment: 'production',
        }),
      ],
    );
  });

  it('records a Japanese store purchase with the expiry local law sets for it', async () => {
    const h = harness();
    await recordVerifiedMobileIapPurchase({
      db: h.db,
      userId: 'user-1',
      purchaseToken: 'fixture-token',
      verified: { ...verified(), purchaseCountry: 'JP' },
    });

    const grant = (h.execute.mock.calls as unknown as Array<[string, unknown[]]>).find(([sql]) =>
      sql.includes('add_credits_microusd'),
    );
    expect(JSON.parse(String(grant?.[1][5]))).toEqual({
      purchase_country: 'JP',
      purchase_expires_at: '2027-02-01T00:00:00.000Z',
      charged_cents: 1_000,
      charged_currency: 'usd',
      store_environment: 'production',
    });
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
    expect(creditGrants(h)).toEqual([]);
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

  it('changes nothing when the app verifies a transaction for a period the plan has already reached', async () => {
    const h = harness({
      subscriptionOwner: { apple_original_transaction_id: 'original-apple-2' },
    });
    const allocate = vi.spyOn(SubscriptionService, 'allocateCreditsForPeriod');

    await expect(
      recordVerifiedMobileIapPurchase({
        db: h.db,
        userId: 'user-1',
        purchaseToken: 'fixture-token',
        verified: verifiedSubscription(),
      }),
    ).resolves.toMatchObject({
      status: 'already_processed',
      currentPeriodEnd: '2026-09-01T00:00:00.000Z',
    });

    expect(planWrites(h)).toEqual([]);
    expect(allocate).not.toHaveBeenCalled();
    expect(executed(h, "set status = 'already_processed'")).toEqual([['receipt-1']]);
    expect(recordCogsAdjustment).not.toHaveBeenCalled();
  });

  it('moves the plan forward when the app verifies a renewal before the store reports it', async () => {
    const h = harness({
      subscriptionOwner: { apple_original_transaction_id: 'original-apple-2' },
    });
    vi.spyOn(SubscriptionService, 'allocateCreditsForPeriod').mockResolvedValue('account-1');

    await expect(
      recordVerifiedMobileIapPurchase({
        db: h.db,
        userId: 'user-1',
        purchaseToken: 'fixture-token',
        verified: { ...verifiedSubscription(), expiresAt: new Date('2026-10-01T00:00:00.000Z') },
      }),
    ).resolves.toMatchObject({ status: 'active' });

    expect(planWrites(h)).toHaveLength(1);
  });

  it('records the auto-renew choice the store reported instead of assuming it renews', async () => {
    const h = harness({ subscriptionStatus: 'canceled' });
    vi.spyOn(SubscriptionService, 'allocateCreditsForPeriod').mockResolvedValue('account-1');

    await recordVerifiedMobileIapPurchase({
      db: h.db,
      userId: 'user-1',
      purchaseToken: 'fixture-token',
      verified: { ...verifiedSubscription(), cancelAtPeriodEnd: true },
    });

    const [sql, params] = planWrites(h)[0] as [string, unknown[]];
    expect(sql).toContain('cancel_at_period_end = excluded.cancel_at_period_end');
    expect(params[8]).toBe(true);
  });
});

describe('a purchase the store charged for and the ledger will not grant', () => {
  it('files a refund request when a plan is bought while the web plan is still paid for', async () => {
    const h = harness({
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
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(refundRequests(h)).toEqual([
      [
        'user-1',
        'mobile_iap:ios:transaction-sub-1',
        'plan',
        2_000,
        '2026-08-01T00:00:00.000Z',
        expect.stringMatching(/App Store charged .* not added to this account/),
        null,
      ],
    ]);
  });

  it('refuses a plan from a second store identity while the first still pays, and files the charge', async () => {
    const h = harness({ subscriptionOwner: { current_period_end: '2999-01-01T00:00:00.000Z' } });

    await expect(
      recordVerifiedMobileIapPurchase({
        db: h.db,
        userId: 'user-1',
        purchaseToken: 'fixture-token',
        verified: verifiedSubscription(),
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(planWrites(h)).toEqual([]);
    expect(refundRequests(h)).toEqual([
      expect.arrayContaining(['user-1', 'mobile_iap:ios:transaction-sub-1', 'plan']),
    ]);
  });

  it('still reports the charge, and lets the store retry, when the refund request cannot be filed', async () => {
    const h = harness({
      subscriptionOwner: {
        stripe_subscription_id: 'sub_live123',
        apple_original_transaction_id: null,
      },
    });
    h.execute.mockImplementation(async (...args: unknown[]) => {
      if (String(args[0]).includes('insert into public.billing_refund_requests')) {
        throw new Error('refund queue unavailable');
      }
      return undefined;
    });
    const reported = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    await expect(
      recordVerifiedMobileIapPurchase({
        db: h.db,
        userId: 'user-1',
        purchaseToken: 'fixture-token',
        verified: verifiedSubscription(),
      }),
    ).rejects.toThrow('refund queue unavailable');

    expect(reported).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'store_purchase_charged_not_granted',
        storeTransactionId: 'transaction-sub-1',
        refundRequestFiled: false,
      }),
      expect.any(String),
    );
  });

  it('files a refund request for a top-up approved after the plan lapsed', async () => {
    const h = harness({ subscriptionStatus: 'canceled' });

    await expect(
      recordVerifiedMobileIapPurchase({
        db: h.db,
        userId: 'user-1',
        purchaseToken: 'fixture-token',
        verified: { ...verified(), purchaseCountry: 'DE' },
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(refundRequests(h)).toEqual([
      [
        'user-1',
        'mobile_iap:ios:transaction-1',
        'top_up',
        1_000,
        '2026-08-01T00:00:00.000Z',
        expect.stringContaining('active paid plan'),
        'DE',
      ],
    ]);
    expect(creditGrants(h)).toEqual([]);
  });

  it('files nothing for a receipt that belongs to another account', async () => {
    const h = harness({ existingUser: 'user-2' });

    await expect(
      recordVerifiedMobileIapPurchase({
        db: h.db,
        userId: 'user-1',
        purchaseToken: 'fixture-token',
        verified: verified(),
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(refundRequests(h)).toEqual([]);
  });

  it('files nothing for a test purchase, which moved no money', async () => {
    const h = harness({ subscriptionStatus: 'canceled' });

    await expect(
      recordVerifiedMobileIapPurchase({
        db: h.db,
        userId: 'user-1',
        purchaseToken: 'fixture-token',
        verified: { ...verified(), environment: 'sandbox' },
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(refundRequests(h)).toEqual([]);
  });
});

describe('a store test purchase on a production deployment', () => {
  const sandboxTopUp = (): VerifiedMobileIapPurchase => ({ ...verified(), environment: 'sandbox' });
  const sandboxPlan = (): VerifiedMobileIapPurchase => ({
    ...verifiedSubscription(),
    environment: 'sandbox',
  });

  it.each([
    ['top-up', sandboxTopUp],
    ['plan', sandboxPlan],
  ])('is refused, with a reason, for an account nobody allowed: %s', async (_kind, purchase) => {
    vi.stubEnv('VERCEL_ENV', 'production');
    const h = harness({ subscriptionStatus: 'canceled' });

    await expect(
      recordVerifiedMobileIapPurchase({
        db: h.db,
        userId: 'user-1',
        purchaseToken: 'fixture-token',
        verified: purchase(),
      }),
    ).rejects.toMatchObject({ statusCode: 403, message: STORE_TEST_PURCHASE_REFUSED });

    expect(readStoreTestPurchasesAllowed).toHaveBeenCalledWith('user-1');
    expect(executed(h, 'mobile_iap_transactions')).toEqual([]);
    expect(planWrites(h)).toEqual([]);
    expect(creditGrants(h)).toEqual([]);
  });

  it('is granted to the account the operator allowed, marked as a test and as no revenue', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.mocked(readStoreTestPurchasesAllowed).mockResolvedValue(true);
    const h = harness();

    await expect(
      recordVerifiedMobileIapPurchase({
        db: h.db,
        userId: 'user-1',
        purchaseToken: 'fixture-token',
        verified: sandboxTopUp(),
      }),
    ).resolves.toMatchObject({ status: 'granted' });

    const receipt = h.query.mock.calls.find(([sql]) =>
      String(sql).includes('insert into public.mobile_iap_transactions'),
    );
    expect((receipt![1] as unknown[])[11]).toBe('sandbox');
    expect(JSON.parse(String(creditGrants(h)[0]![5]))).toEqual({
      charged_cents: 0,
      charged_currency: 'usd',
      store_environment: 'sandbox',
    });
    expect(recordCogsAdjustment).not.toHaveBeenCalled();
  });

  it('grants an allowed account a test plan without recording a store commission', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.mocked(readStoreTestPurchasesAllowed).mockResolvedValue(true);
    vi.spyOn(SubscriptionService, 'allocateCreditsForPeriod').mockResolvedValue('account-1');
    const h = harness({ subscriptionStatus: 'canceled' });

    await expect(
      recordVerifiedMobileIapPurchase({
        db: h.db,
        userId: 'user-1',
        purchaseToken: 'fixture-token',
        verified: sandboxPlan(),
      }),
    ).resolves.toMatchObject({ status: 'active' });

    expect(recordCogsAdjustment).not.toHaveBeenCalled();
  });

  it('records the store commission on a purchase that was paid for', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    const h = harness();

    await recordVerifiedMobileIapPurchase({
      db: h.db,
      userId: 'user-1',
      purchaseToken: 'fixture-token',
      verified: verified(),
    });

    expect(readStoreTestPurchasesAllowed).not.toHaveBeenCalled();
    expect(recordCogsAdjustment).toHaveBeenCalledTimes(1);
  });
});
