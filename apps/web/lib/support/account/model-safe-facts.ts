/**
 * @file The prompt boundary for account context.
 *
 * `toModelSafeAccountFacts` is the ONLY sanctioned way to move account state
 * into a model prompt. It is an allowlist projection, not a redaction pass:
 * every key in the output is written out by hand below, so a field added to
 * `SupportAccountContext` later cannot reach an LLM until someone deliberately
 * adds it here.
 *
 * WHAT IS DROPPED AND WHY
 *   - the user id            : never needed for an answer; identifies the caller
 *   - the email address      : PII with no answer value; only the STATE is kept
 *   - connector display names: user-authored strings = prompt-injection payloads
 *   - connector endpoint URLs: user-authored, and an SSRF-shaped hint
 *   - API key ids/prefixes   : credential-adjacent identifiers
 *   - raw allowance operands : never resolved in the first place (see
 *                              context-resolver's usage-policy note)
 *
 * Same allowlist-then-drop discipline as `sanitizeAuditDetail` in
 * lib/security-audit.ts, for the same reason.
 */

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
    // Connector IDS only. `custom-<shortId>` is an opaque server-assigned id;
    // the user's chosen name for that connector never crosses this boundary.
    connector_ids: context.connectors.map((c) => c.connectorId),
    connector_count: context.connectors.length,
    active_api_key_count: context.apiKeys.activeCount,
    api_key_at_ceiling: context.apiKeys.atCeiling,
    email_verification_state: context.email.verified,
  };
}

/**
 * The exact key set the projection may emit. Exported so a test can assert the
 * output has no extra keys — a drift guard that fails if someone spreads the
 * whole context into the return object.
 */
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
