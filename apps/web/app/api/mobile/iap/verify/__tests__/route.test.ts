import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const {
  mockRequireCurrentUserId,
  mockVerifyStorePurchase,
  mockAcknowledge,
  mockTestPurchasesAllowed,
  mockDb,
} = vi.hoisted(() => ({
  mockRequireCurrentUserId: vi.fn(),
  mockTestPurchasesAllowed: vi.fn(async () => false),
  mockVerifyStorePurchase: vi.fn(),
  mockAcknowledge: vi.fn(),
  mockDb: { current: null as unknown },
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-chat', () => ({ requireCurrentUserId: mockRequireCurrentUserId }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => mockDb.current }));
vi.mock('@/lib/feature-flags/store-test-purchase-gate', () => ({
  readStoreTestPurchasesAllowed: mockTestPurchasesAllowed,
}));
vi.mock('@/lib/server/mobile-iap-store-verification', () => ({
  hashMobileIapPurchaseToken: (token: string) => `hash:${token}`,
  isUnfundedStorePurchase: (purchase: { environment: string }) =>
    purchase.environment === 'sandbox' && process.env['VERCEL_ENV'] === 'production',
  verifyMobileIapPurchase: mockVerifyStorePurchase,
  acknowledgeGooglePlayPurchase: mockAcknowledge,
}));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    allocateCreditsForPeriod: vi.fn().mockResolvedValue('account-1'),
    carryCreditsForUpgradePeriod: vi.fn().mockResolvedValue('account-1'),
  },
}));

import { POST } from '../route';

const PRODUCT_ID = 'com.agiworkforce.topup10';
const SUBSCRIPTION_PRODUCT_ID = 'com.agiworkforce.pro.monthly';
const PURCHASE_TOKEN = 'google-purchase-token-long-enough-for-the-schema';
const APP_ACCOUNT_TOKEN = '00000000-0000-4000-8000-000000000001';

