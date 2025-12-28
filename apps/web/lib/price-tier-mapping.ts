/**
 * Strict Price ID to Plan Tier Mapping
 *
 * This module provides a safe way to map Stripe price IDs to plan tiers
 * instead of using fragile substring matching.
 *
 * All valid price IDs must be registered here. Using substring matching
 * like `priceId.includes('hobby')` is dangerous because:
 * - Price IDs can change over time
 * - Similar names could cause misclassification
 * - It's unclear which prices are actually valid
 */

// Valid price IDs mapped to plan tiers
// These should match your actual Stripe price IDs
const PRICE_ID_TO_TIER: Record<string, string> = {
  // Hobby tier (monthly and annual)
  price_1Sgwx10zEfO6BZMh7thtFU77: 'hobby', // monthly
  price_1Sgwx20zEfO6BZMhbgpxL8TI: 'hobby', // annual

  // Pro tier (monthly and annual)
  price_1Sgwx20zEfO6BZMh3ix7hivi: 'pro', // monthly
  price_1Sgwx30zEfO6BZMhJXsduOyl: 'pro', // annual

  // Max tier (monthly and annual)
  price_1Sgwx30zEfO6BZMhJqItFYKF: 'max', // monthly
  price_1Sgwx40zEfO6BZMhYS63EnfW: 'max', // annual

  // Enterprise - add as needed
  // 'price_xxx': 'enterprise',
};

// Allow environment variable overrides for flexibility
// Format: PRICE_ID_OVERRIDES=price_1,hobby:price_2,pro
function loadOverrides(): Record<string, string> {
  const overrides: Record<string, string> = { ...PRICE_ID_TO_TIER };
  const envOverrides = process.env.PRICE_ID_OVERRIDES;

  if (envOverrides) {
    const pairs = envOverrides.split(':');
    for (const pair of pairs) {
      const [priceId, tier] = pair.trim().split(',');
      if (priceId && tier) {
        overrides[priceId.toLowerCase()] = tier.toLowerCase();
      }
    }
  }

  return overrides;
}

const tierMapping = loadOverrides();

/**
 * Get plan tier from price ID using strict mapping
 *
 * @param priceId - The Stripe price ID
 * @returns The plan tier ('hobby', 'pro', 'max', 'enterprise') or null if not found
 * @throws Error if price ID is found in mapping but is in inconsistent state
 */
export function getPlanTierFromPriceId(priceId: string | null | undefined): string | null {
  if (!priceId) {
    return null;
  }

  const normalizedId = priceId.toLowerCase().trim();
  const tier = tierMapping[normalizedId];

  if (!tier) {
    return null; // Unknown price ID - caller should handle
  }

  return tier;
}

/**
 * Get plan tier from price ID with fallback to metadata
 *
 * This safely combines metadata and price ID lookup
 * @param metadata - Stripe metadata object
 * @param priceId - Stripe price ID
 * @returns The plan tier, or null if neither metadata nor price mapping has it
 */
export function resolvePlanTier(
  metadata: Record<string, string> | null | undefined,
  priceId: string | null | undefined,
): string | null {
  // First check metadata (most reliable)
  if (metadata?.plan_tier) {
    return metadata.plan_tier.toLowerCase();
  }

  // Then try strict price ID mapping
  const tierFromPrice = getPlanTierFromPriceId(priceId);
  if (tierFromPrice) {
    return tierFromPrice;
  }

  // Return null instead of defaulting - let caller handle missing tier
  return null;
}

/**
 * Validate that a plan tier is supported
 */
export function isValidPlanTier(tier: string | null | undefined): tier is string {
  if (!tier) return false;
  return ['hobby', 'pro', 'max', 'enterprise'].includes(tier.toLowerCase());
}

/**
 * Get all registered price IDs
 */
export function getAllRegisteredPriceIds(): string[] {
  return Object.keys(tierMapping);
}

/**
 * Check if a price ID is registered
 */
export function isPriceIdRegistered(priceId: string | null | undefined): boolean {
  if (!priceId) return false;
  return priceId in tierMapping;
}

/**
 * Debug helper - get mapping status
 */
export function getMappingStatus(): {
  totalMapped: number;
  tiers: Record<string, string[]>;
} {
  const tiers: Record<string, string[]> = {
    hobby: [],
    pro: [],
    max: [],
    enterprise: [],
  };

  for (const [priceId, tier] of Object.entries(tierMapping)) {
    if (!tiers[tier]) {
      tiers[tier] = [];
    }
    tiers[tier].push(priceId);
  }

  return {
    totalMapped: Object.keys(tierMapping).length,
    tiers,
  };
}
