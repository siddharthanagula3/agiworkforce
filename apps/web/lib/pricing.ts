import { logger } from './logger';
import {
  getPlanPriceUsd,
  getPlanPriceInr,
  isBasicPlanTier,
  isTeamPlanTier,
  type BillingInterval,
  type SelfServePaidPlanTier,
} from '@agiworkforce/types';

export type ConfiguredCheckoutPlan = SelfServePaidPlanTier;

function validatePriceId(priceId: string | undefined, name: string): string | undefined {
  const normalizedPriceId = priceId?.trim();
  if (!normalizedPriceId) {
    if (typeof window === 'undefined' && process.env.NODE_ENV !== 'test') {
      logger.warn(
        { envVar: name },
        'Missing Stripe price ID. Set the appropriate STRIPE_PRICE_* environment variable.',
      );
    }
    return undefined;
  }

  if (!normalizedPriceId.startsWith('price_')) {
    logger.error(
      { envVar: name, priceId: normalizedPriceId },
      'Invalid Stripe price ID format. Price IDs should start with "price_".',
    );
    return undefined;
  }

  return normalizedPriceId;
}

export const STRIPE_PRICE_IDS = {
  basic: {
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
    monthlyUsd: validatePriceId(
      process.env['STRIPE_PRICE_TEAM_MONTHLY_USD'],
      'STRIPE_PRICE_TEAM_MONTHLY_USD',
    ),
    monthlyInr: validatePriceId(
      process.env['STRIPE_PRICE_TEAM_MONTHLY_INR'],
      'STRIPE_PRICE_TEAM_MONTHLY_INR',
    ),
    yearlyUsd: validatePriceId(
      process.env['STRIPE_PRICE_TEAM_YEARLY_USD'],
      'STRIPE_PRICE_TEAM_YEARLY_USD',
    ),
  },
};

export function arePriceIdsConfigured(): boolean {
  const plans = ['pro', 'max', 'max_15x'] as const;
  return plans.some(
    (plan) =>
      STRIPE_PRICE_IDS[plan].monthly !== undefined || STRIPE_PRICE_IDS[plan].yearly !== undefined,
  );
}

export function getConfiguredPriceId(
  plan: ConfiguredCheckoutPlan,
  interval: BillingInterval,
  currency?: string,
): string | undefined {
  if (isBasicPlanTier(plan) || isTeamPlanTier(plan)) {
    const prices = STRIPE_PRICE_IDS[plan];
    if (interval === 'monthly') {
      return currency?.toLowerCase() === 'inr'
        ? (prices.monthlyInr ?? prices.monthlyUsd)
        : prices.monthlyUsd;
    }
    if (isTeamPlanTier(plan)) return STRIPE_PRICE_IDS.team.yearlyUsd;
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
        monthly: getPlanPriceUsd('team', 'monthly'),
        monthlyInr: getPlanPriceInr('team'),
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
