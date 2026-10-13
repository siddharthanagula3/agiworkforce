import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const {
  mockIdentity,
  mockLifecycleVerify,
  mockOwner,
  mockAcknowledge,
  mockTestPurchasesAllowed,
  mockSecurityEvent,
  mockDb,
} = vi.hoisted(() => ({
  mockSecurityEvent: vi.fn(async (..._input: unknown[]) => undefined),
  mockIdentity: vi.fn(),
  mockTestPurchasesAllowed: vi.fn(async () => false),
  mockLifecycleVerify: vi.fn(),
  mockOwner: vi.fn(),
  mockAcknowledge: vi.fn(),
  mockDb: { current: null as unknown },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => mockDb.current }));
type SecurityAuditModule = typeof import('@/lib/security-audit');
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<SecurityAuditModule>()),
  logSecurityEvent: mockSecurityEvent,
}));
vi.mock('@/lib/server/google-pubsub-push-identity', () => ({
  verifyGooglePubSubPushIdentity: mockIdentity,
}));
type SubscriptionServiceModule = typeof import('@/lib/services/subscription-service');
type CogsLedgerModule = typeof import('@/lib/services/cogs-ledger-service');

vi.mock('@/lib/services/subscription-service', async (importOriginal) => {
  const actual = await importOriginal<SubscriptionServiceModule>();
  actual.SubscriptionService.allocateCreditsForPeriod = vi.fn().mockResolvedValue('account-1');
  actual.SubscriptionService.carryCreditsForUpgradePeriod = vi.fn().mockResolvedValue('account-1');
  return actual;
});
vi.mock('@/lib/services/cogs-ledger-service', async (importOriginal) => ({
  ...(await importOriginal<CogsLedgerModule>()),
  recordCogsAdjustment: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/feature-flags/store-test-purchase-gate', () => ({
  readStoreTestPurchasesAllowed: mockTestPurchasesAllowed,
}));
vi.mock('@/lib/server/mobile-iap-store-verification', () => ({
  hashMobileIapPurchaseToken: (token: string) => `hash:${token}`,
  isUnfundedStorePurchase: (purchase: { environment: string }) =>
    purchase.environment === 'sandbox' && process.env['VERCEL_ENV'] === 'production',
  verifyGooglePlayLifecyclePurchase: mockLifecycleVerify,
  readGooglePlayPurchaseOwner: mockOwner,
  acknowledgeGooglePlayPurchase: mockAcknowledge,
}));

import { POST } from '../route';

const PRODUCT_ID = 'com.agiworkforce.topup10';
const PURCHASE_TOKEN = 'google-purchase-token-long-enough-for-the-schema';
const APP_ACCOUNT_TOKEN = '00000000-0000-4000-8000-000000000001';
const PACKAGE_NAME = 'com.agiworkforce.app';

const TOP_UP = {
  key: 'top_up_10',
  kind: 'top_up',
  amountUsd: 10,
  units: 500,
  productId: PRODUCT_ID,
};
const SUBSCRIPTION_ID = 'agi_pro';
const NEXT_SUBSCRIPTION_ID = 'agi_max';
const PRO = {
  key: 'subscription_pro_monthly',
  kind: 'subscription',
  planTier: 'pro',
  interval: 'monthly',
  intendedPriceUsd: 20,
  productId: SUBSCRIPTION_ID,
  googleOffer: { basePlanId: 'monthly', offerId: null },
};
const PERIOD_END = new Date('2026-11-01T00:00:00.000Z');

function verifiedSubscription(overrides: Record<string, unknown> = {}) {
  return {
    platform: 'android',
    product: PRO,
    storeTransactionId: 'GPA.1234',
    purchaseTokenHash: `hash:${PURCHASE_TOKEN}`,
    originalTransactionId: null,
    purchasedAt: new Date('2026-10-01T00:00:00.000Z'),
    expiresAt: PERIOD_END,
    environment: 'production',
    entitlementStatus: 'active',
    lifecycle: 'active',
    cancelAtPeriodEnd: false,
    storeAcknowledged: true,
    ...overrides,
  };
}

function notification(messageId: string, body?: Record<string, unknown>) {
  const payload = Buffer.from(
    JSON.stringify({
      packageName: PACKAGE_NAME,
      ...(body ?? {
        oneTimeProductNotification: {
          notificationType: 2,
          purchaseToken: PURCHASE_TOKEN,
          sku: PRODUCT_ID,
        },
      }),
    }),
    'utf8',
  ).toString('base64');
  return new Request('http://localhost:3000/api/mobile/iap/google-notifications', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer pubsub-token' },
    body: JSON.stringify({ message: { data: payload, messageId } }),
  }) as never;
}

