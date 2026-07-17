import { getPlanPriceUsd, getPlanPriceInr, getPlanUsageBudgetCents } from '@agiworkforce/types';

// 2026-07-02: 'hobby' (target $5/mo) and 'pro_plus' were removed from the
// shared catalog (packages/contracts/types/src/billing-catalog.ts, commit 343457c8d,
// "no users, fresh start"). This file wasn't updated at the time, so it kept
// referencing both — silently falling back to $0 via normalizeBillingPlanTier
// (getPlanPriceUsd('hobby', ...) → unknown tier → 'free' → $0), while still
// pointing 'hobby' at a REAL, active, live-mode Stripe price
// (price_1Sgwx10zEfO6BZMh7thtFU77, confirmed via `stripe prices retrieve
// --live`: $10.00/mo, lookup_key "Hobby_month" — not the $5 the old comment
// claimed, and not the $8 the new Basic tier prices at). Replaced with the
// current 'basic' tier and its own dedicated Stripe prices (test-mode IDs
// below; see the platform-lead handoff notes for the live-mode equivalents
// pending explicit approval to create real production prices).
export const STRIPE_PRICE_IDS = {
  basic_monthly_usd: 'price_1ToutN0zEfO6BZMhHloQY5RM', // test mode — $8/mo
  basic_monthly_inr: 'price_1ToutS0zEfO6BZMhdWLMNOd2', // test mode — ₹399/mo
  free: null,
  pro_monthly: 'price_1Sgwx20zEfO6BZMh3ix7hivi',
  pro_yearly: 'price_1Sgwx30zEfO6BZMhJXsduOyl',
  max_monthly: 'price_1Sgwx30zEfO6BZMhJqItFYKF',
  max_yearly: 'price_1Sgwx40zEfO6BZMhYS63EnfW',
} as const;

/**
 * Canonical tier IDs per platform spec:
 *   local-only / byok / free / basic / pro / max / enterprise
 */
export type PlanId = 'local-only' | 'byok' | 'free' | 'basic' | 'pro' | 'max' | 'enterprise';

export interface PricingPlan {
  id: PlanId;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  /** India-specific monthly price in INR, when this plan has one (currently only 'basic'). */
  monthlyPriceInr?: number | null;
  stripePriceId: {
    monthly: string | null;
    yearly: string | null;
    /** INR-currency Price object for the same plan, when it has one (currently only 'basic'). */
    monthlyInr?: string | null;
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
    name: 'Local Mode',
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
    name: 'Local Mode + BYOK',
    description: 'Keep the desktop app local while using your own provider API keys.',
    monthlyPrice: 0,
    yearlyPrice: 0,
    stripePriceId: {
      monthly: null,
      yearly: null,
    },
    features: [
      'Bring your own API keys (Anthropic, OpenAI, Google, xAI, ...)',
      'Use any provider you have access to',
      'No AGI-managed model credits; pay providers directly',
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
    id: 'basic',
    name: 'Basic',
    description: 'Managed cloud, entry tier — $2/mo of API credits included.',
    monthlyPrice: getPlanPriceUsd('basic', 'monthly'),
    yearlyPrice: 0,
    monthlyPriceInr: getPlanPriceInr('basic'),
    stripePriceId: {
      monthly: STRIPE_PRICE_IDS.basic_monthly_usd,
      yearly: null,
      monthlyInr: STRIPE_PRICE_IDS.basic_monthly_inr,
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
      tokenCredits: getPlanUsageBudgetCents('basic', 'monthly'),
    },
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'Released after security audit clears.',
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
    id: 'max',
    name: 'Max',
    description: 'Released after security audit clears.',
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
