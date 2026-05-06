/**
 * Subscription Tier Configuration
 *
 * All models are accessed through the managed cloud backend.
 * Subscription tier determines feature access, not specific model access.
 * The backend handles model routing and access control.
 */

// All subscription tiers available in the system.
// Mirrors the Rust `PlanTier` enum at apps/desktop/src-tauri/src/sys/billing/models.rs:8-24.
export const SUBSCRIPTION_TIERS = [
  'local-only',
  'byok',
  'free',
  'hobby',
  'pro',
  'max',
  'enterprise',
] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

/**
 * Feature access by subscription tier
 * -1 for maxMessagesPerDay means unlimited.
 *
 * Note: 'local-only' and 'byok' have no managed-cloud message budget — usage is
 * limited only by the user's own Ollama / API-key quotas, not by us.
 */
export const TIER_FEATURES = {
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
  hobby: {
    maxMessagesPerDay: 100,
    hasOllama: true,
  },
  pro: {
    maxMessagesPerDay: 1000,
    hasOllama: true,
    hasImageGen: true,
  },
  max: {
    maxMessagesPerDay: -1,
    hasOllama: true,
    hasImageGen: true,
    hasVideoGen: true,
  },
  enterprise: {
    maxMessagesPerDay: -1,
    hasOllama: true,
    hasImageGen: true,
    hasVideoGen: true,
    hasPrioritySupport: true,
  },
} as const;

export type TierFeatures = (typeof TIER_FEATURES)[SubscriptionTier];

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
