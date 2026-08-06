// apps/web/lib/pricing.ts

import { logger } from './logger';
import {
  getPlanPriceUsd,
  getPlanPriceInr,
  type BillingInterval,
  type SelfServePaidPlanTier,
} from '@agiworkforce/types';

export type ConfiguredCheckoutPlan = SelfServePaidPlanTier;

/**
 * Validate that a Stripe price ID is properly configured
 * Returns the price ID if valid, undefined if not set
 */
function validatePriceId(priceId: string | undefined, name: string): string | undefined {
  if (!priceId || priceId.trim() === '') {
    // Only log warning in server-side context (not during build/client)
    if (typeof window === 'undefined' && process.env.NODE_ENV !== 'test') {
      logger.warn(
        { envVar: name },
        'Missing Stripe price ID. Set the appropriate STRIPE_PRICE_* environment variable.',
      );
    }
    return undefined;
  }

  // Validate price ID format (Stripe price IDs start with 'price_')
  if (!priceId.startsWith('price_')) {
    logger.error(
      { envVar: name, priceId },
      'Invalid Stripe price ID format. Price IDs should start with "price_".',
    );
    return undefined;
  }

  return priceId;
}

export const STRIPE_PRICE_IDS = {
  basic: {
    // India (₹399/mo) and rest-of-world (USD $7/mo) are separate Stripe
    // Price objects on the same product — both resolve to tier 'basic'.
    monthlyUsd: validatePriceId(
      process.env['STRIPE_PRICE_BASIC_MONTHLY_USD'],
      'STRIPE_PRICE_BASIC_MONTHLY_USD',
    ),
    monthlyInr: validatePriceId(
      process.env['STRIPE_PRICE_BASIC_MONTHLY_INR'],
      'STRIPE_PRICE_BASIC_MONTHLY_INR',
    ),
  },
  pro: {
    monthly: validatePriceId(process.env['STRIPE_PRICE_PRO_MONTHLY'], 'STRIPE_PRICE_PRO_MONTHLY'),
    yearly: validatePriceId(process.env['STRIPE_PRICE_PRO_YEARLY'], 'STRIPE_PRICE_PRO_YEARLY'),
  },
  max: {
    monthly: validatePriceId(process.env['STRIPE_PRICE_MAX_MONTHLY'], 'STRIPE_PRICE_MAX_MONTHLY'),
    yearly: undefined, // Max plan is monthly-only
  },
  max_15x: {
    monthly: validatePriceId(
      process.env['STRIPE_PRICE_MAX_15X_MONTHLY'],
      'STRIPE_PRICE_MAX_15X_MONTHLY',
    ),
    yearly: undefined, // Max 15x is monthly-only
  },
  team: {
    // Team is billed PER SEAT: these Prices carry the per-seat unit amount and
    // Checkout/upgrade supply the seat count as the line-item quantity. Same
    // USD/INR split as Basic — two Stripe Price objects on one product, both
    // resolving to tier 'team'.
    monthlyUsd: validatePriceId(
      process.env['STRIPE_PRICE_TEAM_MONTHLY_USD'],
      'STRIPE_PRICE_TEAM_MONTHLY_USD',
    ),
    monthlyInr: validatePriceId(
      process.env['STRIPE_PRICE_TEAM_MONTHLY_INR'],
      'STRIPE_PRICE_TEAM_MONTHLY_INR',
    ),
    // Team yearly is USD-only ($240/seat/yr, Decision #22). No INR yearly Price
    // (founder-undecided) — an INR yearly request falls back to this USD Price,
    // mirroring the monthlyInr -> monthlyUsd fallback. Absent env → undefined →
    // yearly checkout refuses (fail-closed).
    yearlyUsd: validatePriceId(
      process.env['STRIPE_PRICE_TEAM_YEARLY_USD'],
      'STRIPE_PRICE_TEAM_YEARLY_USD',
    ),
  },
};

/**
 * Check if essential price IDs are configured
 * Returns true if at least one plan has both monthly and annual prices configured
 */