function request(body: unknown) {
  return new Request('http://localhost:3000/api/mobile/iap/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

function verifiedTopUp() {
  return {
    platform: 'android' as const,
    product: {
      key: 'top_up_10',
      kind: 'top_up',
      amountUsd: 10,
      units: 500,
      productId: PRODUCT_ID,
    },
    storeTransactionId: 'store-transaction-1',
    purchaseTokenHash: 'token-hash-1',
    originalTransactionId: null,
    purchasedAt: new Date('2026-09-01T00:00:00.000Z'),
    expiresAt: null,
    environment: 'production',
    entitlementStatus: 'active' as const,
  };
}

function harness(options: {
  existingReceiptUser?: string;
  subscription?: Record<string, unknown>;
  noSubscription?: boolean;
}) {
  const execute = vi.fn(async () => undefined);
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('from public.mobile_iap_accounts')) {
      return [{ app_account_token: APP_ACCOUNT_TOKEN }];
    }
    if (sql.includes('from public.mobile_iap_transactions')) {
      return options.existingReceiptUser
        ? [{ user_id: options.existingReceiptUser, status: 'granted' }]
        : [];
    }
    if (sql.includes('from public.subscriptions')) {
      if (options.noSubscription) return [];
      return [
        {
          id: 'sub-1',
          plan_tier: 'pro',
          status: 'active',
          stripe_subscription_id: null,
          apple_original_transaction_id: null,
          google_purchase_token: null,
          current_period_start: '2026-09-01T00:00:00.000Z',
          current_period_end: '2026-10-01T00:00:00.000Z',
          ...options.subscription,
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
  };
  mockDb.current = db;
  return { query, execute };
}

describe('POST /api/mobile/iap/verify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCurrentUserId.mockResolvedValue('user-1');
    vi.stubEnv('MOBILE_IAP_ENABLED', 'true');
    vi.stubEnv(
      'MOBILE_IAP_GOOGLE_PRODUCT_IDS_JSON',
      JSON.stringify({
        top_up_10: PRODUCT_ID,
        subscription_pro_monthly: { productId: SUBSCRIPTION_PRODUCT_ID, basePlanId: 'monthly' },
      }),
    );
  });

  afterEach(() => vi.unstubAllEnvs());

  it('credits a first-time top-up through the microUSD ledger', async () => {
    const h = harness({});
    mockVerifyStorePurchase.mockResolvedValue(verifiedTopUp());

    const response = await POST(
      request({ platform: 'android', productId: PRODUCT_ID, purchaseToken: PURCHASE_TOKEN }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'granted',
      unitsGranted: 500,
    });
    expect(h.execute).toHaveBeenCalledWith(
      'select public.add_credits_microusd($1, $2, $3, $4, $5, $6)',
      [
        'user-1',
        'account-1',
        2_500_000,
        'Mobile android top-up store-transaction-1',
        'purchase',
        JSON.stringify({
          charged_cents: 1_000,
          charged_currency: 'usd',
          store_environment: 'production',
        }),
      ],
    );
  });

  it('grants a completed store purchase after new purchases are switched off', async () => {
    vi.stubEnv('MOBILE_IAP_ENABLED', 'false');
    harness({});
    mockVerifyStorePurchase.mockResolvedValue(verifiedTopUp());

    const response = await POST(
      request({ platform: 'android', productId: PRODUCT_ID, purchaseToken: PURCHASE_TOKEN }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'granted',
      unitsGranted: 500,
    });
    expect(mockVerifyStorePurchase).toHaveBeenCalledOnce();
  });

  it('answers a replayed purchase token from the ledger without crediting it again', async () => {
    const h = harness({ existingReceiptUser: 'user-1' });
    mockVerifyStorePurchase.mockResolvedValue(verifiedTopUp());

    const response = await POST(
      request({ platform: 'android', productId: PRODUCT_ID, purchaseToken: PURCHASE_TOKEN }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'already_processed',
      unitsGranted: 500,
    });
    expect(h.execute).not.toHaveBeenCalledWith(
      expect.stringContaining('add_credits_microusd'),
      expect.anything(),
    );
    expect(h.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO security_audit_logs'),
      expect.arrayContaining(['user-1', 'mobile_purchase_verified']),
    );
  });

  // The store has already taken the money, so the upgrade gate that stops new
  // checkouts must never be consulted here.
  it('honours a receipt from an account with no subscription and no upgrade access', async () => {
    const h = harness({ noSubscription: true });
    mockVerifyStorePurchase.mockResolvedValue({
      ...verifiedTopUp(),
      product: {
        key: 'subscription_pro_monthly',
        kind: 'subscription',
        planTier: 'pro',
        interval: 'monthly',
        intendedPriceUsd: 20,
        productId: SUBSCRIPTION_PRODUCT_ID,
      },
      expiresAt: new Date('2026-10-01T00:00:00.000Z'),
    });

    const response = await POST(
      request({
        platform: 'android',
        productId: SUBSCRIPTION_PRODUCT_ID,
        purchaseToken: PURCHASE_TOKEN,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      kind: 'subscription',
      status: 'active',
      planTier: 'pro',
    });
    expect(h.query).not.toHaveBeenCalledWith(
      expect.stringContaining('beta_redemptions'),
      expect.anything(),
    );
  });

  it('refuses a receipt already bound to another AGI account', async () => {
    const h = harness({ existingReceiptUser: 'user-2' });
    mockVerifyStorePurchase.mockResolvedValue(verifiedTopUp());

    const response = await POST(
      request({ platform: 'android', productId: PRODUCT_ID, purchaseToken: PURCHASE_TOKEN }),
    );

    expect(response.status).toBe(403);
    expect(h.execute).not.toHaveBeenCalled();
  });

  it('refuses a store subscription while the same account is entitled on the web', async () => {
    const h = harness({
      subscription: { stripe_subscription_id: 'sub_live123', status: 'active' },
    });
    mockVerifyStorePurchase.mockResolvedValue({
      ...verifiedTopUp(),
      product: {
        key: 'subscription_pro_monthly',
        kind: 'subscription',
        planTier: 'pro',
        interval: 'monthly',
        intendedPriceUsd: 20,
        productId: SUBSCRIPTION_PRODUCT_ID,
      },
      expiresAt: new Date('2026-10-01T00:00:00.000Z'),
    });

    const response = await POST(
      request({
        platform: 'android',
        productId: SUBSCRIPTION_PRODUCT_ID,
        purchaseToken: PURCHASE_TOKEN,
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: expect.stringMatching(/web subscription/i) },
    });
    expect(
      h.execute.mock.calls.filter((call: unknown[]) =>
        String(call[0]).includes('insert into public.billing_refund_requests'),
      ),
    ).toHaveLength(1);
  });

  it('tells a tester whose account is not allowed why a test purchase was not added', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    const h = harness({});
    mockVerifyStorePurchase.mockResolvedValue({ ...verifiedTopUp(), environment: 'sandbox' });

    const response = await POST(
      request({ platform: 'android', productId: PRODUCT_ID, purchaseToken: PURCHASE_TOKEN }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: expect.stringMatching(/test environment.*Nothing was charged/i) },
    });
    expect(mockTestPurchasesAllowed).toHaveBeenCalledWith('user-1');
    expect(h.execute).not.toHaveBeenCalled();
    expect(mockAcknowledge).not.toHaveBeenCalled();
  });

  it('grants a test purchase to the account the operator allowed', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    mockTestPurchasesAllowed.mockResolvedValueOnce(true);
    harness({});
    mockVerifyStorePurchase.mockResolvedValue({ ...verifiedTopUp(), environment: 'sandbox' });

    const response = await POST(
      request({ platform: 'android', productId: PRODUCT_ID, purchaseToken: PURCHASE_TOKEN }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'granted' });
  });

  it('never reaches the store for a product this deployment does not sell', async () => {
    harness({});

    const response = await POST(
      request({
        platform: 'android',
        productId: 'com.someone.else',
        purchaseToken: PURCHASE_TOKEN,
      }),
    );

    expect(response.status).toBe(400);
    expect(mockVerifyStorePurchase).not.toHaveBeenCalled();
  });
  function verifiedSubscription(overrides: Record<string, unknown> = {}) {
    return {
      platform: 'android' as const,
      product: {
        key: 'subscription_pro_monthly',
        kind: 'subscription',
        planTier: 'pro',
        interval: 'monthly',
        intendedPriceUsd: 20,
        productId: SUBSCRIPTION_PRODUCT_ID,
      },
      storeTransactionId: 'GPA.1234',
      purchaseTokenHash: 'token-hash-2',
      originalTransactionId: null,
      purchasedAt: new Date('2026-09-01T00:00:00.000Z'),
      expiresAt: new Date('2026-10-01T00:00:00.000Z'),
      environment: 'production',
      entitlementStatus: 'active' as const,
      storeAcknowledged: false,
      ...overrides,
    };
  }

  it('acknowledges a Google Play purchase only after the grant is written', async () => {
    const h = harness({ noSubscription: true });
    mockVerifyStorePurchase.mockResolvedValue(verifiedSubscription());
    mockAcknowledge.mockImplementation(async () => {
      expect(
        h.execute.mock.calls.some((call: unknown[]) =>
          String(call[0]).includes("set status = 'active'"),
        ),
      ).toBe(true);
    });

    const response = await POST(
      request({
        platform: 'android',
        productId: SUBSCRIPTION_PRODUCT_ID,
        purchaseToken: PURCHASE_TOKEN,
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      status: 'active',
      storeAcknowledged: true,
    });
    expect(mockAcknowledge).toHaveBeenCalledExactlyOnceWith({
      product: expect.objectContaining({ productId: SUBSCRIPTION_PRODUCT_ID }),
      purchaseToken: PURCHASE_TOKEN,
    });
  });

  it('acknowledges on a replay too, so a first attempt that failed is repaired', async () => {
    harness({ existingReceiptUser: 'user-1' });
    mockVerifyStorePurchase.mockResolvedValue(verifiedSubscription());

    const response = await POST(
      request({
        platform: 'android',
        productId: SUBSCRIPTION_PRODUCT_ID,
        purchaseToken: PURCHASE_TOKEN,
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      status: 'already_processed',
      storeAcknowledged: true,
    });
    expect(mockAcknowledge).toHaveBeenCalledOnce();
  });

  it('skips the acknowledgement Play already holds', async () => {
    harness({ existingReceiptUser: 'user-1' });
    mockVerifyStorePurchase.mockResolvedValue(verifiedSubscription({ storeAcknowledged: true }));

    const response = await POST(
      request({
        platform: 'android',
        productId: SUBSCRIPTION_PRODUCT_ID,
        purchaseToken: PURCHASE_TOKEN,
      }),
    );

    await expect(response.json()).resolves.toMatchObject({ storeAcknowledged: true });
    expect(mockAcknowledge).not.toHaveBeenCalled();
  });

  it('keeps the grant and tells the app to acknowledge when Play does not answer', async () => {
    harness({ noSubscription: true });
    mockVerifyStorePurchase.mockResolvedValue(verifiedSubscription());
    mockAcknowledge.mockRejectedValue(new Error('Play is unavailable'));

    const response = await POST(
      request({
        platform: 'android',
        productId: SUBSCRIPTION_PRODUCT_ID,
        purchaseToken: PURCHASE_TOKEN,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'active',
      storeAcknowledged: false,
    });
  });

  it('never acknowledges a purchase the ledger refused', async () => {
    harness({ subscription: { stripe_subscription_id: 'sub_live_1' } });
    mockVerifyStorePurchase.mockResolvedValue(verifiedSubscription());

    const response = await POST(
      request({
        platform: 'android',
        productId: SUBSCRIPTION_PRODUCT_ID,
        purchaseToken: PURCHASE_TOKEN,
      }),
    );

    expect(response.status).toBe(409);
    expect(mockAcknowledge).not.toHaveBeenCalled();
  });

  it('reports a downgrade Play has scheduled for the next renewal without changing the plan', async () => {
    harness({ existingReceiptUser: 'user-1' });
    vi.stubEnv(
      'MOBILE_IAP_GOOGLE_PRODUCT_IDS_JSON',
      JSON.stringify({
        subscription_basic_monthly: { productId: 'agi_basic', basePlanId: 'monthly' },
        subscription_pro_monthly: { productId: SUBSCRIPTION_PRODUCT_ID, basePlanId: 'monthly' },
      }),
    );
    mockVerifyStorePurchase.mockResolvedValue(
      verifiedSubscription({
        storeAcknowledged: true,
        scheduledProduct: {
          key: 'subscription_basic_monthly',
          kind: 'subscription',
          planTier: 'basic',
          interval: 'monthly',
          intendedPriceUsd: 8,
          productId: 'agi_basic',
        },
      }),
    );

    const response = await POST(
      request({ platform: 'android', productId: 'agi_basic', purchaseToken: PURCHASE_TOKEN }),
    );

    await expect(response.json()).resolves.toMatchObject({
      planTier: 'pro',
      scheduledPlanTier: 'basic',
    });
  });

  it('sends no acknowledgement field for an App Store purchase', async () => {
    harness({ existingReceiptUser: 'user-1' });
    vi.stubEnv(
      'MOBILE_IAP_APPLE_PRODUCT_IDS_JSON',
      JSON.stringify({ subscription_pro_monthly: SUBSCRIPTION_PRODUCT_ID }),
    );
    mockVerifyStorePurchase.mockResolvedValue(
      verifiedSubscription({ platform: 'ios', storeAcknowledged: undefined }),
    );

    const response = await POST(
      request({
        platform: 'ios',
        productId: SUBSCRIPTION_PRODUCT_ID,
        purchaseToken: PURCHASE_TOKEN,
      }),
    );

    expect(await response.json()).not.toHaveProperty('storeAcknowledged');
    expect(mockAcknowledge).not.toHaveBeenCalled();
  });
});
