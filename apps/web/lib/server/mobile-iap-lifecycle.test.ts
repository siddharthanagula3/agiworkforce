import { describe, expect, it } from 'vitest';
import {
  grantsAccess,
  resolveAppleLifecycle,
  resolveGoogleSubscriptionLifecycle,
  type AppleLifecycleInput,
} from './mobile-iap-lifecycle';

const NOW = new Date('2026-10-12T00:00:00.000Z');
const PAID_THROUGH = new Date('2026-11-01T00:00:00.000Z');
const LAPSED = new Date('2026-10-01T00:00:00.000Z');
const GRACE_END = new Date('2026-10-17T00:00:00.000Z');

function apple(overrides: Partial<AppleLifecycleInput>) {
  return resolveAppleLifecycle({
    kind: 'subscription',
    notificationType: 'DID_RENEW',
    subtype: null,
    expiresAt: PAID_THROUGH,
    gracePeriodExpiresAt: null,
    autoRenewEnabled: true,
    now: NOW,
    ...overrides,
  });
}

function google(subscriptionState: string, overrides: Record<string, unknown> = {}) {
  return resolveGoogleSubscriptionLifecycle({
    subscriptionState,
    expiresAt: PAID_THROUGH,
    autoRenewEnabled: true,
    notificationType: null,
    now: NOW,
    ...overrides,
  });
}

describe('App Store subscription lifecycle', () => {
  it.each([
    ['SUBSCRIBED', 'INITIAL_BUY'],
    ['SUBSCRIBED', 'RESUBSCRIBE'],
    ['DID_RENEW', null],
    ['DID_RENEW', 'BILLING_RECOVERY'],
    ['DID_CHANGE_RENEWAL_PREF', 'UPGRADE'],
    ['DID_CHANGE_RENEWAL_PREF', 'DOWNGRADE'],
    ['DID_CHANGE_RENEWAL_PREF', null],
    ['OFFER_REDEEMED', null],
    ['RENEWAL_EXTENDED', null],
    ['REFUND_REVERSED', null],
  ])('provides service on %s %s while the period is paid', (notificationType, subtype) => {
    expect(apple({ notificationType, subtype })).toEqual({
      state: 'active',
      cancelAtPeriodEnd: false,
      accessUntil: null,
    });
  });

  it('keeps the paid period and flags the end when auto-renew is turned off', () => {
    expect(
      apple({ notificationType: 'DID_CHANGE_RENEWAL_STATUS', subtype: 'AUTO_RENEW_DISABLED' }),
    ).toMatchObject({ state: 'active', cancelAtPeriodEnd: true });
    expect(
      apple({ notificationType: 'DID_CHANGE_RENEWAL_STATUS', subtype: 'AUTO_RENEW_ENABLED' }),
    ).toMatchObject({ state: 'active', cancelAtPeriodEnd: false });
  });

  it('carries a pending cancellation through a later notice about the same period', () => {
    expect(apple({ notificationType: 'DID_RENEW', autoRenewEnabled: false })).toMatchObject({
      state: 'active',
      cancelAtPeriodEnd: true,
    });
  });

  it('keeps serving through the billing grace period Apple names', () => {
    expect(
      apple({
        notificationType: 'DID_FAIL_TO_RENEW',
        subtype: 'GRACE_PERIOD',
        expiresAt: LAPSED,
        gracePeriodExpiresAt: GRACE_END,
      }),
    ).toEqual({ state: 'grace', cancelAtPeriodEnd: false, accessUntil: GRACE_END });
  });

  it('stops serving a failed renewal that has no grace period, without ending the subscription', () => {
    expect(apple({ notificationType: 'DID_FAIL_TO_RENEW', expiresAt: LAPSED })).toMatchObject({
      state: 'on_hold',
    });
    expect(
      apple({
        notificationType: 'DID_FAIL_TO_RENEW',
        subtype: 'GRACE_PERIOD',
        expiresAt: LAPSED,
        gracePeriodExpiresAt: LAPSED,
      }),
    ).toMatchObject({ state: 'on_hold' });
    expect(apple({ notificationType: 'GRACE_PERIOD_EXPIRED', expiresAt: LAPSED })).toMatchObject({
      state: 'on_hold',
    });
  });

  it.each(['VOLUNTARY', 'BILLING_RETRY', 'PRICE_INCREASE', 'PRODUCT_NOT_FOR_SALE', null])(
    'ends on EXPIRED %s',
    (subtype) => {
      expect(apple({ notificationType: 'EXPIRED', subtype, expiresAt: LAPSED })).toMatchObject({
        state: 'expired',
      });
    },
  );

  it('ends on a refund and on a Family Sharing revocation', () => {
    expect(apple({ notificationType: 'REFUND' })).toMatchObject({ state: 'refunded' });
    expect(apple({ notificationType: 'REVOKE' })).toMatchObject({ state: 'revoked' });
  });

  it('never revives a lapsed period, whatever the notification is called', () => {
    for (const notificationType of ['DID_RENEW', 'REFUND_REVERSED']) {
      expect(apple({ notificationType, expiresAt: LAPSED })).toMatchObject({ state: 'expired' });
    }
  });

  it.each([
    ['DID_CHANGE_RENEWAL_STATUS', 'AUTO_RENEW_DISABLED'],
    ['DID_CHANGE_RENEWAL_STATUS', 'AUTO_RENEW_ENABLED'],
    ['DID_CHANGE_RENEWAL_PREF', 'DOWNGRADE'],
    ['DID_CHANGE_RENEWAL_PREF', null],
    ['OFFER_REDEEMED', null],
  ])(
    'neither ends nor revives access on %s (%s) during a grace period or billing retry',
    (notificationType, subtype) => {
      expect(apple({ notificationType, subtype, expiresAt: LAPSED })).toBeNull();
    },
  );

  it.each([
    'PRICE_INCREASE',
    'CONSUMPTION_REQUEST',
    'REFUND_DECLINED',
    'RENEWAL_EXTENSION',
    'TEST',
    'EXTERNAL_PURCHASE_TOKEN',
    'ONE_TIME_CHARGE',
    'SOMETHING_APPLE_ADDS_LATER',
  ])('leaves the entitlement alone on %s', (notificationType) => {
    expect(apple({ notificationType })).toBeNull();
  });
});

