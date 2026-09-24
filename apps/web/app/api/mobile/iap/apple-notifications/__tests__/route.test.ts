import { NotificationTypeV2, Subtype } from '@apple/app-store-server-library';
import { MOBILE_IAP_PRODUCT_DEFINITIONS } from '@agiworkforce/types';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  process: vi.fn(async (_input: unknown) => 'applied'),
  product: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/neon-db')>()),
  getNeonDb: () => ({ query: vi.fn(async () => []) }),
}));
vi.mock('@/lib/server/mobile-iap-store-verification', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/mobile-iap-store-verification')>()),
  verifyAppleStoreNotification: mocks.verify,
}));
vi.mock('@/lib/server/mobile-iap-catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/mobile-iap-catalog')>()),
  resolveMobileIapProduct: mocks.product,
}));
vi.mock('@/lib/services/mobile-iap-notification-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/mobile-iap-notification-service')>()),
  processMobileIapLifecycleEvent: mocks.process,
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
  options: { subtype?: Subtype; transaction?: Record<string, unknown> | null } = {},
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

  it.each([NotificationTypeV2.EXPIRED, NotificationTypeV2.GRACE_PERIOD_EXPIRED])(
    'ends the entitlement on %s',
    async (notificationType) => {
      await notify(notificationType);

      expect(lifecycleEvent()).toMatchObject({ entitlementStatus: 'expired' });
    },
  );

  it('ends an entitlement whose paid-through date has passed, whatever the notification says', async () => {
    await notify(NotificationTypeV2.DID_CHANGE_RENEWAL_STATUS, {
      subtype: Subtype.AUTO_RENEW_DISABLED,
      transaction: { expiresDate: Date.now() - DAY_MS },
    });

    expect(lifecycleEvent()).toMatchObject({ entitlementStatus: 'expired' });
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

  it('refuses a transaction with no account token to bind it to', async () => {
    const response = await notify(NotificationTypeV2.DID_RENEW, {
      transaction: { appAccountToken: undefined },
    });

    expect(response.status).toBe(400);
    expect(mocks.process).not.toHaveBeenCalled();
  });
});
