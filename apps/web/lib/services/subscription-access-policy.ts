import {
  isEntitledSubscriptionStatus,
  isEntitledSubscriptionStatusForTier,
} from '@agiworkforce/types';

const ENTERPRISE_PLAN_TIER = 'enterprise';

export const CHARGEBACK_STORED_STATUS = 'past_due';

export type SubscriptionAccessRank = 0 | 1 | 2;

export interface SubscriptionLadderState {
  status: string;
  rank: SubscriptionAccessRank;
}

export const SUBSCRIPTION_STATE_LADDER: readonly SubscriptionLadderState[] = [
  { status: 'active', rank: 2 },
  { status: 'trialing', rank: 2 },
  { status: 'incomplete', rank: 1 },
  { status: 'past_due', rank: 1 },
  { status: 'unpaid', rank: 0 },
  { status: 'paused', rank: 0 },
  { status: 'canceled', rank: 0 },
  { status: 'cancelled', rank: 0 },
  { status: 'expired', rank: 0 },
  { status: 'incomplete_expired', rank: 0 },
  { status: 'none', rank: 0 },
];

const RANK_BY_STATUS = new Map(
  SUBSCRIPTION_STATE_LADDER.map((state) => [state.status, state.rank] as const),
);

export interface SubscriptionAccess {
  rank: SubscriptionAccessRank;
  effectivePlanTier: string;
  managedExecution: boolean;
  planFeatures: boolean;
  purchasedCreditSpend: boolean;
  planChange: boolean;
}

function normalize(status: string | null | undefined): string {
  return (status ?? '').trim().toLowerCase();
}

export function subscriptionAccessRank(status: string | null | undefined): SubscriptionAccessRank {
  return RANK_BY_STATUS.get(normalize(status)) ?? 0;
}

export interface EnterpriseCollectionAccessState {
  readOnly: boolean;
}

export function resolveSubscriptionAccess(
  status: string | null | undefined,
  planTier: string | null | undefined,
  enterpriseCollection?: EnterpriseCollectionAccessState,
): SubscriptionAccess {
  const normalized = normalize(status);
  const normalizedTier = normalize(planTier);
  const entitled =
    normalizedTier === ENTERPRISE_PLAN_TIER && enterpriseCollection
      ? isEntitledSubscriptionStatusForTier(
          normalizedTier,
          normalized,
          enterpriseCollection.readOnly,
        )
      : subscriptionAccessRank(normalized) === 2 && isEntitledSubscriptionStatus(normalized);

  return {
    rank: subscriptionAccessRank(normalized),
    effectivePlanTier: entitled ? planTier || 'free' : 'free',
    managedExecution: entitled,
    planFeatures: entitled,
    purchasedCreditSpend: entitled,
    planChange: entitled,
  };
}

export function hasLiveBillingRelationship(status: string | null | undefined): boolean {
  return subscriptionAccessRank(status) >= 1;
}

export function isMonotonicSubscriptionTransition(
  from: string | null | undefined,
  to: string | null | undefined,
): boolean {
  return subscriptionAccessRank(to) <= subscriptionAccessRank(from);
}
