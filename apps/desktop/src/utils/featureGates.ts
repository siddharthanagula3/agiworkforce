import { getPlanById, GRACE_PERIOD_DAYS } from '../constants/pricing';
import type { SubscriptionInfo, UsageStats } from '../types/billing';
import { asPlanTier } from '../lib/cloudAccountTypes';
import { PLAN_FEATURES, type PlanFeatures } from '../constants/planFeatures';
import { effectivePlanTier } from '@agiworkforce/types';

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

const FEATURE_PLAN_KEYS: Readonly<
  Record<Exclude<FeatureId, 'unlimited_automations'>, keyof PlanFeatures>
> = {
  browser_automation: 'browserAutomation',
  advanced_ui_automation: 'advancedUiAutomation',
  email_support: 'emailSupport',
  priority_support: 'prioritySupport',
  custom_workflows: 'customWorkflows',
  webhook_integration: 'webhookIntegration',
  team_features: 'teamFeatures',
  sso: 'sso',
  analytics: 'analytics',
  llm_cost_tracking: 'llmCostTracking',
};

function suggestedPlanForFeature(feature: FeatureId): 'pro' | 'max' | 'team' | 'enterprise' {
  if (feature === 'team_features') return 'team';
  if (feature === 'sso') return 'enterprise';
  if (
    feature === 'priority_support' ||
    feature === 'custom_workflows' ||
    feature === 'webhook_integration' ||
    feature === 'analytics'
  ) {
    return 'max';
  }
  return 'pro';
}

export function checkFeatureAccess(
  feature: FeatureId,
  subscription?: SubscriptionInfo | null,
): FeatureCheckResult {
  const features =
    PLAN_FEATURES[asPlanTier(effectivePlanTier(subscription?.plan_name, subscription?.status))];
  const allowed =
    feature === 'unlimited_automations'
      ? features.automationsPerDay === 'unlimited'
      : Boolean(features[FEATURE_PLAN_KEYS[feature]]);
  if (allowed) return { allowed: true };

  const suggestedPlan = suggestedPlanForFeature(feature);
  return {
    allowed: false,
    reason: `Upgrade to ${suggestedPlan === 'team' ? 'Team' : suggestedPlan[0]!.toUpperCase() + suggestedPlan.slice(1)} to access this feature`,
    upgradeRequired: true,
    suggestedPlan,
  };
}

export function checkUsageLimit(
  usageType: 'automations' | 'apiCalls' | 'storage' | 'tokenCredits',
  currentUsage: number,
  subscription?: SubscriptionInfo | null,
): UsageLimitCheckResult {
  const planName = effectivePlanTier(subscription?.plan_name, subscription?.status);
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
