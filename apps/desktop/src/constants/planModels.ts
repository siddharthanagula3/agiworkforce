/**
 * Subscription Tier Configuration
 *
 * All models are accessed through the managed cloud backend.
 * Subscription tier determines feature access, not specific model access.
 * The backend handles model routing and access control.
 */

// All subscription tiers available in the system
export const SUBSCRIPTION_TIERS = ['free', 'hobby', 'pro', 'max', 'enterprise'] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

/**
 * Feature access by subscription tier
 * -1 for maxMessagesPerDay means unlimited
 */
export const TIER_FEATURES = {
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

// Legacy exports for backward compatibility during migration
// These functions now return permissive defaults since model access is managed by the backend

/**
 * @deprecated Model access is now managed by the cloud backend.
 * All models are available - the backend handles access control.
 */
export function canUseModel(_planTier: string, _modelId: string): boolean {
  // All models accessible through managed cloud - backend handles access control
  return true;
}

/**
 * @deprecated Model defaults are now handled by the managed cloud backend.
 * Use 'auto' mode for automatic model selection.
 */
export function getDefaultModelForPlan(_planTier: string, _provider: string): string {
  // Default is always 'auto' via managed cloud
  return 'auto';
}

/**
 * @deprecated Model filtering is now handled by the managed cloud backend.
 * All models are shown - the backend handles access control.
 */
export function getAvailableModelsForPlan<T extends { value: string }>(
  _planTier: string,
  allModels: T[],
): T[] {
  // Return all models - backend handles access control
  return allModels;
}

/**
 * @deprecated Model tier classification is now handled by the managed cloud backend.
 */
export function getModelTier(_modelId: string): 'speed' | 'balanced' | 'reasoning' | 'unknown' {
  // Return 'unknown' since the backend now handles model classification
  return 'unknown';
}