function subscriptionNotice(notificationType: number) {
  return { subscriptionNotification: { notificationType, purchaseToken: PURCHASE_TOKEN } };
}

function harness(
  options: {
    unrecorded?: boolean;
    ownerUserId?: string | null;
    subscriptionToken?: string;
    receiptEnvironment?: string;
  } = {},
) {
  const seenNotifications = new Set<string>();
  let recorded = options.unrecorded !== true;
  const execute = vi.fn(async (_sql: string, _params?: readonly unknown[]) => undefined);
  const query = vi.fn(async (sql: string, params?: readonly unknown[]) => {
    if (sql.includes('insert into public.mobile_iap_notification_receipts')) {
      const id = String(params?.[1]);
      if (seenNotifications.has(id)) return [];
      seenNotifications.add(id);
      return [{ notification_id: id }];
    }
    if (sql.includes('insert into public.mobile_iap_transactions')) {
      recorded = true;
      return [{ id: 'receipt-1' }];
    }
    if (sql.includes('from public.mobile_iap_accounts')) {
      return options.ownerUserId ? [{ user_id: options.ownerUserId }] : [];
    }
    if (sql.includes('insert into public.subscriptions')) {
      return [{ id: 'sub-1', plan_catalog_version: 1 }];
    }
    if (sql.includes('update public.subscriptions')) return [{ id: 'sub-1' }];
    if (sql.includes('from public.subscriptions')) {
      if (!recorded) return [];
      return [
        {
          plan_tier: 'pro',
          status: 'active',
          stripe_subscription_id: null,
          apple_original_transaction_id: null,
          google_purchase_token: options.subscriptionToken ?? PURCHASE_TOKEN,
          current_period_end: '2999-01-01T00:00:00.000Z',
        },
      ];
    }
    if (sql.includes('from public.mobile_iap_transactions')) {
      if (!recorded) return [];
      return [
        {
          id: 'receipt-1',
          user_id: 'user-1',
          app_account_token: APP_ACCOUNT_TOKEN,
          intended_amount_cents: 1000,
          refunded_amount_cents: 0,
          environment: options.receiptEnvironment ?? 'production',
          product_id: PRODUCT_ID,
        },
      ];
    }
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

describe('POST /api/mobile/iap/google-notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIdentity.mockResolvedValue({ ok: true });
    mockLifecycleVerify.mockResolvedValue({
      product: TOP_UP,
      storeTransactionId: 'store-transaction-1',
      originalTransactionId: null,
      purchasedAt: new Date('2026-09-01T00:00:00.000Z'),
      expiresAt: null,
      environment: 'production',
      entitlementStatus: 'active',
    });
    vi.stubEnv('MOBILE_IAP_ENABLED', 'true');
    vi.stubEnv('GOOGLE_PLAY_PACKAGE_NAME', PACKAGE_NAME);
    vi.stubEnv(
      'MOBILE_IAP_GOOGLE_PRODUCT_IDS_JSON',
      JSON.stringify({
        top_up_10: PRODUCT_ID,
        subscription_pro_monthly: { productId: SUBSCRIPTION_ID, basePlanId: 'monthly' },
        subscription_max_monthly: { productId: NEXT_SUBSCRIPTION_ID, basePlanId: 'monthly' },
      }),
    );
  });

  afterEach(() => vi.unstubAllEnvs());

  it('refunds a canceled one-time purchase once, however often Pub/Sub redelivers it', async () => {
    const h = harness();

    const first = await POST(notification('message-1'));
    await expect(first.json()).resolves.toMatchObject({ status: 'processed' });
    const second = await POST(notification('message-1'));
    await expect(second.json()).resolves.toMatchObject({ status: 'duplicate' });

    const refunds = h.execute.mock.calls.filter(([sql]) =>
      String(sql).includes('public.handle_top_up_refund'),
    );
    expect(refunds).toHaveLength(1);
    expect(refunds[0]?.[1]).toEqual([
      'user-1',
      1000,
      expect.stringContaining('store-transaction-1'),
    ]);
  });

  it('refuses a notification whose Pub/Sub identity is not the configured service account', async () => {
    const h = harness();
    mockIdentity.mockResolvedValue({ ok: false, reason: 'not_authorized' });

    const response = await POST(notification('message-2'));

    expect(response.status).toBe(403);
    expect(h.execute).not.toHaveBeenCalled();
    expect(mockLifecycleVerify).not.toHaveBeenCalled();
  });

  it('refuses a notification for another Play package', async () => {
    const h = harness();
    vi.stubEnv('GOOGLE_PLAY_PACKAGE_NAME', 'com.someone.else');

    const response = await POST(notification('message-3'));

    expect(response.status).toBe(403);
    expect(h.execute).not.toHaveBeenCalled();
  });
  function subscriptionWrites(h: ReturnType<typeof harness>) {
    return h.query.mock.calls
      .filter(([sql]) => String(sql).includes('update public.subscriptions'))
      .map(([sql, params]) => ({ sql: String(sql), params }));
  }

  it.each([
    ['renewed', 2],
    ['recovered from hold or pause', 1],
    ['restarted before expiry', 7],
    ['deferred', 9],
  ])('keeps the plan active when a subscription is %s', async (_label, type) => {
    const h = harness();
    mockLifecycleVerify.mockResolvedValue(verifiedSubscription());

    const response = await POST(notification(`active-${type}`, subscriptionNotice(type)));

    await expect(response.json()).resolves.toMatchObject({ status: 'processed' });
    const [write] = subscriptionWrites(h);
    expect(write?.sql).toContain("set status = 'active'");
    expect(write?.params).toEqual(
      expect.arrayContaining(['pro', PURCHASE_TOKEN, PERIOD_END.toISOString(), false]),
    );
    expect(mockLifecycleVerify).toHaveBeenCalledWith(
      expect.objectContaining({ notificationType: type }),
    );
  });

  it('keeps access to the paid-through date after a voluntary cancellation', async () => {
    const h = harness();
    mockLifecycleVerify.mockResolvedValue(verifiedSubscription({ cancelAtPeriodEnd: true }));

    await POST(notification('canceled', subscriptionNotice(3)));

    const [write] = subscriptionWrites(h);
    expect(write?.sql).toContain("set status = 'active'");
    expect(write?.params).toEqual(expect.arrayContaining([true]));
  });

  it('keeps access through the grace period without allocating a new period', async () => {
    const h = harness();
    const graceEnd = new Date('2026-11-08T00:00:00.000Z');
    mockLifecycleVerify.mockResolvedValue(
      verifiedSubscription({ lifecycle: 'grace', expiresAt: graceEnd }),
    );

    await POST(notification('grace', subscriptionNotice(6)));

    const [write] = subscriptionWrites(h);
    expect(write?.sql).toContain('greatest(current_period_end');
    expect(write?.params).toEqual(['user-1', graceEnd.toISOString(), null]);
    expect(h.query.mock.calls.some(([sql]) => String(sql).includes('plan_tier = $2'))).toBe(false);
  });

  it.each([
    ['account hold', 5, 'on_hold', 'past_due'],
    ['a pause', 10, 'paused', 'paused'],
  ])(
    'blocks access during %s but keeps the plan on record',
    async (_label, type, lifecycle, status) => {
      const h = harness();
      mockLifecycleVerify.mockResolvedValue(
        verifiedSubscription({ lifecycle, entitlementStatus: 'expired' }),
      );

      await POST(notification(`suspended-${type}`, subscriptionNotice(type)));

      const [write] = subscriptionWrites(h);
      expect(write?.params).toEqual(['user-1', status, null]);
      expect(write?.sql).not.toContain("plan_tier = 'free'");
      expect(mockAcknowledge).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['expired', 13, 'expired'],
    ['revoked', 12, 'revoked'],
  ])('ends the plan when the subscription is %s', async (_label, type, lifecycle) => {
    const h = harness();
    mockLifecycleVerify.mockResolvedValue(
      verifiedSubscription({ lifecycle, entitlementStatus: 'expired' }),
    );

    await POST(notification(`ended-${type}`, subscriptionNotice(type)));

    const [write] = subscriptionWrites(h);
    expect(write?.sql).toContain("plan_tier = 'free'");
    expect(
      h.execute.mock.calls.some(
        ([sql, params]) =>
          String(sql).includes('update public.mobile_iap_transactions') &&
          (params as unknown[])[1] === lifecycle,
      ),
    ).toBe(true);
  });

  it('changes nothing while a purchase is still waiting for payment', async () => {
    const h = harness({ unrecorded: true, ownerUserId: 'user-1' });
    mockOwner.mockResolvedValue({
      appAccountToken: APP_ACCOUNT_TOKEN,
      productId: SUBSCRIPTION_ID,
    });
    mockLifecycleVerify.mockResolvedValue(
      verifiedSubscription({ lifecycle: 'pending', entitlementStatus: 'expired' }),
    );

    const response = await POST(notification('pending', subscriptionNotice(4)));

    await expect(response.json()).resolves.toMatchObject({ status: 'pending' });
    expect(h.execute).not.toHaveBeenCalled();
    expect(mockAcknowledge).not.toHaveBeenCalled();
  });

  it('grants and acknowledges a purchase that completed while the app was closed', async () => {
    const h = harness({ unrecorded: true, ownerUserId: 'user-1' });
    mockOwner.mockResolvedValue({
      appAccountToken: APP_ACCOUNT_TOKEN,
      productId: SUBSCRIPTION_ID,
    });
    mockLifecycleVerify.mockResolvedValue(verifiedSubscription({ storeAcknowledged: false }));

    const response = await POST(notification('purchased', subscriptionNotice(4)));

    await expect(response.json()).resolves.toMatchObject({ status: 'processed' });
    expect(
      h.query.mock.calls.some(([sql]) =>
        String(sql).includes('insert into public.mobile_iap_transactions'),
      ),
    ).toBe(true);
    expect(mockAcknowledge).toHaveBeenCalledExactlyOnceWith({
      product: PRO,
      purchaseToken: PURCHASE_TOKEN,
    });
  });

  it('acknowledges again on redelivery when the first acknowledgement failed', async () => {
    harness();
    mockLifecycleVerify.mockResolvedValue(verifiedSubscription({ storeAcknowledged: false }));
    mockAcknowledge.mockRejectedValueOnce(new Error('Play is unavailable'));

    const first = await POST(notification('ack-retry', subscriptionNotice(4)));
    expect(first.status).toBe(500);
    const second = await POST(notification('ack-retry', subscriptionNotice(4)));

    await expect(second.json()).resolves.toMatchObject({ status: 'duplicate' });
    expect(mockAcknowledge).toHaveBeenCalledTimes(2);
  });

  it('does not acknowledge a purchase Play already holds as acknowledged', async () => {
    harness();
    mockLifecycleVerify.mockResolvedValue(verifiedSubscription({ storeAcknowledged: true }));

    await POST(notification('already-acknowledged', subscriptionNotice(2)));

    expect(mockAcknowledge).not.toHaveBeenCalled();
  });

  it('leaves a token alone when Play names no account this ledger knows', async () => {
    const h = harness({ unrecorded: true, ownerUserId: null });
    mockOwner.mockResolvedValue({
      appAccountToken: null,
      productId: SUBSCRIPTION_ID,
      chargedOrderId: null,
    });

    const response = await POST(notification('stranger', subscriptionNotice(4)));

    await expect(response.json()).resolves.toMatchObject({ status: 'unknown_purchase' });
    expect(mockLifecycleVerify).not.toHaveBeenCalled();
    expect(h.execute).not.toHaveBeenCalled();
    expect(mockSecurityEvent).not.toHaveBeenCalled();
  });

  it('records a paid purchase that names no account, and grants nothing for it', async () => {
    const h = harness({ unrecorded: true, ownerUserId: null });
    mockOwner.mockResolvedValue({
      appAccountToken: null,
      productId: SUBSCRIPTION_ID,
      chargedOrderId: 'GPA.9999',
    });

    const response = await POST(notification('paid-stranger', subscriptionNotice(4)));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'unattributed' });
    expect(mockSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'high',
        details: expect.objectContaining({
          action: 'store_purchase_unattributed',
          platform: 'android',
          reason: 'no_account_token',
          storeTransactionId: 'GPA.9999',
        }),
      }),
      { required: true },
    );
    expect(mockLifecycleVerify).not.toHaveBeenCalled();
    expect(h.execute).not.toHaveBeenCalled();
  });

  it('makes Play redeliver when the record of an unattributed charge cannot be written', async () => {
    harness({ unrecorded: true, ownerUserId: null });
    mockOwner.mockResolvedValue({
      appAccountToken: null,
      productId: SUBSCRIPTION_ID,
      chargedOrderId: 'GPA.9999',
    });
    mockSecurityEvent.mockRejectedValueOnce(new Error('audit log unavailable'));

    const response = await POST(notification('paid-stranger-retry', subscriptionNotice(4)));

    expect(response.status).toBe(500);
  });

  it('records a paid purchase bought for an account that no longer exists', async () => {
    harness({ unrecorded: true, ownerUserId: null });
    mockOwner.mockResolvedValue({
      appAccountToken: APP_ACCOUNT_TOKEN,
      productId: SUBSCRIPTION_ID,
      chargedOrderId: 'GPA.2222',
    });
    mockLifecycleVerify.mockResolvedValue(verifiedSubscription());

    const response = await POST(notification('deleted-account', subscriptionNotice(4)));

    expect(response.status).toBe(200);
    expect(mockSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          action: 'store_purchase_unattributed',
          reason: 'unknown_account',
        }),
      }),
      { required: true },
    );
  });

  it('leaves a purchase with no account identifier of its own alone, whatever token it replaced', async () => {
    const h = harness({ unrecorded: true, ownerUserId: 'user-1' });
    mockOwner.mockResolvedValue({
      appAccountToken: null,
      productId: SUBSCRIPTION_ID,
      chargedOrderId: null,
    });

    const response = await POST(notification('no-identifier', subscriptionNotice(4)));

    await expect(response.json()).resolves.toMatchObject({ status: 'unknown_purchase' });
    expect(
      h.query.mock.calls.filter(([sql]) => String(sql).includes('from public.mobile_iap_')),
    ).toHaveLength(1);
    expect(mockLifecycleVerify).not.toHaveBeenCalled();
  });

  it('does not end the live plan when the token it replaced expires', async () => {
    const h = harness({ subscriptionToken: 'the-token-that-replaced-this-one' });
    mockLifecycleVerify.mockResolvedValue(
      verifiedSubscription({ lifecycle: 'expired', entitlementStatus: 'expired' }),
    );

    const response = await POST(notification('replaced-expired', subscriptionNotice(13)));

    await expect(response.json()).resolves.toMatchObject({ status: 'stale' });
    expect(subscriptionWrites(h)).toEqual([]);
  });

  it('neither grants nor acknowledges a test purchase for an account nobody allowed', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    const h = harness({ unrecorded: true, ownerUserId: 'user-1' });
    mockOwner.mockResolvedValue({ appAccountToken: APP_ACCOUNT_TOKEN, productId: SUBSCRIPTION_ID });
    mockLifecycleVerify.mockResolvedValue(
      verifiedSubscription({ environment: 'sandbox', storeAcknowledged: false }),
    );

    const response = await POST(notification('test-purchase', subscriptionNotice(4)));

    await expect(response.json()).resolves.toMatchObject({ status: 'unknown_purchase' });
    expect(mockTestPurchasesAllowed).toHaveBeenCalledWith('user-1');
    expect(
      h.query.mock.calls.some(([sql]) =>
        String(sql).includes('insert into public.mobile_iap_transactions'),
      ),
    ).toBe(false);
    expect(subscriptionWrites(h)).toEqual([]);
    expect(mockAcknowledge).not.toHaveBeenCalled();
  });

  it('keeps an allowed tester on their plan when a test purchase renews', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    mockTestPurchasesAllowed.mockResolvedValueOnce(true);
    const h = harness({ receiptEnvironment: 'sandbox' });
    mockLifecycleVerify.mockResolvedValue(verifiedSubscription({ environment: 'sandbox' }));

    const response = await POST(notification('test-renewal', subscriptionNotice(2)));

    await expect(response.json()).resolves.toMatchObject({ status: 'processed' });
    expect(subscriptionWrites(h)).toHaveLength(1);
  });

  it('claws back a voided top-up exactly once', async () => {
    const h = harness();
    const voided = {
      voidedPurchaseNotification: {
        purchaseToken: PURCHASE_TOKEN,
        orderId: 'GPA.9999',
        productType: 2,
        refundType: 1,
      },
    };

    await POST(notification('voided-1', voided));
    await POST(notification('voided-1', voided));

    expect(
      h.execute.mock.calls.filter(([sql]) => String(sql).includes('public.handle_top_up_refund')),
    ).toHaveLength(1);
  });

  it('revokes a voided subscription that Play has ended', async () => {
    const h = harness();
    mockLifecycleVerify.mockResolvedValue(
      verifiedSubscription({ lifecycle: 'revoked', entitlementStatus: 'expired' }),
    );

    await POST(
      notification('voided-subscription', {
        voidedPurchaseNotification: {
          purchaseToken: PURCHASE_TOKEN,
          orderId: 'GPA.1234',
          productType: 1,
          refundType: 1,
        },
      }),
    );

    expect(mockLifecycleVerify).toHaveBeenCalledWith(
      expect.objectContaining({ notificationType: 12 }),
    );
    expect(subscriptionWrites(h)[0]?.sql).toContain("plan_tier = 'free'");
  });
});
