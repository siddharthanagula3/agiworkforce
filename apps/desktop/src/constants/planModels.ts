
import {
  BILLING_PLAN_PRICING,
  canUseBillingPlanCapability,
  type BillingPlanTier,
} from '@agiworkforce/types';

export const SUBSCRIPTION_TIERS = Object.freeze(
  Object.keys(BILLING_PLAN_PRICING) as BillingPlanTier[],
);
export type SubscriptionTier = BillingPlanTier;

export interface TierFeatures {
  maxMessagesPerDay: number;
  hasOllama: boolean;
  hasImageGen?: boolean;
  hasVideoGen?: boolean;
  hasPrioritySupport?: boolean;
}

export const TIER_FEATURES: Readonly<Record<SubscriptionTier, TierFeatures>> = {
  'local-only': {
    maxMessagesPerDay: -1,
    hasOllama: true,
  },
  byok: {
    maxMessagesPerDay: -1,
    hasOllama: true,
  },
  free: {
    maxMessagesPerDay: 10,
    hasOllama: true,
  },
  basic: {
    maxMessagesPerDay: 100,
    hasOllama: true,
  },
  pro: {
    maxMessagesPerDay: 1000,
    hasOllama: true,
    hasImageGen: canUseBillingPlanCapability('pro', 'image_generation'),
  },
  max: {
    maxMessagesPerDay: -1,
    hasOllama: true,
    hasImageGen: canUseBillingPlanCapability('max', 'image_generation'),
    hasVideoGen: canUseBillingPlanCapability('max', 'video_generation'),
    hasPrioritySupport: true,
  },
  max_15x: {
    maxMessagesPerDay: -1,
    hasOllama: true,
    hasImageGen: canUseBillingPlanCapability('max_15x', 'image_generation'),
    hasVideoGen: canUseBillingPlanCapability('max_15x', 'video_generation'),
    hasPrioritySupport: true,
  },
  team: {
    maxMessagesPerDay: 1000,
    hasOllama: true,
    hasImageGen: canUseBillingPlanCapability('team', 'image_generation'),
    hasVideoGen: canUseBillingPlanCapability('team', 'video_generation'),
  },
  enterprise: {
    maxMessagesPerDay: -1,
    hasOllama: true,
    hasImageGen: canUseBillingPlanCapability('enterprise', 'image_generation'),
    hasVideoGen: canUseBillingPlanCapability('enterprise', 'video_generation'),
    hasPrioritySupport: true,
  },
};

export function tierHasFeature(tier: SubscriptionTier, feature: keyof TierFeatures): boolean {
  const features = TIER_FEATURES[tier];
  return feature in features && Boolean(features[feature as keyof typeof features]);
}

export function getTierMessageLimit(tier: SubscriptionTier): number {
  return TIER_FEATURES[tier].maxMessagesPerDay;
}

export function hasUnlimitedMessages(tier: SubscriptionTier): boolean {
  return TIER_FEATURES[tier].maxMessagesPerDay === -1;
}
