/**
 * Single source of truth for all marketing statistics used across the website.
 * Import from here instead of hardcoding numbers in pages.
 *
 * RULE: a number in this file must be DERIVED from a canonical source or carry
 * the evidence for it in a comment. Numbers typed from memory are how "50+
 * models" shipped against a 31-model catalog on five pages at once.
 *
 * Model and provider counts derive from `models.json` (see `MARKETING`).
 * Surface count: 6 (Desktop, Web, Mobile, CLI, VS Code, Chrome).
 * Per-surface availability: `SURFACE_STATUS`, sourced from release tags.
 */

import { BILLING_PLAN_PRICING, modelsCatalogJson } from '@agiworkforce/types';

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

/**
 * Launch messaging — deliberately STATUS-ONLY, with no date.
 *
 * A hardcoded date here renders as a FUTURE promise across ~25 marketing pages
 * plus their SEO descriptions, and silently becomes a false claim the day it
 * passes. It did: the previous value, `July 12, 2026`, was three weeks stale
 * while every surface in `SURFACE_STATUS` still read "Coming soon" — the site
 * simultaneously advertised a launch date that had gone by and six products
 * that had not shipped.
 *
 * `isoDate` and `allProductsLabel` were already dead and are gone with it.
 *
 * To announce a real date, add the field back deliberately and update the
 * consumers that should carry it — do not reintroduce a default that every
 * page inherits by accident.
 */
export const LAUNCH = {
  publicLabel: 'Public launch: date to be announced',
  /** Compact form for chips and stat rows where the full label will not fit. */
  shortLabel: 'To be announced',
  ctaLabel: 'Get launch access',
} as const;

/**
 * Label for surfaces that genuinely have no published release.
 *
 * Kept for the three surfaces that are actually unreleased (Mobile, VS Code,
 * Chrome) and for hubs that gate on them. Do NOT reapply it to Web, Desktop,
 * or the CLI — see `SURFACE_STATUS` for why that was wrong.
 */
export const COMING_SOON_LABEL = 'Coming soon';

/**
 * Per-surface availability, stated from release evidence rather than mood.
 *
 * This map previously read `COMING_SOON_LABEL` for ALL SIX surfaces, which the
 * home page contradicted one screen away: its primary CTA is "Try AGI Web" →
 * `/login?redirectTo=%2Fchat`, and both routes exist and work. A visitor who
 * clicked through into a working product learned the site was wrong about its
 * own status.
 *
 * Evidence for each value, re-verify before changing:
 *   web      — this application. `app/login` and `app/chat` both resolve.
 *   desktop  — git tag `v-desktop-1.2.0`. `.github/workflows/release-desktop.yml`
 *              publishes Linux x86_64 + notarized universal macOS artifacts;
 *              `app/api/download/route.ts` resolves live GitHub release
 *              installers. Per-PLATFORM availability is resolved at request time
 *              by `/download` — do not restate it as a static claim here.
 *   cli      — git tag `v-cli-1.0.0`. `.github/workflows/release-cli.yml` builds
 *              six targets and publishes `@agiworkforce/cli` to npm.
 *   mobile   — ZERO `v-mobile-*` tags. Workflow exists; nothing published.
 *   vscode   — ZERO `v-vscode-*` tags. Workflow exists; nothing published.
 *   chrome   — ZERO `v-ext-*` tags. Workflow exists; nothing published.
 *
 * A surface moves off `COMING_SOON_LABEL` when it has a release tag, not when
 * it has a landing page.
 */
