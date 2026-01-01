// apps/web/lib/pricing.ts

export const STRIPE_PRICE_IDS = {
  hobby: {
    monthly: process.env.STRIPE_PRICE_HOBBY_MONTHLY,
    annual: process.env.STRIPE_PRICE_HOBBY_YEARLY,
  },
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
    annual: process.env.STRIPE_PRICE_PRO_YEARLY,
  },
  max: {
    monthly: process.env.STRIPE_PRICE_MAX_MONTHLY,
    annual: process.env.STRIPE_PRICE_MAX_YEARLY,
  },
};

export const PRICING_CONFIG = {
  plans: [
    {
      id: 'hobby',
      name: 'Hobby',
      price: {
        monthly: 10,
        annual: 59.88,
      },
      stripe_price_ids: STRIPE_PRICE_IDS.hobby,
    },
    {
      id: 'pro',
      name: 'Pro',
      price: {
        monthly: 29.99,
        annual: 299.88,
      },
      stripe_price_ids: STRIPE_PRICE_IDS.pro,
    },
    {
      id: 'max',
      name: 'Max',
      price: {
        monthly: 299.99,
        annual: 2999.88,
      },
      stripe_price_ids: STRIPE_PRICE_IDS.max,
    },
  ],
  getPlanFromPriceId: (priceId: string): string | null => {
    // Check all plans
    const allPlans = ['hobby', 'pro', 'max'] as const;
    for (const plan of allPlans) {
      const prices = STRIPE_PRICE_IDS[plan];
      if (prices.monthly === priceId || prices.annual === priceId) {
        return plan;
      }
    }
    return null;
  },
};
