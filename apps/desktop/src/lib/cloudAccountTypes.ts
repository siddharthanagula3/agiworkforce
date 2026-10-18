import {
  BILLING_PLAN_PRICING,
  normalizeBillingPlanTier,
  type BillingPlanTier,
} from '@agiworkforce/types';
import type { MeSubscriptionSource } from '@agiworkforce/cloud-contracts';

export type PlanTier = BillingPlanTier;
export type SubscriptionSource = MeSubscriptionSource | 'unknown';

export function asPlanTier(value: string | null | undefined): PlanTier {
  return normalizeBillingPlanTier(value);
}

export const PLAN_DISPLAY_NAMES: Readonly<Record<PlanTier, string>> = Object.freeze(
  Object.fromEntries(
    Object.entries(BILLING_PLAN_PRICING).map(([tier, pricing]) => [tier, pricing.label]),
  ) as Record<PlanTier, string>,
);

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
  subscription_source: SubscriptionSource;
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
