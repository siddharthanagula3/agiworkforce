/**
 * Single source of truth for all marketing statistics used across the website.
 * Import from here instead of hardcoding numbers in pages.
 *
 * When product stats change, update ONLY this file - all pages pull from here.
 *
 * Provider count: "10+" = 9 first-party cloud APIs (Anthropic, OpenAI, Google,
 * xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu) + Ollama (local) + LM Studio
 * (local) + unlimited custom OpenAI-compatible BYO endpoints.
 *
 * Surface count: 6 (Desktop, Web, Mobile, CLI, VS Code, Chrome).
 */

/**
 * Provider labels shown in marketing surfaces. Runtime model IDs must come
 * from the canonical model catalog and provider capability metadata.
 */
export const MARKETING_MODEL_PILLS = [
  'OpenAI',
  'Anthropic',
  'Google Gemini',
  'Local LLMs',
] as const;

export const LAUNCH = {
  date: 'July 12, 2026',
  isoDate: '2026-07-12',
  shortDate: 'July 12',
  publicLabel: 'Public launch: July 12, 2026',
  allProductsLabel: 'Public launch target: July 12',
  ctaLabel: 'Get launch access',
} as const;

export const POSITIONING = {
  wedge: 'Hosted web trial. Local and BYOK for serious work. Cloud by invite.',
  trustBoundary:
    'Website users can try AGI managed Auto Economy with a small free cap. Local and BYOK are supported on desktop and developer surfaces. Higher hosted cloud is invite-only.',
  cloudInvite: 'Cloud by invite after web trial, Local, and BYOK demand prove scale.',
} as const;

export type PricingTabId = 'individual' | 'team' | 'api';

export interface PlanFeatureRow {
  planId: string;
  label: string;
  price: string;
  billingInterval: string;
  usageCapacity: string;
  bestFor: string;
  ctaLabel: string;
  ctaHref: string;
  waitlist?: boolean;
  contactSales?: boolean;
  highlighted?: boolean;
}

export const MARKETING_FEATURE_MATRIX: Record<PricingTabId, PlanFeatureRow[]> = {
  individual: [
    {
      planId: 'local-only',
      label: 'Local',
      price: 'Free',
      billingInterval: 'Forever',
      usageCapacity: 'Unlimited (device-bound)',
      bestFor: 'Offline, privacy-first use',
      ctaLabel: 'Install',
      ctaHref: '/download',
    },
    {
      planId: 'byok',
      label: 'BYOK',
      price: 'Free',
      billingInterval: 'Forever',
      usageCapacity: 'Your own API quotas',
      bestFor: 'Power users with provider accounts',
      ctaLabel: 'Install',
      ctaHref: '/download',
    },
    {
      planId: 'hobby',
      label: 'Hobby',
      price: 'Waitlist',
      billingInterval: 'Private beta',
      usageCapacity: 'Not public',
      bestFor: 'Users wanting hosted compute later',
      ctaLabel: 'Join waitlist',
      ctaHref: '/pricing',
      waitlist: true,
      highlighted: true,
    },
  ],
  team: [
    {
      planId: 'pro',
      label: 'Pro',
      price: '$29.99/mo',
      billingInterval: 'Monthly or annual',
      usageCapacity: 'Planned higher hosted capacity',
      bestFor: 'Professionals and small teams',
      ctaLabel: 'Join waitlist',
      ctaHref: '/pricing',
      waitlist: true,
    },
    {
      planId: 'max',
      label: 'Max',
      price: '$299.99/mo',
      billingInterval: 'Monthly or annual',
      usageCapacity: 'Highest planned hosted capacity',
      bestFor: 'Intensive multi-agent workloads',
      ctaLabel: 'Join waitlist',
      ctaHref: '/pricing',
      waitlist: true,
    },
  ],
  api: [
    {
      planId: 'enterprise',
      label: 'Enterprise',
      price: 'Custom',
      billingInterval: 'Annual contract',
      usageCapacity: 'Custom rollout scoping',
      bestFor: 'Organizations evaluating SSO, audit, and retention',
      ctaLabel: 'Contact sales',
      ctaHref: '/contact-sales',
      contactSales: true,
    },
  ],
};

export const MARKETING = {
  providers: { count: 10, display: '10+', label: 'AI Providers' },
  // skills: 23 categories with counted skills in features/ai-skills page (168 total). 150+ is a
  // conservative defensible floor. Update when a canonical skill registry ships.
  skills: { count: 150, display: '150+', label: 'AI Skills' },
  categories: { count: 23, display: '23', label: 'Skill Categories' },
  tools: { count: 0, display: 'Tool-ready', label: 'Agent Tools' },
  // 60 catalog entries in packages/types/src/models.json (2026-06-03) minus
  // 4 Auto-routing presets and 4 "(via OpenRouter)" duplicates = 52 unique
  // models. '50+' is the defensible floor; re-verify after pnpm sync:models.
  models: { count: 50, display: '50+', label: 'Models' },
  surfaces: { count: 6, display: '6', label: 'Platforms' },
  appSize: { value: 0, display: 'Native', label: 'Desktop Build' },
  tagline:
    'Local-first privacy. Explicit BYOK. Multi-provider routing. Privacy-controlled managed compute.',
} as const;
