import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const { mockRequireCurrentUserId, mockVerifyStorePurchase, mockDb } = vi.hoisted(() => ({
  mockRequireCurrentUserId: vi.fn(),
  mockVerifyStorePurchase: vi.fn(),
  mockDb: { current: null as unknown },
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-chat', () => ({ requireCurrentUserId: mockRequireCurrentUserId }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => mockDb.current }));
vi.mock('@/lib/server/mobile-iap-store-verification', () => ({
  verifyMobileIapPurchase: mockVerifyStorePurchase,
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
        subscription_pro_monthly: SUBSCRIPTION_PRODUCT_ID,
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
      'select public.add_credits_microusd($1, $2, $3, $4, $5)',
      [
        'user-1',
        'account-1',
        10_000_000,
        expect.stringContaining('store-transaction-1'),
        'purchase',
      ],
    );
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
      'select public.add_credits_microusd($1, $2, $3, $4, $5)',
      expect.anything(),
    );
    expect(h.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO security_audit_logs'),
      expect.arrayContaining(['user-1', 'mobile_purchase_verified']),
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
    harness({ subscription: { stripe_subscription_id: 'sub_live123', status: 'active' } });
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
});
