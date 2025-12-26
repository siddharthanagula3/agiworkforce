// apps/web/lib/pricing.ts

export const STRIPE_PRICE_IDS = {
  hobby: {
    monthly: process.env.STRIPE_PRICE_HOBBY_MONTHLY ?? 'price_1Sgwx10zEfO6BZMh7thtFU77',
    annual: process.env.STRIPE_PRICE_HOBBY_YEARLY ?? 'price_1Sgwx20zEfO6BZMhbgpxL8TI',
  },
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? 'price_1Sgwx20zEfO6BZMh3ix7hivi',
    annual: process.env.STRIPE_PRICE_PRO_YEARLY ?? 'price_1Sgwx30zEfO6BZMhJXsduOyl',
  },
  max: {
    monthly: process.env.STRIPE_PRICE_MAX_MONTHLY ?? 'price_1Sgwx30zEfO6BZMhJqItFYKF',
    annual: process.env.STRIPE_PRICE_MAX_YEARLY ?? 'price_1Sgwx40zEfO6BZMhYS63EnfW',
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
    for (const plan of PRICING_CONFIG.plans) {
      if (Object.values(plan.stripe_price_ids).includes(priceId)) {
        return plan.id;
      }
    }
    return null;
  },
};
