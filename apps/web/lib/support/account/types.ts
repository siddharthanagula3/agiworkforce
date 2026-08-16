
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
  tier: string;
  effectiveTier: string;
  displayName: string;
  status: string;
  currentPeriodEnd: string | null;
  subscriptionSource: 'stripe' | 'apple' | 'google' | 'manual' | 'none';
}

export interface SupportAccountConnector {
  id: string;
  connectorId: string;
  source: 'user' | 'github-app' | 'custom';
  connectedAt: string | null;
}

export interface SupportAccountApiKeys {
  activeCount: number;
  atCeiling: boolean;
}

export interface SupportAccountEmail {
  present: boolean;
  verified: 'verified' | 'unverified' | 'unknown';
}

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
