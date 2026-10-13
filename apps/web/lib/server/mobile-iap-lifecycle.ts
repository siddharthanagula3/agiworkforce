import type { MobileIapProductKind } from '@agiworkforce/types';

export type MobileIapEntitlementState =
  'active' | 'grace' | 'on_hold' | 'paused' | 'expired' | 'revoked' | 'refunded' | 'restored';

export interface MobileIapLifecycleDecision {
  state: MobileIapEntitlementState;
  cancelAtPeriodEnd: boolean;
  accessUntil: Date | null;
}

export interface AppleLifecycleInput {
  kind: MobileIapProductKind;
  notificationType: string;
  subtype: string | null;
  expiresAt: Date | null;
  gracePeriodExpiresAt: Date | null;
  autoRenewEnabled: boolean | null;
  now: Date;
}

const APPLE_SUBSCRIPTION_ACCESS_TYPES = new Set([
  'SUBSCRIBED',
  'DID_RENEW',
  'DID_CHANGE_RENEWAL_PREF',
  'DID_CHANGE_RENEWAL_STATUS',
  'OFFER_REDEEMED',
  'RENEWAL_EXTENDED',
  'REFUND_REVERSED',
]);

// These report a choice the customer made, not a payment. During a billing grace
// period or retry the transaction they carry has already passed its expiry while
// Apple still says to keep access, so on their own they never end it.
const APPLE_SUBSCRIPTION_CHOICE_TYPES = new Set([
  'DID_CHANGE_RENEWAL_PREF',
  'DID_CHANGE_RENEWAL_STATUS',
  'OFFER_REDEEMED',
]);

function decision(
  state: MobileIapEntitlementState,
  cancelAtPeriodEnd = false,
  accessUntil: Date | null = null,
): MobileIapLifecycleDecision {
  return { state, cancelAtPeriodEnd, accessUntil };
}

export function resolveAppleLifecycle(
  input: AppleLifecycleInput,
): MobileIapLifecycleDecision | null {
  const { notificationType, subtype } = input;

  if (input.kind === 'top_up') {
    if (notificationType === 'ONE_TIME_CHARGE') return decision('active');
    if (notificationType === 'REFUND') return decision('refunded');
    if (notificationType === 'REVOKE') return decision('revoked');
    if (notificationType === 'REFUND_REVERSED') return decision('restored');
    return null;
  }

  if (notificationType === 'REFUND') return decision('refunded', true);
  if (notificationType === 'REVOKE') return decision('revoked', true);
  if (notificationType === 'EXPIRED') return decision('expired', true);
  if (notificationType === 'GRACE_PERIOD_EXPIRED') return decision('on_hold');
  if (notificationType === 'DID_FAIL_TO_RENEW') {
    const graceEndsAt = input.gracePeriodExpiresAt;
    return subtype === 'GRACE_PERIOD' && graceEndsAt && graceEndsAt.getTime() > input.now.getTime()
      ? decision('grace', false, graceEndsAt)
      : decision('on_hold');
  }
  if (!APPLE_SUBSCRIPTION_ACCESS_TYPES.has(notificationType)) return null;

  const cancelAtPeriodEnd =
    notificationType === 'DID_CHANGE_RENEWAL_STATUS'
      ? subtype === 'AUTO_RENEW_DISABLED'
      : input.autoRenewEnabled === false;
  const paidThrough = input.expiresAt !== null && input.expiresAt.getTime() > input.now.getTime();
  if (paidThrough) return decision('active', cancelAtPeriodEnd);
  return APPLE_SUBSCRIPTION_CHOICE_TYPES.has(notificationType) ? null : decision('expired', true);
}

export const GOOGLE_SUBSCRIPTION_REVOKED_NOTIFICATION = 12;

export interface GoogleSubscriptionLifecycleInput {
  subscriptionState: string;
  expiresAt: Date;
  autoRenewEnabled: boolean | null;
  notificationType: number | null;
  now: Date;
}

export function resolveGoogleSubscriptionLifecycle(
  input: GoogleSubscriptionLifecycleInput,
): MobileIapLifecycleDecision | null {
  const paidThrough = input.expiresAt.getTime() > input.now.getTime();
  switch (input.subscriptionState) {
    case 'SUBSCRIPTION_STATE_ACTIVE':
      return paidThrough
        ? decision('active', input.autoRenewEnabled === false)
        : decision('expired', true);
    case 'SUBSCRIPTION_STATE_CANCELED':
      return paidThrough ? decision('active', true) : decision('expired', true);
    case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD':
      return paidThrough ? decision('grace', false, input.expiresAt) : decision('on_hold');
    case 'SUBSCRIPTION_STATE_ON_HOLD':
      return decision('on_hold');
    case 'SUBSCRIPTION_STATE_PAUSED':
      return decision('paused');
    case 'SUBSCRIPTION_STATE_EXPIRED':
      return input.notificationType === GOOGLE_SUBSCRIPTION_REVOKED_NOTIFICATION
        ? decision('revoked', true)
        : decision('expired', true);
    default:
      return null;
  }
}

export function grantsAccess(state: MobileIapEntitlementState): boolean {
  return state === 'active' || state === 'grace';
}
