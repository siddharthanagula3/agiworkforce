import type { BillingPlanTier } from '@agiworkforce/types';

export const STRIPE_PRICE_IDS = {
  basic_monthly_usd: 'price_1Ts6mR0zEfO6BZMhi1hSumHd', // test mode — $7/mo (matches catalog)
  basic_monthly_inr: 'price_1ToutS0zEfO6BZMhdWLMNOd2', // test mode — ₹399/mo (matches catalog)
  free: null,
  pro_monthly: 'price_1Sgwx20zEfO6BZMh3ix7hivi',
  pro_yearly: 'price_1Sgwx30zEfO6BZMhJXsduOyl',
  max_monthly: 'price_1Sgwx30zEfO6BZMhJqItFYKF',
  max_yearly: 'price_1Sgwx40zEfO6BZMhYS63EnfW',
} as const;

export type PlanId = BillingPlanTier;

export interface PricingPlan {
  id: PlanId;
  name: string;
  description: string;
  stripePriceId: {
    monthly: string | null;
    yearly: string | null;
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
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'local-only',
    name: 'Local Mode',
    description: 'Run Ollama or LM Studio on your machine. No account required.',
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
    id: 'free',
    name: 'Free',
    description: 'Managed Cloud starter usage with cross-device chat sync.',
    stripePriceId: {
      monthly: null,
      yearly: null,
    },
    features: ['Managed Cloud starter usage', 'Cross-device chat sync', 'One Cloud project'],
    limits: {
      automations: 10,
      apiCalls: 100,
      storage: 1024,
      teamMembers: 1,
      tokenCredits: 0,
    },
  },
  {
    id: 'basic',
    name: 'Basic',
    description: 'Managed Cloud entry tier with increased monthly usage.',
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
      tokenCredits: 0,
    },
  },
  {
    id: 'pro',
    name: 'Pro',
    description:
      'Managed cloud, balanced models — full computer use, image generation, and web search.',
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
      tokenCredits: 0, // inert — server-authoritative (see basic plan note)
    },
  },
  {
    id: 'max',
    name: 'Max 5x',
    description: 'Managed Cloud flagship models with 5x Pro usage capacity.',
    stripePriceId: {
      monthly: STRIPE_PRICE_IDS.max_monthly,
      yearly: STRIPE_PRICE_IDS.max_yearly,
    },
    features: [
      'All Pro features',
      'Deep reasoning & thinking models',
      'Advanced agentic coding models',
      'Priority support',
    ],
    limits: {
      automations: null,
      apiCalls: null,
      storage: 51200,
      teamMembers: 1,
      tokenCredits: 0, // inert — server-authoritative (see basic plan note)
    },
  },
  {
    id: 'max_15x',
    name: 'Max 15x',
    description: 'The highest individual managed usage tier, including video generation.',
    stripePriceId: {
      monthly: null,
      yearly: null,
    },
    features: [
      'All Max 5x features',
      '15x Pro usage capacity',
      'Video generation access',
      'Priority support',
    ],
    limits: {
      automations: null,
      apiCalls: null,
      storage: 51200,
      teamMembers: 1,
      tokenCredits: 0,
    },
  },
  {
    id: 'team',
    name: 'Team',
    description: 'Contracted managed capacity with shared team administration.',
    stripePriceId: {
      monthly: null,
      yearly: null,
    },
    features: [
      'Managed capacity sized for your organization',
      'Team administration',
      'Shared Cloud workspace controls',
    ],
    limits: {
      automations: null,
      apiCalls: 10000,
      storage: 10240,
      teamMembers: 25,
      tokenCredits: 0,
    },
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Custom solutions for large organizations',
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

export const HOBBY_TRIAL_PERIOD_DAYS = 0;

export const GRACE_PERIOD_DAYS = 7;

export function getPlanById(planId: string): PricingPlan | undefined {
  return PRICING_PLANS.find((plan) => plan.id === planId);
}

export function getStripePriceId(planId: string, interval: 'monthly' | 'yearly'): string | null {
  const plan = getPlanById(planId);
  return plan?.stripePriceId[interval] ?? null;
}

