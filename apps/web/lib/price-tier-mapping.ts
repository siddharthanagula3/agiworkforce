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

import {
  getPlanPriceCents,
  getPlanUsageBudgetCents,
  type BillingInterval,
  type BillingPlanTier,
} from '@agiworkforce/types';

interface PriceMappingEntry {
  tier: BillingPlanTier;
  interval: BillingInterval;
}

// Build price ID mapping from environment variables (single source of truth)
// This ensures checkout and webhook use the same price IDs
function buildPriceIdMapping(): Record<string, PriceMappingEntry> {
  const mapping: Record<string, PriceMappingEntry> = {};

  // Hobby tier
  const hobbyMonthly = process.env['STRIPE_PRICE_HOBBY_MONTHLY'];
  const hobbyYearly = process.env['STRIPE_PRICE_HOBBY_YEARLY'];
  if (hobbyMonthly) mapping[hobbyMonthly.toLowerCase()] = { tier: 'hobby', interval: 'monthly' };
  if (hobbyYearly) mapping[hobbyYearly.toLowerCase()] = { tier: 'hobby', interval: 'yearly' };

  // Pro tier
  const proMonthly = process.env['STRIPE_PRICE_PRO_MONTHLY'];
  const proYearly = process.env['STRIPE_PRICE_PRO_YEARLY'];
  if (proMonthly) mapping[proMonthly.toLowerCase()] = { tier: 'pro', interval: 'monthly' };
  if (proYearly) mapping[proYearly.toLowerCase()] = { tier: 'pro', interval: 'yearly' };

  // Max tier
  const maxMonthly = process.env['STRIPE_PRICE_MAX_MONTHLY'];
  const maxYearly = process.env['STRIPE_PRICE_MAX_YEARLY'];
  if (maxMonthly) mapping[maxMonthly.toLowerCase()] = { tier: 'max', interval: 'monthly' };
  if (maxYearly) mapping[maxYearly.toLowerCase()] = { tier: 'max', interval: 'yearly' };

  // Enterprise tier (if configured)
  const enterpriseMonthly = process.env['STRIPE_PRICE_ENTERPRISE_MONTHLY'];
  const enterpriseYearly = process.env['STRIPE_PRICE_ENTERPRISE_YEARLY'];
  if (enterpriseMonthly)
    mapping[enterpriseMonthly.toLowerCase()] = { tier: 'enterprise', interval: 'monthly' };
  if (enterpriseYearly)
    mapping[enterpriseYearly.toLowerCase()] = { tier: 'enterprise', interval: 'yearly' };

  return mapping;
}

// Lazily initialized mapping (built on first use to ensure env vars are loaded)
let _priceIdMapping: Record<string, PriceMappingEntry> | null = null;

function getPriceIdMapping(): Record<string, PriceMappingEntry> {
  if (!_priceIdMapping) {
    _priceIdMapping = buildPriceIdMapping();
  }
  return _priceIdMapping;
}

// Allow additional overrides via PRICE_ID_OVERRIDES env var
// Format: PRICE_ID_OVERRIDES=price_1,hobby:price_2,pro
function loadOverrides(): Record<string, PriceMappingEntry> {
  const baseMapping = getPriceIdMapping();
  const overrides: Record<string, PriceMappingEntry> = { ...baseMapping };
  const envOverrides = process.env['PRICE_ID_OVERRIDES'];

  if (envOverrides) {
    const pairs = envOverrides.split(':');
    for (const pair of pairs) {
      const [priceId, tier, interval] = pair.trim().split(',');
      if (priceId && tier) {
        overrides[priceId.toLowerCase()] = {
          tier: tier.toLowerCase() as BillingPlanTier,
          interval: interval === 'yearly' ? 'yearly' : 'monthly',
        };
      }
    }
  }

  return overrides;
}

// Lazily initialized tier mapping with overrides
let _tierMapping: Record<string, PriceMappingEntry> | null = null;

export function getTierMapping(): Record<string, PriceMappingEntry> {
  if (!_tierMapping) {
    _tierMapping = loadOverrides();
  }
  return _tierMapping;
}

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
  const tier = getTierMapping()[normalizedId]?.tier;

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
  if (metadata?.['plan_tier']) {
    return metadata['plan_tier'].toLowerCase();
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
  return ['free', 'hobby', 'pro', 'max', 'enterprise'].includes(tier.toLowerCase());
}

export function getBillingDetailsFromPriceId(priceId: string | null | undefined): {
  tier: BillingPlanTier;
  interval: BillingInterval;
  priceCents: number;
  usageBudgetCents: number;
} | null {
  if (!priceId) {
    return null;
  }

  const entry = getTierMapping()[priceId.toLowerCase().trim()];
  if (!entry) {
    return null;
  }

  return {
    tier: entry.tier,
    interval: entry.interval,
    priceCents: getPlanPriceCents(entry.tier, entry.interval),
    usageBudgetCents: getPlanUsageBudgetCents(entry.tier, entry.interval),
  };
}

/**
 * Get all registered price IDs
 */
export function getAllRegisteredPriceIds(): string[] {
  return Object.keys(getTierMapping());
}

/**
 * Check if a price ID is registered
 */
export function isPriceIdRegistered(priceId: string | null | undefined): boolean {
  if (!priceId) return false;
  return priceId.toLowerCase() in getTierMapping();
}

/**
 * Debug helper - get mapping status
 */
export function getMappingStatus(): {
  totalMapped: number;
  tiers: Record<string, string[]>;
} {
  const mapping = getTierMapping();
  const tiers: Record<string, string[]> = {
    hobby: [],
    pro: [],
    max: [],
    enterprise: [],
  };

  for (const [priceId, entry] of Object.entries(mapping)) {
    const tier = entry.tier;
    if (!tiers[tier]) {
      tiers[tier] = [];
    }
    tiers[tier].push(priceId);
  }

  return {
    totalMapped: Object.keys(mapping).length,
    tiers,
  };
}