describe('App Store consumable lifecycle', () => {
  it.each([
    ['ONE_TIME_CHARGE', 'active'],
    ['REFUND', 'refunded'],
    ['REVOKE', 'revoked'],
    ['REFUND_REVERSED', 'restored'],
  ])('maps %s to %s', (notificationType, state) => {
    expect(apple({ kind: 'top_up', notificationType, expiresAt: null })).toMatchObject({ state });
  });

  it('ignores subscription notices that name a consumable', () => {
    expect(apple({ kind: 'top_up', notificationType: 'DID_RENEW', expiresAt: null })).toBeNull();
  });
});

describe('Google Play subscription lifecycle', () => {
  it('serves an active subscription and flags one that will not renew', () => {
    expect(google('SUBSCRIPTION_STATE_ACTIVE')).toMatchObject({
      state: 'active',
      cancelAtPeriodEnd: false,
    });
    expect(google('SUBSCRIPTION_STATE_ACTIVE', { autoRenewEnabled: false })).toMatchObject({
      state: 'active',
      cancelAtPeriodEnd: true,
    });
  });

  it('serves a canceled subscription only until the time already paid for runs out', () => {
    expect(google('SUBSCRIPTION_STATE_CANCELED')).toMatchObject({
      state: 'active',
      cancelAtPeriodEnd: true,
    });
    expect(google('SUBSCRIPTION_STATE_CANCELED', { expiresAt: LAPSED })).toMatchObject({
      state: 'expired',
    });
  });

  it('serves through the grace period to the expiry Play extends', () => {
    expect(google('SUBSCRIPTION_STATE_IN_GRACE_PERIOD', { expiresAt: GRACE_END })).toEqual({
      state: 'grace',
      cancelAtPeriodEnd: false,
      accessUntil: GRACE_END,
    });
  });

  it('blocks account hold and pause without ending the subscription', () => {
    expect(google('SUBSCRIPTION_STATE_ON_HOLD', { expiresAt: LAPSED })).toMatchObject({
      state: 'on_hold',
    });
    expect(google('SUBSCRIPTION_STATE_PAUSED', { expiresAt: LAPSED })).toMatchObject({
      state: 'paused',
    });
  });

  it('tells an expiry from a revocation by the notice that reported it', () => {
    expect(google('SUBSCRIPTION_STATE_EXPIRED', { expiresAt: LAPSED })).toMatchObject({
      state: 'expired',
    });
    expect(
      google('SUBSCRIPTION_STATE_EXPIRED', { expiresAt: LAPSED, notificationType: 12 }),
    ).toMatchObject({ state: 'revoked' });
  });

  it.each([
    'SUBSCRIPTION_STATE_PENDING',
    'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED',
    'SUBSCRIPTION_STATE_UNSPECIFIED',
  ])('grants nothing for %s', (state) => {
    expect(google(state)).toBeNull();
  });
});

describe('access', () => {
  it('is granted only while active or in grace', () => {
    expect(
      (
        [
          'active',
          'grace',
          'on_hold',
          'paused',
          'expired',
          'revoked',
          'refunded',
          'restored',
        ] as const
      ).filter(grantsAccess),
    ).toEqual(['active', 'grace']);
  });
});
