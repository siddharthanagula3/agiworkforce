// apps/web/lib/pricing.ts

import { logger } from './logger';
import {
  getPlanPriceUsd,
  getPlanPriceInr,
  type BillingInterval,
  type BillingPlanTier,
} from '@agiworkforce/types';

export type ConfiguredCheckoutPlan = Extract<
  BillingPlanTier,
  'basic' | 'pro' | 'max' | 'max_15x' | 'team'
>;

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
    monthly: validatePriceId(process.env['STRIPE_PRICE_TEAM_MONTHLY'], 'STRIPE_PRICE_TEAM_MONTHLY'),
    yearly: validatePriceId(process.env['STRIPE_PRICE_TEAM_YEARLY'], 'STRIPE_PRICE_TEAM_YEARLY'),
  },
};

/**
 * Check if essential price IDs are configured
 * Returns true if at least one plan has both monthly and annual prices configured
 */
export function arePriceIdsConfigured(): boolean {
  const plans = ['pro', 'max', 'max_15x', 'team'] as const;
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
  if (plan === 'basic') {
    if (interval !== 'monthly') return undefined;
    return currency?.toLowerCase() === 'inr'
      ? (STRIPE_PRICE_IDS.basic.monthlyInr ?? STRIPE_PRICE_IDS.basic.monthlyUsd)
      : STRIPE_PRICE_IDS.basic.monthlyUsd;
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
        monthly: getPlanPriceUsd('team', 'monthly'),
        yearly: getPlanPriceUsd('team', 'yearly'),
      },
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
    const allPlans = ['pro', 'max', 'max_15x', 'team'] as const;
    for (const plan of allPlans) {
      const prices = STRIPE_PRICE_IDS[plan];
      if (prices.monthly === priceId || prices.yearly === priceId) {
        return plan;
      }
    }
    return null;
  },
};
