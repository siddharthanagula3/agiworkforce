import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { queryKeys } from '@shared/stores/query-client';
import { getAuthToken } from '@shared/lib/get-auth-token';
import { useAuthStore } from '@shared/stores/authentication-store';
import { logger } from '@shared/lib/logger';
import {
  normalizeUsagePercentage,
  normalizeBillingPlanTier,
  isFreeBillingPlanTier,
  type ManagedUsageSummaryResponse,
} from '@agiworkforce/types';
import { getBillingPlanDisplay } from '@features/billing/lib/plan-display';
import { isValidPlan, type PlanTier } from '@features/billing/components/Billing/types';

export type BillingPlan = PlanTier;

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'canceled'
  | 'past_due'
  | 'unpaid'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused'
  | 'none';

export interface BillingInfo {
  plan: BillingPlan;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  price: number | null;
  currency: string | null;
  features: string[];
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  usage: BillingUsage;
}

export interface BillingUsage {
  usedPercent: number;
}

type UsageApiResponse = ManagedUsageSummaryResponse;

const SUBSCRIPTION_STATUSES = new Set<SubscriptionStatus>([
  'active',
  'trialing',
  'canceled',
  'past_due',
  'unpaid',
  'incomplete',
  'incomplete_expired',
  'paused',
  'none',
]);

function normalizeManagedBillingPlan(plan: string): BillingPlan {
  const normalized = normalizeBillingPlanTier(plan);
  return isValidPlan(normalized) ? normalized : 'free';
}

function normalizeSubscriptionStatus(status: string): SubscriptionStatus {
  const normalized = status.toLowerCase() === 'cancelled' ? 'canceled' : status.toLowerCase();
  return SUBSCRIPTION_STATUSES.has(normalized as SubscriptionStatus)
    ? (normalized as SubscriptionStatus)
    : 'none';
}

export function buildBillingInfoFromUsage(data: UsageApiResponse): BillingInfo {
  const plan = normalizeManagedBillingPlan(data.plan_tier);
  const usedPercent = normalizeUsagePercentage(data.usage_percentage);
  return {
    plan,
    status: normalizeSubscriptionStatus(data.subscription_status),
    current_period_start: data.period_start,
    current_period_end: data.period_end,
    price: isFreeBillingPlanTier(plan) ? 0 : null,
    currency: null,
    features: getBillingPlanDisplay(plan).features,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    usage: {
      usedPercent,
    },
  };
}

async function fetchUsageSummary(): Promise<UsageApiResponse | null> {
  const token = await getAuthToken();
  if (!token) return null;
  try {
    const res = await fetch('/api/usage', {
      headers: { Authorization: `Bearer ${token}` },
      // The upgrade flow polls this within seconds of the previous read, waiting
      // for a webhook to move plan_tier. A cache hit there returns the plan the
      // user just paid to leave.
      cache: 'no-store',
    });
    if (!res.ok) {
      logger.warn('[BillingQuery] /api/usage returned', res.status);
      return null;
    }
    return (await res.json()) as UsageApiResponse;
  } catch (err) {
    logger.error('[BillingQuery] fetchUsageSummary error:', err);
    return null;
  }
}

/**
 * Main billing data query hook
 * Fetches complete billing information including plan and managed-usage status.
 *
 * @returns UseQueryResult with BillingInfo data or null
 */
export function useBillingData(): UseQueryResult<BillingInfo | null, Error> {
  const { user } = useAuthStore();

  return useQuery<BillingInfo | null, Error>({
    queryKey: queryKeys.billing.plan(user?.id ?? ''),
    queryFn: async (): Promise<BillingInfo | null> => {
      if (!user?.id) return null;

      const usage = await fetchUsageSummary();
      return usage ? buildBillingInfoFromUsage(usage) : null;
    },
    enabled: !!user?.id,
    // Zero, not "billing changes infrequently". Every upgrade path that leaves
    // the app, 3DS authentication, the Stripe portal, Checkout, returns within
    // seconds, and refetchOnWindowFocus does nothing while the data is still
    // fresh. A stale window here renders the plan the user just paid to leave.
    // gcTime is kept so the cached plan still paints instantly while it
    // revalidates.
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: true,
    meta: {
      errorMessage: 'Failed to load billing information',
    },
  });
}
