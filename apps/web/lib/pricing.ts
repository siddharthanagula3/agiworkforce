import { logger } from './logger';
import {
  BILLING_PLAN_PRICING,
  getPlanPriceUsd,
  getPlanPriceInr,
  subscriptionPlanTierOf,
  type BillingInterval,
  type SelfServePaidPlanTier,
  type TeamSeatUpgradeTier,
} from '@agiworkforce/types';

export type ConfiguredCheckoutPlan = SelfServePaidPlanTier;
export type ConfiguredPricePlan = ConfiguredCheckoutPlan | TeamSeatUpgradeTier;

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

export type CheckoutCurrency = 'usd' | 'inr';

export const DEFAULT_CHECKOUT_CURRENCY: CheckoutCurrency = 'usd';

/**
 * A price point is the product identity: plan, interval, currency. The Stripe
 * price id is one provider's value for that identity, read from the env var
 * named here, and nothing else in the app may key off the raw id.
 */
export interface StripePricePoint {
  plan: ConfiguredPricePlan;
  interval: BillingInterval;
  currency: CheckoutCurrency;
  envVar: string;
}

export const STRIPE_PRICE_POINTS: readonly StripePricePoint[] = [
  { plan: 'basic', interval: 'monthly', currency: 'usd', envVar: 'STRIPE_PRICE_BASIC_MONTHLY_USD' },
  { plan: 'basic', interval: 'monthly', currency: 'inr', envVar: 'STRIPE_PRICE_BASIC_MONTHLY_INR' },
  { plan: 'pro', interval: 'monthly', currency: 'usd', envVar: 'STRIPE_PRICE_PRO_MONTHLY' },
  { plan: 'max', interval: 'monthly', currency: 'usd', envVar: 'STRIPE_PRICE_MAX_MONTHLY' },
  { plan: 'max_15x', interval: 'monthly', currency: 'usd', envVar: 'STRIPE_PRICE_MAX_15X_MONTHLY' },
  { plan: 'team', interval: 'monthly', currency: 'usd', envVar: 'STRIPE_PRICE_TEAM_MONTHLY_USD' },
  { plan: 'team', interval: 'monthly', currency: 'inr', envVar: 'STRIPE_PRICE_TEAM_MONTHLY_INR' },
  { plan: 'team', interval: 'yearly', currency: 'usd', envVar: 'STRIPE_PRICE_TEAM_YEARLY_USD' },
  {
    plan: 'team_premium',
    interval: 'monthly',
    currency: 'usd',
    envVar: 'STRIPE_PRICE_TEAM_PREMIUM_MONTHLY_USD',
  },
  {
    plan: 'team_premium',
    interval: 'yearly',
    currency: 'usd',
    envVar: 'STRIPE_PRICE_TEAM_PREMIUM_YEARLY_USD',
  },
];

export function normalizeCheckoutCurrency(currency: string | undefined): CheckoutCurrency {
  return currency?.toLowerCase() === 'inr' ? 'inr' : DEFAULT_CHECKOUT_CURRENCY;
}

function pricePointKey(
  plan: ConfiguredPricePlan,
  interval: BillingInterval,
  currency: CheckoutCurrency,
): string {
  return `${plan}:${interval}:${currency}`;
}

// Resolved once, at module load: the environment is read at boot so a missing
// or malformed price id is reported once rather than on every checkout.
const CONFIGURED_PRICE_IDS: ReadonlyMap<string, string> = new Map(
  STRIPE_PRICE_POINTS.flatMap((point) => {
    const priceId = validatePriceId(process.env[point.envVar], point.envVar);
    return priceId === undefined
      ? []
      : [[pricePointKey(point.plan, point.interval, point.currency), priceId] as const];
  }),
);

function priceIdAt(
  plan: ConfiguredPricePlan,
  interval: BillingInterval,
  currency: CheckoutCurrency,
): string | undefined {
  return CONFIGURED_PRICE_IDS.get(pricePointKey(plan, interval, currency));
}

