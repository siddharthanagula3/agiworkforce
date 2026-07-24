/**
 * Subscription entitlement is a function of both the recorded plan and its
 * billing status. Stripe rows can retain a paid plan after cancellation, so
 * product capabilities must never be unlocked from the raw plan alone.
 */

export const ENTITLED_SUBSCRIPTION_STATUSES = ['active', 'trialing'] as const;

export function isEntitledSubscriptionStatus(status: string | null | undefined): boolean {
  return (
    typeof status === 'string' &&
    (ENTITLED_SUBSCRIPTION_STATUSES as readonly string[]).includes(status.toLowerCase())
  );
}

export function effectivePlanTier(
  planTier: string | null | undefined,
  status: string | null | undefined,
): string {
  return isEntitledSubscriptionStatus(status) ? planTier || 'free' : 'free';
}
