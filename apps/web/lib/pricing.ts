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
  hobby: {
    monthly: validatePriceId(
      process.env['STRIPE_PRICE_HOBBY_MONTHLY'],
      'STRIPE_PRICE_HOBBY_MONTHLY',
    ),
    annual: validatePriceId(process.env['STRIPE_PRICE_HOBBY_YEARLY'], 'STRIPE_PRICE_HOBBY_YEARLY'),
  },
  pro: {
    monthly: validatePriceId(process.env['STRIPE_PRICE_PRO_MONTHLY'], 'STRIPE_PRICE_PRO_MONTHLY'),
    annual: validatePriceId(process.env['STRIPE_PRICE_PRO_YEARLY'], 'STRIPE_PRICE_PRO_YEARLY'),
  },
  pro_plus: {
    monthly: validatePriceId(
      process.env['STRIPE_PRICE_PRO_PLUS_MONTHLY'],
      'STRIPE_PRICE_PRO_PLUS_MONTHLY',
    ),
    annual: validatePriceId(
      process.env['STRIPE_PRICE_PRO_PLUS_YEARLY'],
      'STRIPE_PRICE_PRO_PLUS_YEARLY',
    ),
  },
  max: {
    monthly: validatePriceId(process.env['STRIPE_PRICE_MAX_MONTHLY'], 'STRIPE_PRICE_MAX_MONTHLY'),
    annual: validatePriceId(process.env['STRIPE_PRICE_MAX_YEARLY'], 'STRIPE_PRICE_MAX_YEARLY'),
  },
};

/**
 * Check if essential price IDs are configured
 * Returns true if at least one plan has both monthly and annual prices configured
 */
export function arePriceIdsConfigured(): boolean {
  const plans = ['hobby', 'pro', 'pro_plus', 'max'] as const;
  return plans.some(
    (plan) =>
      STRIPE_PRICE_IDS[plan].monthly !== undefined || STRIPE_PRICE_IDS[plan].annual !== undefined,
  );
}

export const PRICING_CONFIG = {
  plans: [
    {
      id: 'hobby',
      name: 'Hobby',
      price: {
        monthly: getPlanPriceUsd('hobby', 'monthly'),
        annual: getPlanPriceUsd('hobby', 'yearly'),
      },
      stripe_price_ids: STRIPE_PRICE_IDS.hobby,
    },
    {
      id: 'pro',
      name: 'Pro',
      price: {
        monthly: getPlanPriceUsd('pro', 'monthly'),
        annual: getPlanPriceUsd('pro', 'yearly'),
      },
      stripe_price_ids: STRIPE_PRICE_IDS.pro,
    },
    {
      id: 'pro_plus',
      name: 'Pro+',
      price: {
        monthly: getPlanPriceUsd('pro_plus', 'monthly'),
        annual: getPlanPriceUsd('pro_plus', 'yearly'),
      },
      stripe_price_ids: STRIPE_PRICE_IDS.pro_plus,
    },
    {
      id: 'max',
      name: 'Max',
      price: {
        monthly: getPlanPriceUsd('max', 'monthly'),
        annual: getPlanPriceUsd('max', 'yearly'),
      },
      stripe_price_ids: STRIPE_PRICE_IDS.max,
    },
  ],
  getPlanFromPriceId: (priceId: string): string | null => {
    // Check all plans
    const allPlans = ['hobby', 'pro', 'pro_plus', 'max'] as const;
    for (const plan of allPlans) {
      const prices = STRIPE_PRICE_IDS[plan];
      if (prices.monthly === priceId || prices.annual === priceId) {
        return plan;
      }
    }
    return null;
  },
};
