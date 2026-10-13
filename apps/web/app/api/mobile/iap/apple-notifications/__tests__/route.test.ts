import { NotificationTypeV2, Subtype } from '@apple/app-store-server-library';
import { MOBILE_IAP_PRODUCT_DEFINITIONS } from '@agiworkforce/types';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@/lib/server/neon-db');
type ScanModule1 = typeof import('@/lib/server/mobile-iap-store-verification');
type ScanModule2 = typeof import('@/lib/server/mobile-iap-catalog');
type ScanModule3 = typeof import('@/lib/services/mobile-iap-notification-service');

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  process: vi.fn(async (_input: unknown) => 'applied'),
  product: vi.fn(),
  hasReceipt: vi.fn(async (..._input: unknown[]) => true),
  grant: vi.fn(async (_input: unknown) => 'granted'),
  unattributed: vi.fn(async (_input: unknown) => undefined),
}));

vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  getNeonDb: () => ({ query: vi.fn(async () => []) }),
}));
vi.mock('@/lib/server/mobile-iap-store-verification', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  verifyAppleStoreNotification: mocks.verify,
}));
vi.mock('@/lib/server/mobile-iap-catalog', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  resolveMobileIapProduct: mocks.product,
}));
vi.mock('@/lib/services/mobile-iap-notification-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  processMobileIapLifecycleEvent: mocks.process,
  hasMobileIapReceipt: mocks.hasReceipt,
  grantMobileIapPurchaseFromStore: mocks.grant,
  recordUnattributedStoreCharge: mocks.unattributed,
}));

import { POST } from '../route';

const DAY_MS = 24 * 60 * 60 * 1000;
const subscriptionDefinition = MOBILE_IAP_PRODUCT_DEFINITIONS.find(
  (definition) => definition.kind === 'subscription',
);
if (!subscriptionDefinition) throw new Error('The catalogue declares no subscription product');
const SUBSCRIPTION = { ...subscriptionDefinition, productId: 'fixture.store.subscription' };

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    productId: SUBSCRIPTION.productId,
    transactionId: 'store-transaction-2',
    originalTransactionId: 'store-transaction-1',
    purchaseDate: Date.now() - DAY_MS,
    expiresDate: Date.now() + 29 * DAY_MS,
    appAccountToken: '33333333-3333-4333-8333-333333333333',
    ...overrides,
  };
}

function notify(
  notificationType: NotificationTypeV2,
  options: {
    subtype?: Subtype;
    transaction?: Record<string, unknown> | null;
    renewalInfo?: Record<string, unknown>;
  } = {},
) {
  mocks.verify.mockResolvedValue({
    channel: 'production',
    notification: {
      notificationUUID: `notification-${notificationType}`,
      notificationType,
      ...(options.subtype ? { subtype: options.subtype } : {}),
      data: { signedTransactionInfo: 'signed-transaction-info-fixture' },
    },
    transaction: options.transaction === null ? null : transaction(options.transaction),
    renewalInfo: options.renewalInfo ?? null,
  });
  return POST(
    new NextRequest('http://localhost/api/mobile/iap/apple-notifications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ signedPayload: 'x'.repeat(40) }),
    }),
  );
}

function lifecycleEvent(): Record<string, unknown> {
  expect(mocks.process).toHaveBeenCalledTimes(1);
  return (mocks.process.mock.calls[0]?.[0] as { event: Record<string, unknown> }).event;
}

