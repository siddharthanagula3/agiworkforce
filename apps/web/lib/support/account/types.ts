/**
 * @file Account-context types for the support agent.
 *
 * TWO PROJECTIONS, AND THE DISTINCTION IS LOAD-BEARING:
 *
 *   SupportAccountContext   — the full read-only view, returned to the
 *                             AUTHENTICATED CALLER over their own response.
 *                             It may contain nothing that belongs to another
 *                             account, but it may contain the caller's own
 *                             identifiers (connector row ids and so on).
 *
 *   ModelSafeAccountFacts   — the ONLY shape any caller may put into a model
 *                             prompt. Built from a hardcoded key allowlist in
 *                             `model-safe-facts.ts`, so a field added to the
 *                             context above cannot silently reach an LLM.
 *
 * An inference-time prompt is both an exfiltration surface (whatever goes in
 * can come back out) and an injection surface (user-authored strings such as
 * custom MCP connector names are attacker-controlled). The projection exists
 * for both reasons.
 */

/** Percentage-only usage view. Private allowance operands never appear here. */
export interface SupportAccountUsage {
  usagePercentage: number;
  sessionUsagePercentage: number;
  weeklyUsagePercentage: number;
  flagshipWeeklyUsagePercentage: number;
  usageResetAt: string | null;
  sessionResetAt: string | null;
  weeklyResetAt: string | null;
  hasUsageRemaining: boolean;
}

export interface SupportAccountPlan {
  /** Raw `subscriptions.plan_tier`. Use only for an honest "Pro — canceled" label. */
  tier: string;
  /** Status-gated tier. Every capability statement must use THIS. */
  effectiveTier: string;
  displayName: string;
  status: string;
  currentPeriodEnd: string | null;
  subscriptionSource: 'stripe' | 'apple' | 'google' | 'manual' | 'none';
}

export interface SupportAccountConnector {
  /** Row id (user connectors) or a synthetic id for github-app rows. */
  id: string;
  /** The id the chat tool loop uses. `custom-<shortId>` for user-added MCP servers. */
  connectorId: string;
  source: 'user' | 'github-app' | 'custom';
  connectedAt: string | null;
}

export interface SupportAccountApiKeys {
  activeCount: number;
  /** Mirrors the 20-key ceiling enforced by /api/settings/api-keys. */
  atCeiling: boolean;
}

/**
 * Email verification state. The ADDRESS ITSELF is deliberately absent — the
 * support agent never needs it and a prompt is not a place for it.
 *
 * `'unknown'` is a real, common outcome: the Clerk lookup is capped at 1.5s
 * (same as /api/me) and a timeout must never be reported as "unverified".
 */
export interface SupportAccountEmail {
  present: boolean;
  verified: 'verified' | 'unverified' | 'unknown';
}

/** A citable source for an account-grounded answer. */
export interface SupportAccountCitation {
  id: string;
  label: string;
  href: string;
}

export interface SupportAccountContext {
  plan: SupportAccountPlan;
  usage: SupportAccountUsage | null;
  connectors: SupportAccountConnector[];
  apiKeys: SupportAccountApiKeys;
  email: SupportAccountEmail;
  resolvedAt: string;
}

/**
 * The prompt boundary. A flat record of primitives (and one string array),
 * built by allowlist. No user id, no email address, no key material, no
 * user-authored strings.
 */
export interface ModelSafeAccountFacts {
  plan_tier: string;
  effective_plan_tier: string;
  subscription_status: string;
  subscription_source: string;
  current_period_end: string | null;
  usage_percentage: number | null;
  session_usage_percentage: number | null;
  weekly_usage_percentage: number | null;
  flagship_weekly_usage_percentage: number | null;
  usage_reset_at: string | null;
  has_usage_remaining: boolean | null;
  connector_ids: string[];
  connector_count: number;
  active_api_key_count: number;
  api_key_at_ceiling: boolean;
  email_verification_state: 'verified' | 'unverified' | 'unknown';
}