export const STRIPE_PRICE_IDS = {
  basic: {
    monthlyUsd: priceIdAt('basic', 'monthly', 'usd'),
    monthlyInr: priceIdAt('basic', 'monthly', 'inr'),
  },
  pro: {
    monthly: priceIdAt('pro', 'monthly', 'usd'),
  },
  max: {
    monthly: priceIdAt('max', 'monthly', 'usd'),
  },
  max_15x: {
    monthly: priceIdAt('max_15x', 'monthly', 'usd'),
  },
  team: {
    monthlyUsd: priceIdAt('team', 'monthly', 'usd'),
    monthlyInr: priceIdAt('team', 'monthly', 'inr'),
    yearlyUsd: priceIdAt('team', 'yearly', 'usd'),
  },
  team_premium: {
    monthlyUsd: priceIdAt('team_premium', 'monthly', 'usd'),
    yearlyUsd: priceIdAt('team_premium', 'yearly', 'usd'),
  },
};

export function arePriceIdsConfigured(): boolean {
  const plans = ['pro', 'max', 'max_15x'] as const;
  return plans.some((plan) => STRIPE_PRICE_IDS[plan].monthly !== undefined);
}

export function getConfiguredPriceId(
  plan: ConfiguredPricePlan,
  interval: BillingInterval,
  currency?: string,
): string | undefined {
  const requested = normalizeCheckoutCurrency(currency);
  return (
    priceIdAt(plan, interval, requested) ??
    (requested === DEFAULT_CHECKOUT_CURRENCY
      ? undefined
      : priceIdAt(plan, interval, DEFAULT_CHECKOUT_CURRENCY))
  );
}

/**
 * The price point a Stripe price id belongs to, or null when the id is not one
 * this deployment configured.
 */
export function getPricePointForPriceId(priceId: string): StripePricePoint | null {
  return (
    STRIPE_PRICE_POINTS.find(
      (point) => priceIdAt(point.plan, point.interval, point.currency) === priceId,
    ) ?? null
  );
}

export const PRICING_CONFIG = {
  plans: [
    {
      id: 'basic',
      name: BILLING_PLAN_PRICING.basic.label,
      price: {
        monthly: getPlanPriceUsd('basic', 'monthly'),
        monthlyInr: getPlanPriceInr('basic'),
      },
      stripe_price_ids: STRIPE_PRICE_IDS.basic,
    },
    {
      id: 'pro',
      name: BILLING_PLAN_PRICING.pro.label,
      price: {
        monthly: getPlanPriceUsd('pro', 'monthly'),
      },
      stripe_price_ids: STRIPE_PRICE_IDS.pro,
    },
    {
      id: 'max',
      name: BILLING_PLAN_PRICING.max.label,
      price: {
        monthly: getPlanPriceUsd('max', 'monthly'),
      },
      stripe_price_ids: STRIPE_PRICE_IDS.max,
    },
    {
      id: 'max_15x',
      name: BILLING_PLAN_PRICING.max_15x.label,
      price: {
        monthly: getPlanPriceUsd('max_15x', 'monthly'),
      },
      stripe_price_ids: STRIPE_PRICE_IDS.max_15x,
    },
    {
      id: 'team',
      name: BILLING_PLAN_PRICING.team.label,
      price: {
        monthly: getPlanPriceUsd('team', 'monthly'),
        monthlyInr: getPlanPriceInr('team'),
        yearly: getPlanPriceUsd('team', 'yearly'),
      },
      perSeat: true,
      stripe_price_ids: STRIPE_PRICE_IDS.team,
    },
  ],
  getPlanFromPriceId: (priceId: string): ConfiguredCheckoutPlan | null => {
    const plan = getPricePointForPriceId(priceId)?.plan;
    return plan ? (subscriptionPlanTierOf(plan) as ConfiguredCheckoutPlan) : null;
  },
};