export function arePriceIdsConfigured(): boolean {
  const plans = ['pro', 'max', 'max_15x'] as const;
  return plans.some(
    (plan) =>
      STRIPE_PRICE_IDS[plan].monthly !== undefined || STRIPE_PRICE_IDS[plan].yearly !== undefined,
  );
}

/** Canonical Stripe Price lookup used by pricing display, Checkout, and webhooks. */
export function getConfiguredPriceId(
  plan: ConfiguredCheckoutPlan,
  interval: BillingInterval,
  currency?: string,
): string | undefined {
  // Basic and Team each have a dedicated INR Price object alongside the USD one.
  if (plan === 'basic' || plan === 'team') {
    const prices = STRIPE_PRICE_IDS[plan];
    if (interval === 'monthly') {
      return currency?.toLowerCase() === 'inr'
        ? (prices.monthlyInr ?? prices.monthlyUsd)
        : prices.monthlyUsd;
    }
    // Yearly: only Team offers it, and USD-only. INR yearly is founder-undecided
    // (no INR Price), so an INR yearly request falls back to the USD yearly
    // Price — the same fallback shape as monthlyInr ?? monthlyUsd. Basic has no
    // yearly Price at all. Absent env → undefined → checkout refuses.
    if (plan === 'team') return STRIPE_PRICE_IDS.team.yearlyUsd;
    return undefined;
  }
  return STRIPE_PRICE_IDS[plan][interval];
}

export const PRICING_CONFIG = {
  plans: [
    {
      id: 'basic',
      name: 'Basic',
      price: {
        monthly: getPlanPriceUsd('basic', 'monthly'),
        monthlyInr: getPlanPriceInr('basic'),
        yearly: undefined, // Basic is monthly-only
      },
      stripe_price_ids: STRIPE_PRICE_IDS.basic,
    },
    {
      id: 'pro',
      name: 'Pro',
      price: {
        monthly: getPlanPriceUsd('pro', 'monthly'),
        yearly: getPlanPriceUsd('pro', 'yearly'),
      },
      stripe_price_ids: STRIPE_PRICE_IDS.pro,
    },
    {
      id: 'max',
      name: 'Max 5x',
      price: {
        monthly: getPlanPriceUsd('max', 'monthly'),
        yearly: undefined, // Max is monthly-only
      },
      stripe_price_ids: STRIPE_PRICE_IDS.max,
    },
    {
      id: 'max_15x',
      name: 'Max 15x',
      price: {
        monthly: getPlanPriceUsd('max_15x', 'monthly'),
        yearly: undefined, // Max 15x is monthly-only
      },
      stripe_price_ids: STRIPE_PRICE_IDS.max_15x,
    },
    {
      id: 'team',
      name: 'Team',
      price: {
        // Per seat, per month. Multiply by the purchased seat count for the
        // organization's bill; never render this as an account price.
        monthly: getPlanPriceUsd('team', 'monthly'),
        monthlyInr: getPlanPriceInr('team'),
        // Per seat, per year ($240, Decision #22). USD-only; INR yearly is
        // founder-undecided so it is intentionally not published here.
        yearly: getPlanPriceUsd('team', 'yearly'),
      },
      perSeat: true,
      stripe_price_ids: STRIPE_PRICE_IDS.team,
    },
  ],
  getPlanFromPriceId: (priceId: string): string | null => {
    if (
      STRIPE_PRICE_IDS.basic.monthlyUsd === priceId ||
      STRIPE_PRICE_IDS.basic.monthlyInr === priceId
    ) {
      return 'basic';
    }
    if (
      STRIPE_PRICE_IDS.team.monthlyUsd === priceId ||
      STRIPE_PRICE_IDS.team.monthlyInr === priceId ||
      STRIPE_PRICE_IDS.team.yearlyUsd === priceId
    ) {
      return 'team';
    }
    const allPlans = ['pro', 'max', 'max_15x'] as const;
    for (const plan of allPlans) {
      const prices = STRIPE_PRICE_IDS[plan];
      if (prices.monthly === priceId || prices.yearly === priceId) {
        return plan;
      }
    }
    return null;
  },
};
