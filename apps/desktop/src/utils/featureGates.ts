import { getPlanById, GRACE_PERIOD_DAYS } from '../constants/pricing';
import type { SubscriptionInfo, UsageStats } from '../services/stripe';

export type FeatureId =
  | 'unlimited_automations'
  | 'browser_automation'
  | 'advanced_ui_automation'
  | 'email_support'
  | 'priority_support'
  | 'custom_workflows'
  | 'webhook_integration'
  | 'team_features'
  | 'sso'
  | 'analytics'
  | 'llm_cost_tracking';

export interface FeatureCheckResult {
  allowed: boolean;
  reason?: string;
  upgradeRequired?: boolean;
  suggestedPlan?: string;
}

export interface UsageLimitCheckResult {
  withinLimit: boolean;
  currentUsage: number;
  limit: number | null;
  percentageUsed: number;
  reason?: string;
}

export function checkFeatureAccess(
  feature: FeatureId,
  subscription?: SubscriptionInfo | null,
): FeatureCheckResult {
  const planName = (subscription?.plan_name || 'free').toLowerCase();

  if (planName === 'free' || planName === 'none') {
    const restrictedFeatures: FeatureId[] = [
      'unlimited_automations',
      'browser_automation',
      'advanced_ui_automation',
      'email_support',
      'priority_support',
      'custom_workflows',
      'webhook_integration',
      'team_features',
      'sso',
      'analytics',
      'llm_cost_tracking',
    ];

    if (restrictedFeatures.includes(feature)) {
      return {
        allowed: false,
        reason: `This feature requires a Hobby subscription or higher`,
        upgradeRequired: true,
        suggestedPlan: 'hobby',
      };
    }

    return { allowed: true };
  }

  switch (feature) {
    case 'unlimited_automations':
    case 'browser_automation':
    case 'advanced_ui_automation':
    case 'email_support':
    case 'llm_cost_tracking':
      // 'team' is not a canonical PlanTier (per supabase.ts:198 and billing/models.rs).
      // If a 'team' tier is ever added, update PlanTier in supabase.ts, subscriptionGate.ts,
      // and Rust billing/models.rs simultaneously.
      return ['hobby', 'pro', 'pro_plus', 'max', 'enterprise'].includes(planName)
        ? { allowed: true }
        : {
            allowed: false,
            reason: 'Upgrade to Hobby to access this feature',
            upgradeRequired: true,
            suggestedPlan: 'hobby',
          };

    case 'priority_support':
    case 'custom_workflows':
    case 'webhook_integration':
    case 'analytics':
      return ['max', 'enterprise'].includes(planName)
        ? { allowed: true }
        : {
            allowed: false,
            reason: 'Upgrade to Max to access this feature',
            upgradeRequired: true,
            suggestedPlan: 'max',
          };

    case 'team_features':
    case 'sso':
      // team_features and sso are enterprise-only until a 'team' tier is formally added
      // to the canonical PlanTier taxonomy.
      return ['enterprise'].includes(planName)
        ? { allowed: true }
        : {
            allowed: false,
            reason: 'Upgrade to Enterprise to access this feature',
            upgradeRequired: true,
            suggestedPlan: 'enterprise',
          };

    default:
      return { allowed: true };
  }
}

export function checkUsageLimit(
  usageType: 'automations' | 'apiCalls' | 'storage' | 'tokenCredits',
  currentUsage: number,
  subscription?: SubscriptionInfo | null,
): UsageLimitCheckResult {
  const planName = subscription?.plan_name || 'free';
  const plan = getPlanById(planName);

  if (!plan) {
    return {
      withinLimit: false,
      currentUsage,
      limit: 0,
      percentageUsed: 100,
      reason: 'Unknown subscription plan',
    };
  }

  let limit: number | null = null;

  switch (usageType) {
    case 'automations':
      limit = plan.limits.automations;
      break;
    case 'apiCalls':
      limit = plan.limits.apiCalls;
      break;
    case 'storage':
      limit = plan.limits.storage;
      break;
    case 'tokenCredits':
      limit = plan.limits.tokenCredits;
      // If limit is 0 (Free plan), it effectively means no credits.
      if (limit === 0 && plan.id === 'free') {
        // Free plan might imply "Local only", so strictly no cloud tokens.
        // But strict limit of 0.
      }
      break;
  }

  if (limit === null) {
    return {
      withinLimit: true,
      currentUsage,
      limit: null,
      percentageUsed: 0,
    };
  }

  const withinLimit = currentUsage < limit;
  // Handle edge case where limit is 0 to avoid division by zero if needed, though JS handles it as Infinity
  const percentageUsed =
    limit === 0 ? (currentUsage > 0 ? 100 : 0) : Math.min(100, (currentUsage / limit) * 100);

  return {
    withinLimit,
    currentUsage,
    limit,
    percentageUsed,
    reason: withinLimit
      ? undefined
      : `You've reached your ${usageType === 'tokenCredits' ? 'token credit' : usageType} limit. Upgrade to increase your limits.`,
  };
}

