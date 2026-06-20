// apps/web/lib/pricing.ts

import { logger } from './logger';
import { getPlanPriceUsd } from '@agiworkforce/types';

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
  pro: {
    monthly: validatePriceId(process.env['STRIPE_PRICE_PRO_MONTHLY'], 'STRIPE_PRICE_PRO_MONTHLY'),
    yearly: validatePriceId(process.env['STRIPE_PRICE_PRO_YEARLY'], 'STRIPE_PRICE_PRO_YEARLY'),
  },
  max: {
    monthly: validatePriceId(process.env['STRIPE_PRICE_MAX_MONTHLY'], 'STRIPE_PRICE_MAX_MONTHLY'),
    yearly: undefined, // Max plan is monthly-only
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
  const plans = ['pro', 'max', 'team'] as const;
  return plans.some(
    (plan) =>
      STRIPE_PRICE_IDS[plan].monthly !== undefined || STRIPE_PRICE_IDS[plan].yearly !== undefined,
  );
}

export const PRICING_CONFIG = {
  plans: [
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
      name: 'Max',
      price: {
        monthly: getPlanPriceUsd('max', 'monthly'),
        yearly: undefined, // Max is monthly-only
      },
      stripe_price_ids: STRIPE_PRICE_IDS.max,
    },
    {
      id: 'team',
      name: 'Team',
      price: {
        monthly: getPlanPriceUsd('team', 'monthly'),
        yearly: getPlanPriceUsd('team', 'yearly'),
      },
      stripe_price_ids: STRIPE_PRICE_IDS.team,
      waitlist: true,
    },
  ],
  getPlanFromPriceId: (priceId: string): string | null => {
    const allPlans = ['pro', 'max', 'team'] as const;
    for (const plan of allPlans) {
      const prices = STRIPE_PRICE_IDS[plan];
      if (prices.monthly === priceId || prices.yearly === priceId) {
        return plan;
      }
    }
    return null;
  },
};
