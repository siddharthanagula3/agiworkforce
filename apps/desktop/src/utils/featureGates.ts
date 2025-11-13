/**
 * Feature gates and subscription limit enforcement
 */

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
  limit: number | null; // null = unlimited
  percentageUsed: number;
  reason?: string;
}

/**
 * Check if a feature is available for the current subscription plan
 */
export function checkFeatureAccess(
  feature: FeatureId,
  subscription?: SubscriptionInfo | null
): FeatureCheckResult {
  // Free tier or no subscription
  if (!subscription || subscription.plan_name === 'free') {
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
        reason: `This feature requires a Pro subscription or higher`,
        upgradeRequired: true,
        suggestedPlan: 'pro',
      };
    }

    return { allowed: true };
  }

  const planName = subscription.plan_name.toLowerCase();

  // Check feature availability based on plan
  switch (feature) {
    case 'unlimited_automations':
    case 'browser_automation':
    case 'advanced_ui_automation':
    case 'email_support':
    case 'llm_cost_tracking':
      return planName !== 'free' ? { allowed: true } : {
        allowed: false,
        reason: 'Upgrade to Pro to access this feature',
        upgradeRequired: true,
        suggestedPlan: 'pro',
      };

    case 'priority_support':
    case 'custom_workflows':
    case 'webhook_integration':
    case 'analytics':
      return ['proplus', 'team', 'enterprise'].includes(planName)
        ? { allowed: true }
        : {
            allowed: false,
            reason: 'Upgrade to Pro+ to access this feature',
            upgradeRequired: true,
            suggestedPlan: 'proplus',
          };

    case 'team_features':
    case 'sso':
      return ['team', 'enterprise'].includes(planName)
        ? { allowed: true }
        : {
            allowed: false,
            reason: 'Upgrade to Team to access this feature',
            upgradeRequired: true,
            suggestedPlan: 'team',
          };

    default:
      return { allowed: true };
  }
}

/**
 * Check if usage is within limits for the current subscription
 */
export function checkUsageLimit(
  usageType: 'automations' | 'apiCalls' | 'storage',
  currentUsage: number,
  subscription?: SubscriptionInfo | null
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
  }

  // Unlimited
  if (limit === null) {
    return {
      withinLimit: true,
      currentUsage,
      limit: null,
      percentageUsed: 0,
    };
  }

  const withinLimit = currentUsage < limit;
  const percentageUsed = Math.min(100, (currentUsage / limit) * 100);

  return {
    withinLimit,
    currentUsage,
    limit,
    percentageUsed,
    reason: withinLimit ? undefined : `You've reached your ${usageType} limit. Upgrade to increase your limits.`,
  };
}

/**
 * Check if subscription is active and not expired
 */
export function isSubscriptionActive(subscription: SubscriptionInfo | null): boolean {
  if (!subscription) return false;

  const now = Math.floor(Date.now() / 1000);

  // Check if subscription is in an active status
  const activeStatuses = ['active', 'trialing'];
  if (!activeStatuses.includes(subscription.status)) {
    return false;
  }

  // Check if subscription is not expired
  if (subscription.current_period_end < now) {
    return false;
  }

  return true;
}

/**
 * Check if subscription is in grace period (expired but still functional)
 */
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

/**
 * Get days remaining in grace period
 */
export function getGracePeriodDaysRemaining(subscription: SubscriptionInfo | null): number {
  if (!subscription || !isInGracePeriod(subscription)) {
    return 0;
  }

  const now = Math.floor(Date.now() / 1000);
  const gracePeriodEnd = subscription.current_period_end + GRACE_PERIOD_DAYS * 24 * 60 * 60;
  const secondsRemaining = gracePeriodEnd - now;

  return Math.ceil(secondsRemaining / (24 * 60 * 60));
}

/**
 * Get days remaining until subscription renewal
 */
export function getDaysUntilRenewal(subscription: SubscriptionInfo | null): number {
  if (!subscription) return 0;

  const now = Math.floor(Date.now() / 1000);
  const secondsUntilRenewal = subscription.current_period_end - now;

  if (secondsUntilRenewal < 0) return 0;

  return Math.ceil(secondsUntilRenewal / (24 * 60 * 60));
}

/**
 * Check if user should see usage warning (>90% of limit)
 */
export function shouldShowUsageWarning(
  usageType: 'automations' | 'apiCalls' | 'storage',
  currentUsage: number,
  subscription?: SubscriptionInfo | null
): boolean {
  const limitCheck = checkUsageLimit(usageType, currentUsage, subscription);

  if (limitCheck.limit === null) return false; // Unlimited

  return limitCheck.percentageUsed >= 90;
}

/**
 * Get recommended upgrade plan based on current usage
 */
export function getRecommendedUpgrade(
  usage: UsageStats,
  currentPlan: string
): string | null {
  const plan = getPlanById(currentPlan);
  if (!plan) return null;

  // Free tier: recommend Pro if close to limits
  if (currentPlan === 'free') {
    if (
      (plan.limits.automations && usage.automations_executed >= plan.limits.automations * 0.9) ||
      (plan.limits.apiCalls && usage.api_calls_made >= plan.limits.apiCalls * 0.9)
    ) {
      return 'pro';
    }
  }

  // Pro tier: recommend Pro+ if exceeding limits
  if (currentPlan === 'pro') {
    if (
      (plan.limits.apiCalls && usage.api_calls_made >= plan.limits.apiCalls * 0.9) ||
      (plan.limits.storage && usage.storage_used_mb >= plan.limits.storage * 0.9)
    ) {
      return 'proplus';
    }
  }

  return null;
}

/**
 * Format usage for display
 */
export function formatUsage(value: number, type: 'automations' | 'apiCalls' | 'storage'): string {
  if (type === 'storage') {
    // Convert MB to GB for display
    const gb = value / 1024;
    return `${gb.toFixed(2)} GB`;
  }

  return value.toLocaleString();
}

/**
 * Format limit for display
 */
export function formatLimit(
  limit: number | null,
  type: 'automations' | 'apiCalls' | 'storage'
): string {
  if (limit === null) return 'Unlimited';

  if (type === 'storage') {
    const gb = limit / 1024;
    return `${gb} GB`;
  }

  return limit.toLocaleString();
}