export function isSubscriptionActive(subscription: SubscriptionInfo | null): boolean {
  if (!subscription) return false;

  const now = Math.floor(Date.now() / 1000);

  const activeStatuses = ['active', 'trialing'];
  if (!activeStatuses.includes(subscription.status)) {
    return false;
  }

  if (subscription.current_period_end < now) {
    return false;
  }

  return true;
}

export function isInGracePeriod(subscription: SubscriptionInfo | null): boolean {
  if (!subscription) return false;

  const now = Math.floor(Date.now() / 1000);
  const gracePeriodEnd = subscription.current_period_end + GRACE_PERIOD_DAYS * 24 * 60 * 60;

  return (
    subscription.status === 'past_due' &&
    subscription.current_period_end < now &&
    now < gracePeriodEnd
  );
}

export function getGracePeriodDaysRemaining(subscription: SubscriptionInfo | null): number {
  if (!subscription || !isInGracePeriod(subscription)) {
    return 0;
  }

  const now = Math.floor(Date.now() / 1000);
  const gracePeriodEnd = subscription.current_period_end + GRACE_PERIOD_DAYS * 24 * 60 * 60;
  const secondsRemaining = gracePeriodEnd - now;

  return Math.ceil(secondsRemaining / (24 * 60 * 60));
}

export function getDaysUntilRenewal(subscription: SubscriptionInfo | null): number {
  if (!subscription) return 0;

  const now = Math.floor(Date.now() / 1000);
  const secondsUntilRenewal = subscription.current_period_end - now;

  if (secondsUntilRenewal < 0) return 0;

  return Math.ceil(secondsUntilRenewal / (24 * 60 * 60));
}

export function shouldShowUsageWarning(
  usageType: 'automations' | 'apiCalls' | 'storage' | 'tokenCredits',
  currentUsage: number,
  subscription?: SubscriptionInfo | null,
): boolean {
  const limitCheck = checkUsageLimit(usageType, currentUsage, subscription);

  if (limitCheck.limit === null) return false;

  return limitCheck.percentageUsed >= 90;
}

export function getRecommendedUpgrade(usage: UsageStats, currentPlan: string): string | null {
  const plan = getPlanById(currentPlan);
  if (!plan) return null;

  if (currentPlan === 'free') {
    if (
      (plan.limits.automations && usage.automations_executed >= plan.limits.automations * 0.9) ||
      (plan.limits.apiCalls && usage.api_calls_made >= plan.limits.apiCalls * 0.9)
    ) {
      return 'pro';
    }
  }

  if (currentPlan === 'pro') {
    if (
      (plan.limits.apiCalls && usage.api_calls_made >= plan.limits.apiCalls * 0.9) ||
      (plan.limits.storage && usage.storage_used_mb >= plan.limits.storage * 0.9)
    ) {
      return 'max';
    }
  }

  return null;
}

export function formatUsage(value: number, type: 'automations' | 'apiCalls' | 'storage'): string {
  if (type === 'storage') {
    const gb = value / 1024;
    return `${gb.toFixed(2)} GB`;
  }

  return value.toLocaleString();
}

export function formatLimit(
  limit: number | null,
  type: 'automations' | 'apiCalls' | 'storage',
): string {
  if (limit === null) return 'Unlimited';

  if (type === 'storage') {
    const gb = limit / 1024;
    return `${gb} GB`;
  }

  return limit.toLocaleString();
}
