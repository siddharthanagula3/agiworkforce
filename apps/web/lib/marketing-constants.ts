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
  wedge: 'Try AGI on the web. Local and BYOK for serious work. Managed cloud, open by default.',
  trustBoundary:
    'Website users can use AGI managed cloud, with a small free Auto Economy cap and higher-capacity paid plans rolling out. Local and BYOK are supported on desktop and developer surfaces. Managed cloud is open by default, not invite-only.',
  cloudInvite:
    'Managed cloud is open by default; higher capacity is a paid subscription, not an invite.',
} as const;

const BYOK_SURFACE_NAMES = { desktop: 'Desktop', cli: 'the CLI', vscode: 'VS Code' } as const;

function joinSurfaceNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const shippedByokSurfaces = (['desktop', 'cli', 'vscode'] as const)
  .filter((surface) => SURFACE_STATUS[surface] !== COMING_SOON_LABEL)
  .map((surface) => BYOK_SURFACE_NAMES[surface]);
const pendingByokSurfaces = (['desktop', 'cli', 'vscode'] as const)
  .filter((surface) => SURFACE_STATUS[surface] === COMING_SOON_LABEL)
  .map((surface) => BYOK_SURFACE_NAMES[surface]);

export const BYOK_SURFACES = {
  label: 'Desktop, CLI, and VS Code',
  compact: 'Desktop · CLI · VS Code',
  shipped: joinSurfaceNames(shippedByokSurfaces),
  availability:
    pendingByokSurfaces.length > 0
      ? `${joinSurfaceNames(shippedByokSurfaces)} have published releases. ${joinSurfaceNames(pendingByokSurfaces)} is coming soon.`
      : `${joinSurfaceNames(shippedByokSurfaces)} have published releases.`,
  exclusion:
    'Web, Mobile, Chrome, and the managed-only Electron shell do not accept provider keys.',
} as const;

const DESKTOP_LOCAL_RUNTIME_IDS = ['ollama', 'lmstudio', 'llamacpp', 'vllm'] as const;
const desktopLocalRuntimeNames = Object.freeze(
  DESKTOP_LOCAL_RUNTIME_IDS.map((id) =>
    modelsCatalogJson.providers[id].label.replace(/\s+\(Local\)$/, ''),
  ),
);

export const DESKTOP_LOCAL_RUNTIMES = {
  names: desktopLocalRuntimeNames,
  label: `${desktopLocalRuntimeNames.slice(0, -1).join(', ')}, and ${desktopLocalRuntimeNames[desktopLocalRuntimeNames.length - 1]}`,
  compact: desktopLocalRuntimeNames.join(' · '),
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
