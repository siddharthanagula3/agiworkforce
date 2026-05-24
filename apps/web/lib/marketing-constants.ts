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
 * Era-current model IDs shown in the marketing model-pill carousel on the
 * homepage. These are intentionally stable display values, not runtime model
 * selectors. Update here when the provider era advances.
 * Current era: GPT-5.5, Claude 4.7 (Opus), Gemini 3.1 Pro.
 */
export const MARKETING_MODEL_PILLS = [
  'gpt-5.5',
  'claude-opus-4-7',
  'gemini-3.1-pro-preview',
  'llama-3.3-70b',
] as const;

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
      usageCapacity: 'Higher daily credits',
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
      usageCapacity: 'Highest available capacity',
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
      usageCapacity: 'Negotiated SLA',
      bestFor: 'Organizations needing SSO, audit logs, SLA',
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
  // tools: Desktop Tauri IPC commands verified at 1,469 per SSOT (apps/desktop, 151 files).
  // "1,459+" was an earlier estimate; updating to match the verified SSOT count.
  // TODO: confirm against a live cargo grep when desktop tooling stabilises.
  tools: { count: 1469, display: '1,469+', label: 'Built-in Tools' },
  // models: 70+ is an estimate across all wired providers. Verify against models.json
  // when each provider's full catalog is registered. Do not raise without substantiation.
  models: { count: 70, display: '70+', label: 'AI Models' },
  surfaces: { count: 6, display: '6', label: 'Platforms' },
  appSize: { value: 35, display: '~35MB', label: 'App Size' },
  tagline: 'Beyond one model. Beyond one surface. AGI in your hands.',
} as const;
