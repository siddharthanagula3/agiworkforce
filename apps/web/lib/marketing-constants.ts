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

/**
 * All six surfaces are pre-launch. Marketing pages show "Coming soon"
 * instead of install/download claims; every notify CTA routes to the
 * /download page, which acts as the coming-soon hub with the waitlist form.
 */
export const COMING_SOON_LABEL = 'Coming soon';

export const SURFACE_STATUS = {
  web: COMING_SOON_LABEL,
  desktop: COMING_SOON_LABEL,
  mobile: COMING_SOON_LABEL,
  cli: COMING_SOON_LABEL,
  vscode: COMING_SOON_LABEL,
  chrome: COMING_SOON_LABEL,
} as const;

/** Default CTA for surfaces that are not yet available: routes to the notify hub. */
export const NOTIFY_CTA = {
  label: 'Get notified',
  href: '/download',
} as const;

export const POSITIONING = {
  wedge:
    'Try AGI on the web. Local and BYOK for serious work. Managed cloud, open in public alpha.',
  trustBoundary:
    'Website users can use AGI managed cloud in public alpha, with a small free Auto Economy cap and higher-capacity paid plans rolling out. Local and BYOK are supported on desktop and developer surfaces. Managed cloud is open by default, not invite-only.',
  // Retained for any future managed-cloud positioning callouts. Managed cloud is
  // public alpha and open; higher capacity is a paid subscription, not an invite.
  cloudInvite:
    'Managed cloud is open in public alpha; higher capacity is a paid subscription, not an invite.',
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
  ],
  team: [
    {
      planId: 'pro',
      label: 'Pro',
      price: '$20/mo',
      billingInterval: 'Monthly or annual ($204/yr)',
      usageCapacity: 'Higher hosted capacity per month',
      bestFor: 'Professionals and small teams',
      ctaLabel: 'Get started',
      ctaHref: '/pricing',
      highlighted: true,
    },
    {
      planId: 'max',
      label: 'Max',
      price: '$100/mo',
      billingInterval: 'Monthly only',
      usageCapacity: 'Highest hosted capacity',
      bestFor: 'Intensive multi-agent workloads',
      ctaLabel: 'Get started',
      ctaHref: '/pricing',
    },
    {
      planId: 'team',
      label: 'Team',
      price: '$25/seat/mo',
      billingInterval: 'Monthly or annual ($240/seat/yr)',
      usageCapacity: 'Shared capacity pool across seats',
      bestFor: 'Collaborative teams needing shared context',
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
      usageCapacity: 'Dedicated capacity, SLA-backed',
      bestFor: 'Organizations needing SSO, audit, and data retention',
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
