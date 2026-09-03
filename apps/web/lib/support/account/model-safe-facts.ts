import type { ModelSafeAccountFacts, SupportAccountContext } from './types';

export function toModelSafeAccountFacts(context: SupportAccountContext): ModelSafeAccountFacts {
  return {
    plan_tier: context.plan.tier,
    effective_plan_tier: context.plan.effectiveTier,
    subscription_status: context.plan.status,
    subscription_source: context.plan.subscriptionSource,
    current_period_end: context.plan.currentPeriodEnd,
    usage_percentage: context.usage?.usagePercentage ?? null,
    session_usage_percentage: context.usage?.sessionUsagePercentage ?? null,
    weekly_usage_percentage: context.usage?.weeklyUsagePercentage ?? null,
    flagship_weekly_usage_percentage: context.usage?.flagshipWeeklyUsagePercentage ?? null,
    usage_reset_at: context.usage?.usageResetAt ?? null,
    has_usage_remaining: context.usage?.hasUsageRemaining ?? null,
    connector_ids: context.connectors.map((c) => c.connectorId),
    connector_count: context.connectors.length,
    active_api_key_count: context.apiKeys.activeCount,
    api_key_at_ceiling: context.apiKeys.atCeiling,
    email_verification_state: context.email.verified,
  };
}

export const MODEL_SAFE_FACT_KEYS: readonly (keyof ModelSafeAccountFacts)[] = Object.freeze([
  'plan_tier',
  'effective_plan_tier',
  'subscription_status',
  'subscription_source',
  'current_period_end',
  'usage_percentage',
  'session_usage_percentage',
  'weekly_usage_percentage',
  'flagship_weekly_usage_percentage',
  'usage_reset_at',
  'has_usage_remaining',
  'connector_ids',
  'connector_count',
  'active_api_key_count',
  'api_key_at_ceiling',
  'email_verification_state',
]);
