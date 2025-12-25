export const STRIPE_PRICE_IDS = {
  hobby_monthly: 'price_1Sgwx10zEfO6BZMh7thtFU77',
  hobby_yearly: 'price_1Sgwx20zEfO6BZMhbgpxL8TI',
  free: null,
  pro_monthly: 'price_1Sgwx20zEfO6BZMh3ix7hivi',
  pro_yearly: 'price_1Sgwx30zEfO6BZMhJXsduOyl',
  max_monthly: 'price_1Sgwx30zEfO6BZMhJqItFYKF',
  max_yearly: 'price_1Sgwx40zEfO6BZMhYS63EnfW',
} as const;

export interface PricingPlan {
  id: 'hobby' | 'free' | 'pro' | 'max' | 'enterprise';
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  stripePriceId: {
    monthly: string | null;
    yearly: string | null;
  };
  features: string[];
  limits: {
    automations: number | null;
    apiCalls: number | null;
    storage: number | null;
    teamMembers: number | null;
    tokenCredits: number;
  };
  popular?: boolean;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    description: 'Basic access to local models',
    monthlyPrice: 0,
    yearlyPrice: 0,
    stripePriceId: {
      monthly: null,
      yearly: null,
    },
    features: ['Local LLMs only', 'Basic automations'],
    limits: {
      automations: 5,
      apiCalls: 50,
      storage: 512,
      teamMembers: 1,
      tokenCredits: 0,
    },
  },
  {
    id: 'hobby',
    name: 'Hobby',
    description: 'Perfect for getting started with AI automation',
    monthlyPrice: 10,
    yearlyPrice: 59.88,
    stripePriceId: {
      monthly: STRIPE_PRICE_IDS.hobby_monthly,
      yearly: STRIPE_PRICE_IDS.hobby_yearly,
    },
    features: ['Free to use own APIs', 'Core desktop agent', 'Community support'],
    limits: {
      automations: 10,
      apiCalls: 100,
      storage: 1024,
      teamMembers: 1,
      tokenCredits: 1,
    },
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'Unlimited automations and advanced tools',
    monthlyPrice: 29.99,
    yearlyPrice: 299.88,
    stripePriceId: {
      monthly: STRIPE_PRICE_IDS.pro_monthly,
      yearly: STRIPE_PRICE_IDS.pro_yearly,
    },
    features: ['Unlimited automations', 'Web & UI automation', '$20/mo token credits'],
    limits: {
      automations: null,
      apiCalls: 10000,
      storage: 10240,
      teamMembers: 1,
      tokenCredits: 25,
    },
    popular: true,
  },
  {
    id: 'max',
    name: 'Max',
    description: 'For heavy workloads and complex workflows',
    monthlyPrice: 299.99,
    yearlyPrice: 2999.88,
    stripePriceId: {
      monthly: STRIPE_PRICE_IDS.max_monthly,
      yearly: STRIPE_PRICE_IDS.max_yearly,
    },
    features: ['All Pro features', '$250/mo token credits'],
    limits: {
      automations: null,
      apiCalls: null,
      storage: 51200,
      teamMembers: 1,
      tokenCredits: 250,
    },
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Custom solutions for large organizations',
    monthlyPrice: 0,
    yearlyPrice: 0,
    stripePriceId: {
      monthly: null,
      yearly: null,
    },
    features: [
      'Everything in Max',
      'Unlimited team members',
      'On-premise deployment',
      'Custom integrations',
    ],
    limits: {
      automations: null,
      apiCalls: null,
      storage: null,
      teamMembers: null,
      tokenCredits: 0,
    },
  },
];

export const HOBBY_TRIAL_PERIOD_DAYS = 90;

export const GRACE_PERIOD_DAYS = 7;

export function getPlanById(planId: string): PricingPlan | undefined {
  return PRICING_PLANS.find((plan) => plan.id === planId);
}

export function getStripePriceId(planId: string, interval: 'monthly' | 'yearly'): string | null {
  const plan = getPlanById(planId);
  return plan?.stripePriceId[interval] ?? null;
}

export function calculateYearlySavings(plan: PricingPlan): number {
  const monthlyTotal = plan.monthlyPrice * 12;
  const savings = monthlyTotal - plan.yearlyPrice;
  return Math.max(0, savings);
}

export function calculateYearlySavingsPercentage(plan: PricingPlan): number {
  if (plan.monthlyPrice === 0) return 0;
  const monthlyTotal = plan.monthlyPrice * 12;
  const savings = calculateYearlySavings(plan);
  return Math.round((savings / monthlyTotal) * 100);
}

export function formatPrice(amount: number): string {
  if (amount === 0) return 'Free';
  return `$${amount}`;
}

export function formatPricePerMonth(amount: number): string {
  if (amount === 0) return 'Free';
  return `$${amount}/month`;
}
