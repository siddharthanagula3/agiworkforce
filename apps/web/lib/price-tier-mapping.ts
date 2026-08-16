
import type { BillingInterval, BillingPlanTier } from '@agiworkforce/types';

interface PriceMappingEntry {
  tier: BillingPlanTier;
  interval: BillingInterval;
}

function normalizePriceId(priceId: string): string {
  return priceId.trim();
}

function registerPrice(
  mapping: Record<string, PriceMappingEntry>,
  priceId: string | undefined,
  entry: PriceMappingEntry,
): void {
  if (!priceId) return;
  const normalizedId = normalizePriceId(priceId);
  if (normalizedId) mapping[normalizedId] = entry;
}

const STRIPE_BILLED_TIERS = new Set<BillingPlanTier>([
  'basic',
  'pro',
  'max',
  'max_15x',
  'enterprise',
]);

function buildPriceIdMapping(): Record<string, PriceMappingEntry> {
  const mapping: Record<string, PriceMappingEntry> = {};

  const basicMonthlyUsd = process.env['STRIPE_PRICE_BASIC_MONTHLY_USD'];
  const basicMonthlyInr = process.env['STRIPE_PRICE_BASIC_MONTHLY_INR'];
  registerPrice(mapping, basicMonthlyUsd, { tier: 'basic', interval: 'monthly' });
  registerPrice(mapping, basicMonthlyInr, { tier: 'basic', interval: 'monthly' });

  const proMonthly = process.env['STRIPE_PRICE_PRO_MONTHLY'];
  const proYearly = process.env['STRIPE_PRICE_PRO_YEARLY'];
  registerPrice(mapping, proMonthly, { tier: 'pro', interval: 'monthly' });
  registerPrice(mapping, proYearly, { tier: 'pro', interval: 'yearly' });

  const maxMonthly = process.env['STRIPE_PRICE_MAX_MONTHLY'];
  registerPrice(mapping, maxMonthly, { tier: 'max', interval: 'monthly' });

  const max15xMonthly = process.env['STRIPE_PRICE_MAX_15X_MONTHLY'];
  registerPrice(mapping, max15xMonthly, { tier: 'max_15x', interval: 'monthly' });

  const teamMonthlyUsd = process.env['STRIPE_PRICE_TEAM_MONTHLY_USD'];
  const teamMonthlyInr = process.env['STRIPE_PRICE_TEAM_MONTHLY_INR'];
  registerPrice(mapping, teamMonthlyUsd, { tier: 'team', interval: 'monthly' });
  registerPrice(mapping, teamMonthlyInr, { tier: 'team', interval: 'monthly' });
  const teamYearlyUsd = process.env['STRIPE_PRICE_TEAM_YEARLY_USD'];
  registerPrice(mapping, teamYearlyUsd, { tier: 'team', interval: 'yearly' });

  const enterpriseMonthly = process.env['STRIPE_PRICE_ENTERPRISE_MONTHLY'];
  const enterpriseYearly = process.env['STRIPE_PRICE_ENTERPRISE_YEARLY'];
  registerPrice(mapping, enterpriseMonthly, { tier: 'enterprise', interval: 'monthly' });
  registerPrice(mapping, enterpriseYearly, { tier: 'enterprise', interval: 'yearly' });

  return mapping;
}

let _priceIdMapping: Record<string, PriceMappingEntry> | null = null;

function getPriceIdMapping(): Record<string, PriceMappingEntry> {
  if (!_priceIdMapping) {
    _priceIdMapping = buildPriceIdMapping();
  }
  return _priceIdMapping;
}

function loadOverrides(): Record<string, PriceMappingEntry> {
  const baseMapping = getPriceIdMapping();
  const overrides: Record<string, PriceMappingEntry> = { ...baseMapping };
  const envOverrides = process.env['PRICE_ID_OVERRIDES'];

  if (envOverrides) {
    const pairs = envOverrides.split(':');
    for (const pair of pairs) {
      const [priceId, tier, interval] = pair.trim().split(',');
      if (priceId && tier) {
        const normalizedTier = tier.trim().toLowerCase() as BillingPlanTier;
        if (!STRIPE_BILLED_TIERS.has(normalizedTier)) continue;
        const normalizedId = normalizePriceId(priceId);
        if (!normalizedId) continue;
        overrides[normalizedId] = {
          tier: normalizedTier,
          interval: interval?.trim().toLowerCase() === 'yearly' ? 'yearly' : 'monthly',
        };
      }
    }
  }

  return overrides;
}

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
 * @returns The canonical plan tier or null if not found
 * @throws Error if price ID is found in mapping but is in inconsistent state
 */
export function getPlanTierFromPriceId(priceId: string | null | undefined): string | null {
  if (!priceId) {
    return null;
  }

  const normalizedId = normalizePriceId(priceId);
  const tier = getTierMapping()[normalizedId]?.tier;

  if (!tier) {
    return null;
  }

  return tier;
}

/**
 * Resolve a subscription tier from its registered Stripe Price.
 *
 * Subscription metadata is advisory and can become stale when a customer
 * changes price through Stripe's portal. It must never override—or stand in
 * for—the purchased Price when provisioning entitlements.
 * @param _metadata - Stripe metadata retained for call-site compatibility
 * @param priceId - Stripe price ID
 * @returns The registered Price tier, or null when the Price is not configured
 */
export function resolvePlanTier(
  _metadata: Record<string, string> | null | undefined,
  priceId: string | null | undefined,
): string | null {
  return getPlanTierFromPriceId(priceId);
}

export function isValidPlanTier(tier: string | null | undefined): tier is string {
  if (!tier) return false;
  return ['free', 'basic', 'pro', 'max', 'max_15x', 'team', 'enterprise'].includes(
    tier.toLowerCase(),
  );
}

export function getAllRegisteredPriceIds(): string[] {
  return Object.keys(getTierMapping());
}

export function getConfiguredStripePriceIds(): string[] {
  return Object.keys(getPriceIdMapping());
}

export function isPriceIdRegistered(priceId: string | null | undefined): boolean {
  if (!priceId) return false;
  return normalizePriceId(priceId) in getTierMapping();
}

export function getMappingStatus(): {
  totalMapped: number;
  tiers: Record<string, string[]>;
} {
  const mapping = getTierMapping();
  const tiers: Record<string, string[]> = {
    basic: [],
    pro: [],
    max: [],
    max_15x: [],
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
