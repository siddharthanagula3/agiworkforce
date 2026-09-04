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

const ENTERPRISE_PLAN_TIER = 'enterprise';
const PAST_DUE_SUBSCRIPTION_STATUS = 'past_due';

export function isEntitledEnterpriseSubscriptionStatus(
  status: string | null | undefined,
  collectionReadOnly: boolean,
): boolean {
  const normalized = (status ?? '').trim().toLowerCase();
  if (normalized === PAST_DUE_SUBSCRIPTION_STATUS) return !collectionReadOnly;
  return isEntitledSubscriptionStatus(normalized);
}

export function isEntitledSubscriptionStatusForTier(
  planTier: string | null | undefined,
  status: string | null | undefined,
  collectionReadOnly: boolean,
): boolean {
  const normalizedTier = (planTier ?? '').trim().toLowerCase();
  if (normalizedTier === ENTERPRISE_PLAN_TIER) {
    return isEntitledEnterpriseSubscriptionStatus(status, collectionReadOnly);
  }
  return isEntitledSubscriptionStatus(status);
}