export const SURFACE_STATUS = {
  web: 'Available now',
  desktop: 'Released · v1.2.0',
  cli: 'Released · v1.0.0',
  mobile: COMING_SOON_LABEL,
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
      label: BILLING_PLAN_PRICING.pro.label,
      price: `$${BILLING_PLAN_PRICING.pro.monthlyPriceUsd}/mo`,
      billingInterval: `Monthly or annual ($${BILLING_PLAN_PRICING.pro.yearlyPriceUsd}/yr)`,
      usageCapacity: '5x Basic hosted capacity',
      bestFor: 'Professionals and small teams',
      ctaLabel: 'Get started',
      ctaHref: '/pricing',
      highlighted: true,
    },
    {
      planId: 'max',
      label: BILLING_PLAN_PRICING.max.label,
      price: `$${BILLING_PLAN_PRICING.max.monthlyPriceUsd}/mo`,
      billingInterval: 'Monthly only',
      usageCapacity: '5x Pro hosted capacity',
      bestFor: 'Intensive multi-agent workloads',
      ctaLabel: 'Get started',
      ctaHref: '/pricing',
    },
    {
      planId: 'max_15x',
      label: BILLING_PLAN_PRICING.max_15x.label,
      price: `$${BILLING_PLAN_PRICING.max_15x.monthlyPriceUsd}/mo`,
      billingInterval: 'Monthly only',
      usageCapacity: '15x Pro hosted capacity',
      bestFor: 'The most intensive individual workflows and video generation',
      ctaLabel: 'Get started',
      ctaHref: '/pricing',
    },
    {
      planId: 'team',
      label: BILLING_PLAN_PRICING.team.label,
      price: 'Custom',
      billingInterval: 'Sales-assisted contract',
      usageCapacity: 'Contracted managed capacity with shared team controls',
      bestFor: 'Collaborative teams needing shared context',
      ctaLabel: 'Get started',
      ctaHref: '/pricing',
      waitlist: false,
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

/**
 * Model and provider counts are DERIVED from the canonical catalog, never typed
 * by hand.
 *
 * The previous hardcoded value was `{ count: 50, display: '50+' }`, justified by
 * a comment claiming "the generated catalog currently contains 56 compatibility
 * models". It does not, and there is no evidence it ever did: `models.json`
 * holds 31. That single wrong constant rendered "50+ models" on five pages, and
 * it was the exact claim a prior audit flagged as contradicted by the code.
 *
 * Deriving from `modelsCatalogJson` means `pnpm sync:models` updates the site
 * automatically and the number CANNOT drift from the catalog again. Do not
 * replace these with literals.
 */
const CATALOG_MODEL_COUNT = Object.keys(modelsCatalogJson.models).length;
const CATALOG_PROVIDER_COUNT = Object.keys(modelsCatalogJson.providers).length;

/**
 * The catalog's own `lastUpdated` stamp, for pages that must date a mutable
 * fact (press fact sheet, colophon) instead of asserting it timelessly.
 */
export const CATALOG_AS_OF = modelsCatalogJson.lastUpdated;

export const MARKETING = {
  // `count` is the exact derived number of provider entries in models.json.
  //
  // `display` stays the conservative "10+" floor ON PURPOSE. Several pages
  // enumerate the providers around this token — /faq, for one, expands it as
  // "nine first-party cloud APIs ... and two local runtimes" — so swapping the
  // token for the exact count would make those sentences stop adding up. "10+"
  // is true (there are more than ten), and pages that want the precise figure
  // use `count` instead. Do not change `display` without rewriting every
  // sentence that enumerates around it.
  providers: {
    count: CATALOG_PROVIDER_COUNT,
    display: '10+',
    label: 'AI Providers',
  },
  // skills: 23 categories with counted skills in features/ai-skills page (168 total). 150+ is a
  // conservative defensible floor. Update when a canonical skill registry ships.
  skills: { count: 150, display: '150+', label: 'AI Skills' },
  categories: { count: 23, display: '23', label: 'Skill Categories' },
  tools: { count: 0, display: 'Tool-ready', label: 'Agent Tools' },
  // Exact, not a floor: an exact number a reader can verify is worth more than
  // a padded one they cannot.
  models: { count: CATALOG_MODEL_COUNT, display: `${CATALOG_MODEL_COUNT}`, label: 'Models' },
  surfaces: { count: 6, display: '6', label: 'Platforms' },
  appSize: { value: 0, display: 'Native', label: 'Desktop Build' },
  tagline:
    'Local-first privacy. Explicit BYOK. Multi-provider routing. Privacy-controlled managed compute.',
} as const;
