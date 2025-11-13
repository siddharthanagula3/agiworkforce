/**
 * Pricing constants for AGI Workforce subscription plans
 *
 * NOTE: These Stripe Price IDs are placeholders. Replace with actual Price IDs from your Stripe dashboard.
 */

export const STRIPE_PRICE_IDS = {
  free: null, // Free tier has no Stripe price
  pro_monthly: 'price_1234567890pro_monthly', // Replace with actual Stripe Price ID
  pro_yearly: 'price_1234567890pro_yearly',   // Replace with actual Stripe Price ID
  proplus_monthly: 'price_1234567890proplus_monthly', // Replace with actual Stripe Price ID
  proplus_yearly: 'price_1234567890proplus_yearly',   // Replace with actual Stripe Price ID
  team_monthly: 'price_1234567890team_monthly', // Replace with actual Stripe Price ID
  team_yearly: 'price_1234567890team_yearly',   // Replace with actual Stripe Price ID
} as const;

export interface PricingPlan {
  id: 'free' | 'pro' | 'proplus' | 'team' | 'enterprise';
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
    automations: number | null; // null = unlimited
    apiCalls: number | null;
    storage: number | null; // in MB
    teamMembers: number | null;
  };
  popular?: boolean;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    description: 'Perfect for trying out AGI Workforce',
    monthlyPrice: 0,
    yearlyPrice: 0,
    stripePriceId: {
      monthly: null,
      yearly: null,
    },
    features: [
      '10 automations per month',
      '100 API calls per day',
      'Basic UI automation',
      'Community support',
      '1 GB storage',
    ],
    limits: {
      automations: 10,
      apiCalls: 100,
      storage: 1024, // 1 GB
      teamMembers: 1,
    },
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'For power users and professionals',
    monthlyPrice: 20,
    yearlyPrice: 200, // ~$16.67/month with yearly
    stripePriceId: {
      monthly: STRIPE_PRICE_IDS.pro_monthly,
      yearly: STRIPE_PRICE_IDS.pro_yearly,
    },
    features: [
      'Unlimited automations',
      '10,000 API calls per day',
      'Advanced UI automation',
      'Browser automation',
      'Email support',
      '10 GB storage',
      'LLM cost tracking',
    ],
    limits: {
      automations: null,
      apiCalls: 10000,
      storage: 10240, // 10 GB
      teamMembers: 1,
    },
    popular: true,
  },
  {
    id: 'proplus',
    name: 'Pro+',
    description: 'Everything in Pro plus team features',
    monthlyPrice: 60,
    yearlyPrice: 600, // ~$50/month with yearly
    stripePriceId: {
      monthly: STRIPE_PRICE_IDS.proplus_monthly,
      yearly: STRIPE_PRICE_IDS.proplus_yearly,
    },
    features: [
      'Everything in Pro',
      'Unlimited API calls',
      'Priority support',
      'Custom workflows',
      '50 GB storage',
      'Advanced analytics',
      'Webhook integration',
    ],
    limits: {
      automations: null,
      apiCalls: null,
      storage: 51200, // 50 GB
      teamMembers: 1,
    },
  },
  {
    id: 'team',
    name: 'Team',
    description: 'Collaboration features for teams',
    monthlyPrice: 40, // per user
    yearlyPrice: 400, // per user (~$33.33/month)
    stripePriceId: {
      monthly: STRIPE_PRICE_IDS.team_monthly,
      yearly: STRIPE_PRICE_IDS.team_yearly,
    },
    features: [
      'Everything in Pro+',
      'Up to 10 team members',
      'Shared automations',
      'Team analytics',
      'Role-based access control',
      '100 GB shared storage',
      'SSO (SAML)',
    ],
    limits: {
      automations: null,
      apiCalls: null,
      storage: 102400, // 100 GB
      teamMembers: 10,
    },
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Custom solutions for large organizations',
    monthlyPrice: 0, // Custom pricing
    yearlyPrice: 0, // Custom pricing
    stripePriceId: {
      monthly: null,
      yearly: null,
    },
    features: [
      'Everything in Team',
      'Unlimited team members',
      'On-premise deployment',
      'Custom integrations',
      'Dedicated support',
      'White-label options',
      'SLA guarantee',
      'Custom storage',
    ],
    limits: {
      automations: null,
      apiCalls: null,
      storage: null,
      teamMembers: null,
    },
  },
];

export const TRIAL_PERIOD_DAYS = 14;

export const GRACE_PERIOD_DAYS = 7; // Days after subscription expires before features are disabled

export function getPlanById(planId: string): PricingPlan | undefined {
  return PRICING_PLANS.find((plan) => plan.id === planId);
}

export function getStripePriceId(
  planId: string,
  interval: 'monthly' | 'yearly'
): string | null {
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
