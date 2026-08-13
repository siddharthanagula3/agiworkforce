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

import type { BillingInterval, BillingPlanTier } from '@agiworkforce/types';

interface PriceMappingEntry {
  tier: BillingPlanTier;
  interval: BillingInterval;
}

/** Stripe resource IDs are case-sensitive; normalization may remove whitespace only. */
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

/**
 * Tiers a free-form `PRICE_ID_OVERRIDES` entry may name.
 *
 * Deliberately EXCLUDES 'team' even though Team is now self-serve and its real
 * Prices are registered from STRIPE_PRICE_TEAM_MONTHLY_{USD,INR} above. Team
 * carries org-admin capability (`team_admin`), so a typo or a stray override in
 * an env var must never be able to mint it — the only route to a Team
 * entitlement is a Price the deployment explicitly configured.
 */
const STRIPE_BILLED_TIERS = new Set<BillingPlanTier>([
  'basic',
  'pro',
  'max',
  'max_15x',
  'enterprise',
]);

// Build price ID mapping from environment variables (single source of truth)
// This ensures checkout and webhook use the same price IDs
function buildPriceIdMapping(): Record<string, PriceMappingEntry> {
  const mapping: Record<string, PriceMappingEntry> = {};

  // Basic tier — separate USD and INR prices on the same Stripe product,
  // both map to the same tier/interval; billing-catalog.ts's monthlyPriceInr
  // is display-only, Stripe treats each currency as its own Price object.
  const basicMonthlyUsd = process.env['STRIPE_PRICE_BASIC_MONTHLY_USD'];
  const basicMonthlyInr = process.env['STRIPE_PRICE_BASIC_MONTHLY_INR'];
  registerPrice(mapping, basicMonthlyUsd, { tier: 'basic', interval: 'monthly' });
  registerPrice(mapping, basicMonthlyInr, { tier: 'basic', interval: 'monthly' });

  // Pro tier
  const proMonthly = process.env['STRIPE_PRICE_PRO_MONTHLY'];
  const proYearly = process.env['STRIPE_PRICE_PRO_YEARLY'];
  registerPrice(mapping, proMonthly, { tier: 'pro', interval: 'monthly' });
  registerPrice(mapping, proYearly, { tier: 'pro', interval: 'yearly' });

  // Max tier — monthly only; no yearly price
  const maxMonthly = process.env['STRIPE_PRICE_MAX_MONTHLY'];
  registerPrice(mapping, maxMonthly, { tier: 'max', interval: 'monthly' });

  const max15xMonthly = process.env['STRIPE_PRICE_MAX_15X_MONTHLY'];
  registerPrice(mapping, max15xMonthly, { tier: 'max_15x', interval: 'monthly' });

  // Team tier — per-seat, monthly only, USD and INR Prices on one product.
  // Registering these is what lets the webhook provision a Team purchase at all:
  // an unregistered Price makes upsertSubscriptionFromSession throw "Cannot
  // provision subscription from an unregistered Stripe Price" AFTER the customer
  // has been charged. The seat count rides on the subscription item quantity,
  // not on the Price, so there is exactly one Price per currency.
  const teamMonthlyUsd = process.env['STRIPE_PRICE_TEAM_MONTHLY_USD'];
  const teamMonthlyInr = process.env['STRIPE_PRICE_TEAM_MONTHLY_INR'];
  registerPrice(mapping, teamMonthlyUsd, { tier: 'team', interval: 'monthly' });
  registerPrice(mapping, teamMonthlyInr, { tier: 'team', interval: 'monthly' });
  // Team yearly ($240/seat/yr, Decision #22) — USD-only, no INR yearly Price.
  // Registering it is what lets the webhook provision a yearly Team purchase;
  // an unregistered Price would throw after the customer was charged.
  const teamYearlyUsd = process.env['STRIPE_PRICE_TEAM_YEARLY_USD'];
  registerPrice(mapping, teamYearlyUsd, { tier: 'team', interval: 'yearly' });

  // Enterprise tier (if configured)
  const enterpriseMonthly = process.env['STRIPE_PRICE_ENTERPRISE_MONTHLY'];
  const enterpriseYearly = process.env['STRIPE_PRICE_ENTERPRISE_YEARLY'];
  registerPrice(mapping, enterpriseMonthly, { tier: 'enterprise', interval: 'monthly' });
  registerPrice(mapping, enterpriseYearly, { tier: 'enterprise', interval: 'yearly' });

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
// Format: PRICE_ID_OVERRIDES=price_1,basic,monthly:price_2,pro,yearly
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
    return null; // Unknown price ID - caller should handle
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

/**
 * Validate that a plan tier is supported
 */
export function isValidPlanTier(tier: string | null | undefined): tier is string {
  if (!tier) return false;
  return ['free', 'basic', 'pro', 'max', 'max_15x', 'team', 'enterprise'].includes(
    tier.toLowerCase(),
  );
}

// Removed 2026-08-09 (BIZ-020 repair): `getBillingDetailsFromPriceId` bundled
// tier + interval + catalog price + usage budget for a registered Price, but it
// had no production caller anywhere in the repo — only this module's own unit
// test. The webhook path composes the two facts it needs directly
// (`resolvePlanTier` in apps/web/app/api/stripe-webhook/lib/db.ts:525/824 and
// `getPlanUsageBudgetCents` from @/lib/server/managed-usage-policy), and
// `getTierMapping()` already exposes the tier/interval pair for anything that
// needs both. Widening its `priceCents` to `number | null` was therefore a
// change to code that never runs; deleting it is the honest form of that fix.

/**
 * Get all registered price IDs
 */
export function getAllRegisteredPriceIds(): string[] {
  return Object.keys(getTierMapping());
}

/**
 * Get the canonical Prices this deployment actively configures for sale.
 *
 * This intentionally excludes PRICE_ID_OVERRIDES. Overrides may retain an old,
 * inactive Price so historical subscriptions still map to the right
 * entitlement; requiring those legacy objects to remain checkout-active would
 * make the health check reject a valid migration.
 */
export function getConfiguredStripePriceIds(): string[] {
  return Object.keys(getPriceIdMapping());
}

/**
 * Check if a price ID is registered
 */
export function isPriceIdRegistered(priceId: string | null | undefined): boolean {
  if (!priceId) return false;
  return normalizePriceId(priceId) in getTierMapping();
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
