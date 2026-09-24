import { BILLING_PLAN_PRICING, modelsCatalogJson } from '@agiworkforce/types';
import { COMING_SOON_LABEL, SURFACE_STATUS } from './surface-status';

export {
  AVAILABLE_NOW_LABEL,
  COMING_SOON_LABEL,
  NOTIFY_CTA,
  SURFACE_STATUS,
} from './surface-status';

export const MARKETING_MODEL_PILLS = [
  'OpenAI',
  'Anthropic',
  'Google Gemini',
  'Local LLMs',
] as const;

export const LAUNCH = {
  publicLabel: 'Public launch: date to be announced',
  shortLabel: 'To be announced',
  ctaLabel: 'Get launch access',
} as const;

export const POSITIONING = {
  wedge: 'Try AGI on the web. Run Local and BYOK from the CLI. Managed cloud, open by default.',
  trustBoundary:
    'Website users can use AGI managed cloud. The Free plan runs on the free models providers give away, and paid plans with more capacity are opening in stages, so an upgrade needs an access code or a place on the upgrade waitlist. The released CLI supports Local and BYOK; VS Code BYOK is coming soon. Managed cloud is open by default, not invite-only.',
  cloudInvite:
    'Managed cloud is open by default. Higher capacity is a paid subscription, and paid upgrades are opening in stages, so they need an access code or a place on the upgrade waitlist.',
} as const;

const BYOK_SURFACE_IDS = ['cli', 'vscode'] as const;
const BYOK_SURFACE_NAMES = { cli: 'the CLI', vscode: 'VS Code' } as const;

function joinSurfaceNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function sentence(names: readonly string[], one: string, many: string): string {
  if (names.length === 0) return '';
  const joined = joinSurfaceNames(names);
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)} ${names.length > 1 ? many : one}.`;
}

const shippedByokSurfaces = BYOK_SURFACE_IDS.filter(
  (surface) => SURFACE_STATUS[surface] !== COMING_SOON_LABEL,
).map((surface) => BYOK_SURFACE_NAMES[surface]);
const pendingByokSurfaces = BYOK_SURFACE_IDS.filter(
  (surface) => SURFACE_STATUS[surface] === COMING_SOON_LABEL,
).map((surface) => BYOK_SURFACE_NAMES[surface]);

export const BYOK_SURFACES = {
  label: 'CLI and VS Code',
  compact: 'CLI · VS Code',
  shipped: joinSurfaceNames(shippedByokSurfaces),
  availability: [
    sentence(shippedByokSurfaces, 'has a published release', 'have published releases'),
    sentence(pendingByokSurfaces, 'is coming soon', 'are coming soon'),
  ]
    .filter(Boolean)
    .join(' '),
  exclusion:
    'Web, Mobile, Desktop and Chrome do not accept provider keys; each runs on your AGI account.',
} as const;

const CLI_LOCAL_RUNTIME_IDS = ['ollama', 'lmstudio'] as const;
const cliLocalRuntimeNames = Object.freeze(
  CLI_LOCAL_RUNTIME_IDS.map((id) =>
    modelsCatalogJson.providers[id].label.replace(/\s+\(Local\)$/, ''),
  ),
);

export const CLI_LOCAL_RUNTIMES = {
  names: cliLocalRuntimeNames,
  label: cliLocalRuntimeNames.join(' and '),
  compact: cliLocalRuntimeNames.join(' · '),
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
      price: `$${BILLING_PLAN_PRICING.team.monthlyPriceUsd}/seat/mo`,
      billingInterval: 'Self-serve monthly; annual only where checkout offers it',
      usageCapacity: 'Pro-level hosted capacity per licensed seat with shared team controls',
      bestFor: 'Collaborative teams needing shared context',
      ctaLabel: 'Get started',
      ctaHref: '/pricing#pricing-team-title',
      waitlist: false,
    },
  ],
  api: [
    {
      planId: 'enterprise',
      label: 'Enterprise',
      price: 'Custom',
      billingInterval: 'Annual contract',
      usageCapacity: 'Uncapped managed usage, scoped to your contract',
      bestFor: 'Organizations needing SSO, audit, and data retention',
      ctaLabel: 'Contact sales',
      ctaHref: '/contact-sales',
      contactSales: true,
    },
  ],
};

const CATALOG_MODEL_COUNT = Object.keys(modelsCatalogJson.models).length;
const CATALOG_PROVIDER_COUNT = Object.keys(modelsCatalogJson.providers).length;

export const CATALOG_AS_OF = modelsCatalogJson.lastUpdated;

const HUNDRED = 100;
const TEN = 10;

export const MARKETING = {
  providers: {
    count: CATALOG_PROVIDER_COUNT,
    display: approximateCount(CATALOG_PROVIDER_COUNT),
    label: 'AI Providers',
  },
  models: { count: CATALOG_MODEL_COUNT, display: `${CATALOG_MODEL_COUNT}`, label: 'Models' },
  surfaces: { count: 6, display: '6', label: 'Platforms' },
  tagline:
    'Local-first privacy. Explicit BYOK. Multi-provider routing. Privacy-controlled managed compute.',
} as const;

export function approximateCount(count: number): string {
  if (count >= HUNDRED) return `${Math.floor(count / HUNDRED) * HUNDRED}+`;
  if (count >= TEN) return `${Math.floor(count / TEN) * TEN}+`;
  return String(count);
}
