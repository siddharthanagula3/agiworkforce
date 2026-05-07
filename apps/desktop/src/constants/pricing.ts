import { getPlanPriceUsd, getPlanUsageBudgetCents } from '@agiworkforce/types';

export const STRIPE_PRICE_IDS = {
  hobby_monthly: 'price_1Sgwx10zEfO6BZMh7thtFU77',
  hobby_yearly: 'price_1Sgwx20zEfO6BZMhbgpxL8TI',
  free: null,
  pro_monthly: 'price_1Sgwx20zEfO6BZMh3ix7hivi',
  pro_yearly: 'price_1Sgwx30zEfO6BZMhJXsduOyl',
  pro_plus_monthly: 'price_1TUWdM0zEfO6BZMhUc2KikXi',
  pro_plus_yearly: 'price_1TUWdN0zEfO6BZMhSMdLudHs',
  max_monthly: 'price_1Sgwx30zEfO6BZMhJqItFYKF',
  max_yearly: 'price_1Sgwx40zEfO6BZMhYS63EnfW',
} as const;

/**
 * Canonical tier IDs per platform spec:
 *   local-only / byok / hobby / pro (waitlist) / max (waitlist) / enterprise
 *
 * `free` is retained as an alias for `local-only` to keep legacy persisted
 * subscriptions and feature-gate code working until they are migrated.
 */
export type PlanId =
  | 'local-only'
  | 'byok'
  | 'hobby'
  | 'pro'
  | 'pro_plus'
  | 'max'
  | 'enterprise'
  | 'free';

export interface PricingPlan {
  id: PlanId;
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
  /** When true, the tier is gated behind a waitlist UI ("Join Waitlist"
   *  CTA instead of "Subscribe") until the post-audit launch. */
  waitlist?: boolean;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'local-only',
    name: 'Local-only',
    description: 'Run Ollama or LM Studio on your machine. No account required.',
    monthlyPrice: 0,
    yearlyPrice: 0,
    stripePriceId: {
      monthly: null,
      yearly: null,
    },
    features: [
      'Local LLMs only (Ollama, LM Studio)',
      'Single device — no sync',
      'No account, no cloud, no data leaves your machine',
    ],
    limits: {
      automations: 5,
      apiCalls: 0,
      storage: 512,
      teamMembers: 1,
      tokenCredits: 0,
    },
  },
  {
    id: 'byok',
    name: 'BYOK',
    description: 'Bring your own API keys for any first-party provider.',
    monthlyPrice: 0,
    yearlyPrice: 0,
    stripePriceId: {
      monthly: null,
      yearly: null,
    },
    features: [
      'Bring your own API keys (Anthropic, OpenAI, Google, xAI, ...)',
      'Use any provider you have access to',
      'Optional Cloud sync if Cloud mode enabled',
    ],
    limits: {
      automations: 10,
      apiCalls: 0,
      storage: 1024,
      teamMembers: 1,
      tokenCredits: 0,
    },
  },
  {
    id: 'hobby',
    name: 'Hobby',
    description: 'Managed cloud — basic models, limited credits ($5/mo target).',
    monthlyPrice: getPlanPriceUsd('hobby', 'monthly'),
    yearlyPrice: getPlanPriceUsd('hobby', 'yearly'),
    stripePriceId: {
      monthly: STRIPE_PRICE_IDS.hobby_monthly,
      yearly: STRIPE_PRICE_IDS.hobby_yearly,
    },
    features: [
      'Managed cloud LLMs (no API keys required)',
      'Speed-optimized AI models',
      'Vision & image analysis',
      'Cross-device sync (web + mobile + desktop)',
      'Community support',
    ],
    limits: {
      automations: 10,
      apiCalls: 100,
      storage: 1024,
      teamMembers: 1,
      tokenCredits: getPlanUsageBudgetCents('hobby', 'monthly'),
    },
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'Released after security audit clears — join the waitlist.',
    monthlyPrice: getPlanPriceUsd('pro', 'monthly'),
    yearlyPrice: getPlanPriceUsd('pro', 'yearly'),
    stripePriceId: {
      monthly: STRIPE_PRICE_IDS.pro_monthly,
      yearly: STRIPE_PRICE_IDS.pro_yearly,
    },
    features: [
      'Unlimited automations',
      'Balanced AI models (chat, tool use, vision)',
      'Full computer use & browser automation',
      'Image generation & analysis',
      'Web search & research',
      'Email support',
    ],
    limits: {
      automations: null,
      apiCalls: 10000,
      storage: 10240,
      teamMembers: 1,
      tokenCredits: getPlanUsageBudgetCents('pro', 'monthly'),
    },
    waitlist: true,
  },
  {
    id: 'pro_plus',
    name: 'Pro+',
    description: 'Flagship models with daily 15K-token caps + Runway video.',
    monthlyPrice: getPlanPriceUsd('pro_plus', 'monthly'),
    yearlyPrice: getPlanPriceUsd('pro_plus', 'yearly'),
    stripePriceId: {
      monthly: STRIPE_PRICE_IDS.pro_plus_monthly,
      yearly: STRIPE_PRICE_IDS.pro_plus_yearly,
    },
    features: [
      'All Pro features',
      'Flagship models (Opus 4.7, GPT-5.5) — 15K tokens/day',
      '60s/month video generation (Runway Gen-4 720p)',
      'US-only routing toggle',
      'Advanced computer use & deep research preview',
      'Priority email support',
    ],
    limits: {
      automations: null,
      apiCalls: 30000,
      storage: 20480,
      teamMembers: 1,
      tokenCredits: getPlanUsageBudgetCents('pro_plus', 'monthly'),
    },
    waitlist: true,
  },
  {
    id: 'max',
    name: 'Max',
    description: 'Released after security audit clears — join the waitlist.',
    monthlyPrice: getPlanPriceUsd('max', 'monthly'),
    yearlyPrice: getPlanPriceUsd('max', 'yearly'),
    stripePriceId: {
      monthly: STRIPE_PRICE_IDS.max_monthly,
      yearly: STRIPE_PRICE_IDS.max_yearly,
    },
    features: [
      'All Pro features',
      'Deep reasoning & thinking models',
      'Advanced agentic coding models',
      'Video generation & analysis',
      'Priority support',
    ],
    limits: {
      automations: null,
      apiCalls: null,
      storage: 51200,
      teamMembers: 1,
      tokenCredits: getPlanUsageBudgetCents('max', 'monthly'),
    },
    waitlist: true,
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

// no trials per platform spec
export const HOBBY_TRIAL_PERIOD_DAYS = 0;

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
