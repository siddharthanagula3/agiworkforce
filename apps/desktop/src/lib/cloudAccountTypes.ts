export type PlanTier =
  | 'local-only'
  | 'byok'
  | 'free'
  | 'hobby'
  | 'pro'
  | 'pro_plus'
  | 'max'
  | 'enterprise';

const VALID_PLAN_TIERS: readonly PlanTier[] = [
  'local-only',
  'byok',
  'free',
  'hobby',
  'pro',
  'pro_plus',
  'max',
  'enterprise',
] as const;

export function asPlanTier(value: string | null | undefined): PlanTier {
  const normalized = value?.toLowerCase();
  if (normalized && VALID_PLAN_TIERS.includes(normalized as PlanTier)) {
    return normalized as PlanTier;
  }
  return 'free';
}

export const PLAN_DISPLAY_NAMES: Record<PlanTier, string> = {
  'local-only': 'Local Mode',
  byok: 'Local Mode + BYOK',
  free: 'Free',
  hobby: 'Hobby',
  pro: 'Pro',
  pro_plus: 'Pro+',
  max: 'Max',
  enterprise: 'Enterprise',
};

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_tier: string;
  status: string;
  stripe_customer_id: string | null;
  stripe_price_id: string | null;
  stripe_subscription_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeatureFlag {
  id: string;
  user_id: string;
  flag_name: string;
  enabled: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface PricingPlan {
  id: string;
  tier: string;
  name: string;
  price_cents: number;
  currency: string;
  interval: string | null;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  features: unknown;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface UsageEvent {
  id: string;
  user_id: string;
  event_type: string;
  quantity: number;
  metadata: unknown;
  created_at: string;
}

export interface Waitlist {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  role: string | null;
  use_case: string | null;
  referral_source: string | null;
  referral_code: string | null;
  marketing_consent: boolean | null;
  status: string;
  created_at: string;
  invited_at: string | null;
  converted_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
}

export interface EmailPreferences {
  id: string;
  user_id: string | null;
  email: string;
  marketing_emails: boolean | null;
  product_updates: boolean | null;
  security_alerts: boolean | null;
  weekly_digest: boolean | null;
  unsubscribe_token: string | null;
  unsubscribed_at: string | null;
  consent_given_at: string | null;
  consent_ip_address: string | null;
  created_at: string;
  updated_at: string;
}

export interface FallbackProfileData {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  stripe_customer_id: string | null;
  credits: unknown;
}

export function isValidProfileData(data: unknown): data is FallbackProfileData {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj['id'] === 'string' &&
    typeof obj['email'] === 'string' &&
    typeof obj['display_name'] === 'string' &&
    typeof obj['created_at'] === 'string' &&
    typeof obj['updated_at'] === 'string'
  );
}
