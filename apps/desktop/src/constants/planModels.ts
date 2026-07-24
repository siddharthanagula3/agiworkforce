/**
 * Subscription Tier Configuration
 *
 * All models are accessed through the managed cloud backend.
 * Subscription tier determines feature access, not specific model access.
 * The backend handles model routing and access control.
 */

import {
  BILLING_PLAN_PRICING,
  canUseBillingPlanCapability,
  type BillingPlanTier,
} from '@agiworkforce/types';

// The shared billing catalog is the only tier taxonomy. Desktop must not keep
// a shorter copy: doing so previously dropped Max 15x and Team from model and
// feature gates after a successful Cloud account sync.
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

/**
 * Feature access by subscription tier
 * -1 for maxMessagesPerDay means unlimited.
 *
 * Note: 'local-only' and 'byok' have no managed-cloud message budget — usage is
 * limited only by the user's own Ollama / API-key quotas, not by us.
 */
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

/**
 * Check if a tier has a specific feature
 */
export function tierHasFeature(tier: SubscriptionTier, feature: keyof TierFeatures): boolean {
  const features = TIER_FEATURES[tier];
  return feature in features && Boolean(features[feature as keyof typeof features]);
}

/**
 * Get the message limit for a tier
 * Returns -1 for unlimited
 */
export function getTierMessageLimit(tier: SubscriptionTier): number {
  return TIER_FEATURES[tier].maxMessagesPerDay;
}

/**
 * Check if a tier has unlimited messages
 */
export function hasUnlimitedMessages(tier: SubscriptionTier): boolean {
  return TIER_FEATURES[tier].maxMessagesPerDay === -1;
}