describe('App Store server notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.product.mockReturnValue(SUBSCRIPTION);
    mocks.hasReceipt.mockReset().mockResolvedValue(true);
  });

  it('carries a renewal forward as an active entitlement to the new expiry', async () => {
    const renewedUntil = Date.now() + 30 * DAY_MS;
    const response = await notify(NotificationTypeV2.DID_RENEW, {
      transaction: { expiresDate: renewedUntil },
    });

    expect(response.status).toBe(200);
    expect(lifecycleEvent()).toMatchObject({
      platform: 'ios',
      eventType: NotificationTypeV2.DID_RENEW,
      entitlementStatus: 'active',
      cancelAtPeriodEnd: false,
      expiresAt: new Date(renewedUntil),
      storeTransactionId: 'store-transaction-2',
      originalTransactionId: 'store-transaction-1',
    });
  });

  it('keeps access to the paid-through date when auto-renew is turned off', async () => {
    await notify(NotificationTypeV2.DID_CHANGE_RENEWAL_STATUS, {
      subtype: Subtype.AUTO_RENEW_DISABLED,
    });

    expect(lifecycleEvent()).toMatchObject({
      entitlementStatus: 'active',
      cancelAtPeriodEnd: true,
    });
  });

  it('resumes renewal when auto-renew is turned back on', async () => {
    await notify(NotificationTypeV2.DID_CHANGE_RENEWAL_STATUS, {
      subtype: Subtype.AUTO_RENEW_ENABLED,
    });

    expect(lifecycleEvent()).toMatchObject({
      entitlementStatus: 'active',
      cancelAtPeriodEnd: false,
    });
  });

  it.each([
    Subtype.VOLUNTARY,
    Subtype.BILLING_RETRY,
    Subtype.PRICE_INCREASE,
    Subtype.PRODUCT_NOT_FOR_SALE,
  ])('ends the entitlement on EXPIRED %s', async (subtype) => {
    await notify(NotificationTypeV2.EXPIRED, { subtype });

    expect(lifecycleEvent()).toMatchObject({ entitlementStatus: 'expired' });
  });

  it('keeps serving through the grace period after a failed renewal', async () => {
    const graceEnd = Date.now() + 5 * DAY_MS;
    await notify(NotificationTypeV2.DID_FAIL_TO_RENEW, {
      subtype: Subtype.GRACE_PERIOD,
      transaction: { expiresDate: Date.now() - DAY_MS },
      renewalInfo: { gracePeriodExpiresDate: graceEnd },
    });

    expect(lifecycleEvent()).toMatchObject({
      entitlementStatus: 'grace',
      accessUntil: new Date(graceEnd),
    });
    expect(mocks.grant).not.toHaveBeenCalled();
  });

  it.each([NotificationTypeV2.DID_FAIL_TO_RENEW, NotificationTypeV2.GRACE_PERIOD_EXPIRED])(
    'stops serving on %s but leaves the subscription in billing retry',
    async (notificationType) => {
      await notify(notificationType, { transaction: { expiresDate: Date.now() - DAY_MS } });

      expect(lifecycleEvent()).toMatchObject({ entitlementStatus: 'on_hold' });
    },
  );

  it('restores service when billing recovers', async () => {
    await notify(NotificationTypeV2.DID_RENEW, { subtype: Subtype.BILLING_RECOVERY });

    expect(lifecycleEvent()).toMatchObject({ entitlementStatus: 'active' });
  });

  it('applies an upgrade at once with the new product', async () => {
    await notify(NotificationTypeV2.DID_CHANGE_RENEWAL_PREF, { subtype: Subtype.UPGRADE });

    expect(lifecycleEvent()).toMatchObject({
      entitlementStatus: 'active',
      product: SUBSCRIPTION,
    });
  });

  it('keeps the current plan when a downgrade is scheduled for renewal', async () => {
    await notify(NotificationTypeV2.DID_CHANGE_RENEWAL_PREF, {
      subtype: Subtype.DOWNGRADE,
      renewalInfo: { autoRenewStatus: 1, autoRenewProductId: 'fixture.store.cheaper' },
    });

    expect(lifecycleEvent()).toMatchObject({
      entitlementStatus: 'active',
      cancelAtPeriodEnd: false,
      product: SUBSCRIPTION,
    });
  });

  it('reinstates a subscription whose refund Apple reversed', async () => {
    await notify(NotificationTypeV2.REFUND_REVERSED);

    expect(lifecycleEvent()).toMatchObject({ entitlementStatus: 'active' });
  });

  it.each([
    NotificationTypeV2.PRICE_INCREASE,
    NotificationTypeV2.CONSUMPTION_REQUEST,
    NotificationTypeV2.REFUND_DECLINED,
  ])('acknowledges %s without moving the entitlement', async (notificationType) => {
    const response = await notify(notificationType);

    expect(await response.json()).toEqual({ received: true, status: 'ignored' });
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it('grants a purchase approved while the app was closed, from the notification alone', async () => {
    mocks.hasReceipt.mockResolvedValue(false);

    await notify(NotificationTypeV2.SUBSCRIBED, { subtype: Subtype.INITIAL_BUY });

    expect(mocks.grant).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        appAccountToken: '33333333-3333-4333-8333-333333333333',
        verified: expect.objectContaining({
          platform: 'ios',
          storeTransactionId: 'store-transaction-2',
          entitlementStatus: 'active',
          environment: 'production',
        }),
      }),
    );
    expect(lifecycleEvent()).toMatchObject({ entitlementStatus: 'active' });
  });

  it('does not grant a second time for a purchase the ledger already holds', async () => {
    await notify(NotificationTypeV2.SUBSCRIBED, { subtype: Subtype.INITIAL_BUY });

    expect(mocks.grant).not.toHaveBeenCalled();
  });

  it('hands a sandbox notice to the ledger marked as a test purchase, for the ledger to gate', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    mocks.hasReceipt.mockResolvedValue(false);
    mocks.verify.mockResolvedValue({
      channel: 'sandbox',
      notification: {
        notificationUUID: 'notification-sandbox',
        notificationType: NotificationTypeV2.SUBSCRIBED,
        subtype: Subtype.INITIAL_BUY,
        data: { signedTransactionInfo: 'signed-transaction-info-fixture' },
      },
      transaction: transaction(),
      renewalInfo: null,
    });

    await POST(
      new NextRequest('http://localhost/api/mobile/iap/apple-notifications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signedPayload: 'x'.repeat(40) }),
      }),
    );
    vi.unstubAllEnvs();

    expect(mocks.grant).toHaveBeenCalledWith(
      expect.objectContaining({ verified: expect.objectContaining({ environment: 'sandbox' }) }),
    );
    expect(lifecycleEvent()).toMatchObject({ environment: 'sandbox' });
  });

  it('ends an entitlement whose paid-through date has passed when a renewal is reported late', async () => {
    await notify(NotificationTypeV2.DID_RENEW, {
      transaction: { expiresDate: Date.now() - DAY_MS },
    });

    expect(lifecycleEvent()).toMatchObject({ entitlementStatus: 'expired' });
  });

  it('keeps access when auto-renew is switched off during a grace period or billing retry', async () => {
    const response = await notify(NotificationTypeV2.DID_CHANGE_RENEWAL_STATUS, {
      subtype: Subtype.AUTO_RENEW_DISABLED,
      transaction: { expiresDate: Date.now() - DAY_MS },
    });

    expect(await response.json()).toEqual({ received: true, status: 'ignored' });
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it('passes on when Apple signed the notice, so a late one cannot undo a newer choice', async () => {
    const signedDate = Date.now() - 60_000;
    mocks.verify.mockResolvedValue({
      channel: 'production',
      notification: {
        notificationUUID: 'notification-signed',
        notificationType: NotificationTypeV2.DID_CHANGE_RENEWAL_STATUS,
        subtype: Subtype.AUTO_RENEW_DISABLED,
        signedDate,
        data: { signedTransactionInfo: 'signed-transaction-info-fixture' },
      },
      transaction: transaction(),
      renewalInfo: null,
    });

    await POST(
      new NextRequest('http://localhost/api/mobile/iap/apple-notifications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signedPayload: 'x'.repeat(40) }),
      }),
    );

    expect(lifecycleEvent()).toMatchObject({
      environment: 'production',
      signedAt: new Date(signedDate),
      cancelAtPeriodEnd: true,
    });
  });

  it('marks a refund with the fraction Apple revoked', async () => {
    await notify(NotificationTypeV2.REFUND, { transaction: { revocationPercentage: 50_000 } });

    expect(lifecycleEvent()).toMatchObject({ entitlementStatus: 'refunded', refundFraction: 0.5 });
  });

  it('marks a revocation of family-shared access as revoked', async () => {
    await notify(NotificationTypeV2.REVOKE);

    expect(lifecycleEvent()).toMatchObject({ entitlementStatus: 'revoked' });
  });

  it('acknowledges a notification that carries no transaction without touching the ledger', async () => {
    const response = await notify(NotificationTypeV2.TEST, { transaction: null });

    expect(await response.json()).toEqual({ received: true, status: 'no_transaction' });
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it('refuses a transaction for a product this catalogue does not sell', async () => {
    mocks.product.mockReturnValue(null);

    const response = await notify(NotificationTypeV2.DID_RENEW);

    expect(response.status).toBe(400);
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it('refuses a transaction that charged nobody and has no account token to bind it to', async () => {
    const response = await notify(NotificationTypeV2.EXPIRED, {
      transaction: { appAccountToken: undefined, expiresDate: Date.now() - DAY_MS },
    });

    expect(response.status).toBe(400);
    expect(mocks.process).not.toHaveBeenCalled();
    expect(mocks.unattributed).not.toHaveBeenCalled();
  });

  it('records a paid renewal that names no account, and grants nothing for it', async () => {
    const response = await notify(NotificationTypeV2.DID_RENEW, {
      transaction: { appAccountToken: undefined },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'unattributed' });
    expect(mocks.unattributed).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'ios',
        reason: 'no_account_token',
        storeTransactionId: 'store-transaction-2',
        originalTransactionId: 'store-transaction-1',
      }),
    );
    expect(mocks.grant).not.toHaveBeenCalled();
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it('makes Apple retry when the record of an unattributed charge cannot be written', async () => {
    mocks.unattributed.mockRejectedValueOnce(new Error('audit log unavailable'));

    const response = await notify(NotificationTypeV2.DID_RENEW, {
      transaction: { appAccountToken: undefined },
    });

    expect(response.status).toBe(500);
  });

  it.each(['unknown_account', 'not_grantable'] as const)(
    'records a paid purchase the ledger answered %s for',
    async (grant) => {
      mocks.hasReceipt.mockResolvedValueOnce(false);
      mocks.grant.mockResolvedValueOnce(grant);

      const response = await notify(NotificationTypeV2.SUBSCRIBED);

      expect(response.status).toBe(200);
      expect(mocks.unattributed).toHaveBeenCalledWith(
        expect.objectContaining({ reason: grant, storeTransactionId: 'store-transaction-2' }),
      );
    },
  );

  it.each(['granted', 'refund_filed'] as const)(
    'records nothing more for a purchase the ledger answered %s for',
    async (grant) => {
      mocks.hasReceipt.mockResolvedValueOnce(false);
      mocks.grant.mockResolvedValueOnce(grant);

      await notify(NotificationTypeV2.SUBSCRIBED);

      expect(mocks.unattributed).not.toHaveBeenCalled();
    },
  );
});
