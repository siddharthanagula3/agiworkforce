import type { TFunction } from 'i18next';
import type { FreeQuotaMediaOffer } from '@agiworkforce/cloud-contracts';
import {
  BILLING_PLAN_PRICING,
  compareManagedUsage,
  connectorsReleased,
  FLAGSHIP_OF_WEEKLY_BUDGET_RATIO,
  getAllowedModelsForTier,
  getBillingPlanProductLimits,
  isEnterprisePlanTier,
  isPlanSelectableOnSurface,
  managedUsageMultiplier,
  SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER,
  TEAM_SEAT_TYPES,
  teamSeatPlanTier,
  type BillingInterval,
  type BillingPlanTier,
  type SelfServePaidPlanTier,
  type TeamSeatType,
} from '@agiworkforce/types';
import {
  localizedPricePerMonth,
  teamYearlyCheckoutReady,
  type LocalizedPlanPrices,
} from './localized-pricing';
import { isReleased, SURFACE_NAMES } from '@/lib/surface-status';
import { formatBytes } from '@shared/utils/format';
import { pricingSurfaceStatus } from '@/features/marketing/components/pricing/developer-surface-presentation';

export type PricingT = TFunction<'pricing'>;

export function withIncludedTax(base: string, tax: string | null, t: PricingT): string {
  return tax ? `${base} · ${t('taxIncluded', { tax })}` : base;
}

export const INDIVIDUAL_PLAN_CARDS = [
  'free',
  ...SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER,
] as const satisfies readonly BillingPlanTier[];
export type IndividualPlanCard = (typeof INDIVIDUAL_PLAN_CARDS)[number];

export const BUSINESS_PLAN_CARDS = [
  'team',
  'enterprise',
] as const satisfies readonly BillingPlanTier[];
export type BusinessPlanCard = (typeof BUSINESS_PLAN_CARDS)[number];

export type PlanCard = IndividualPlanCard | BusinessPlanCard;

export const FLAGSHIP_MODEL_COUNT = getAllowedModelsForTier('flagship_additions').length;

export const ENTERPRISE_TIER_BODY =
  'SSO, SCIM, and audit are shipped and entitlement-gated; we scope capacity, data retention, and rollout to how your org actually works. Reach out and we will plan it together.';

const ENTERPRISE_GOVERNANCE_FEATURE =
  "SSO, SCIM directory sync, and audit logs: shipped, gated on the Enterprise plan's entitlement. Retention windows stay contract-scoped.";

const FREE_MEDIA_FEATURE = {
  both: 'freeMediaFeatureBoth',
  image: 'freeMediaFeatureImage',
  video: 'freeMediaFeatureVideo',
} as const;

const TIER_BODY_KEYS = {
  free: 'freeTierBody',
  basic: 'basicTierBody',
  pro: 'proTierBody',
  max: 'maxTierBody',
  max_15x: 'max15xTierBody',
  team: 'teamTierBody',
} as const satisfies Record<Exclude<PlanCard, 'enterprise'>, string>;

export function presentCopy(parts: Array<string | null>): string[] {
  return parts.filter((part): part is string => Boolean(part));
}

function freeMediaFeatureKey(
  offer: FreeQuotaMediaOffer,
): (typeof FREE_MEDIA_FEATURE)[keyof typeof FREE_MEDIA_FEATURE] | null {
  if (!offer.image && !offer.video) return null;
  return FREE_MEDIA_FEATURE[offer.image && offer.video ? 'both' : offer.image ? 'image' : 'video'];
}

export function usageComparisonCopy(plan: BillingPlanTier, t: PricingT): string[] {
  const comparison = compareManagedUsage(plan);
  if (!comparison) return [];
  const baseline = BILLING_PLAN_PRICING[comparison.baseline].label;
  if (comparison.factor === 1) {
    return [t(comparison.perSeat ? 'usageSameAsPerSeat' : 'usageSameAs', { baseline })];
  }
  if (comparison.factor !== null) {
    return [
      t(comparison.perSeat ? 'usageMultiplierAllPerSeat' : 'usageMultiplierAll', {
        factor: comparison.factor,
        baseline,
      }),
    ];
  }
  return presentCopy([
    comparison.session === null
      ? null
      : t('usageMultiplierSession', { factor: comparison.session, baseline }),
    comparison.weekly === null
      ? null
      : t('usageMultiplierWeekly', { factor: comparison.weekly, baseline }),
  ]);
}

function concurrencyFeature(plan: BillingPlanTier, connectorKey: string, t: PricingT) {
  if (connectorsReleased()) return t(connectorKey);
  const chats = getBillingPlanProductLimits(plan)?.maxConcurrentTurns;
  return typeof chats === 'number' ? t('chatsAtOnce', { chats }) : null;
}

const MINUTE_MS = 60_000;

export function sandboxMinutes(plan: BillingPlanTier): number {
  return (getBillingPlanProductLimits(plan)?.sandboxTtlMs ?? 0) / MINUTE_MS;
}

function scheduledTasksAndSandboxesFeature(plan: BillingPlanTier, t: PricingT) {
  const tasks = getBillingPlanProductLimits(plan)?.maxScheduledTasks;
  const minutes = sandboxMinutes(plan);
  if (typeof tasks !== 'number' || tasks <= 0 || minutes <= 0) return null;
  return t('scheduledTasksAndSandboxes', { count: tasks, minutes });
}

function projectsWithStorageFeature(plan: BillingPlanTier, t: PricingT) {
  const limits = getBillingPlanProductLimits(plan);
  const storage = limits?.knowledgeStorageBytes;
  if (typeof limits?.projects !== 'number' || typeof storage !== 'number') return null;
  return t('projectsWithStorage', { count: limits.projects, storage: formatBytes(storage, 0) });
}

function dailyUploadsFeature(plan: BillingPlanTier, t: PricingT) {
  const limits = getBillingPlanProductLimits(plan);
  const uploads = limits?.dailyAttachmentUploads;
  if (typeof uploads !== 'number' || !limits) return null;
  return t('dailyUploads', { count: uploads, size: formatBytes(limits.maxAttachmentBytes, 0) });
}

function projectsAndStorageFeature(plan: BillingPlanTier, connectorKey: string, t: PricingT) {
  const limits = getBillingPlanProductLimits(plan);
  const storage = limits?.knowledgeStorageBytes;
  if (limits?.projects !== 'unlimited' || typeof storage !== 'number') return null;
  const withConnectors = connectorsReleased() && limits.customMcpServers === 'unlimited';
  return t(withConnectors ? connectorKey : 'projectsNoSetLimitWithStorage', {
    storage: formatBytes(storage, 0),
  });
}

export function individualPlanFeatures(
  plan: IndividualPlanCard,
  t: PricingT,
  freeMediaOffer: FreeQuotaMediaOffer,
): string[] {
  switch (plan) {
    case 'free': {
      const mediaFeature = freeMediaFeatureKey(freeMediaOffer);
      return presentCopy([
        mediaFeature ? t(mediaFeature) : null,
        t('freeFeature1'),
        projectsWithStorageFeature('free', t),
        dailyUploadsFeature('free', t),
        t('freeFeature2'),
        t('freeLocalByok', { surface: SURFACE_NAMES.cli, status: pricingSurfaceStatus('cli', t) }),
      ]);
    }
    case 'basic':
      return presentCopy([
        t('basicFeature2'),
        projectsWithStorageFeature('basic', t),
        concurrencyFeature('basic', 'basicFeature5', t),
        scheduledTasksAndSandboxesFeature('basic', t),
        t('basicFeature3'),
      ]);
    case 'pro':
      return presentCopy([
        ...usageComparisonCopy('pro', t),
        t('proFeature5'),
        projectsWithStorageFeature('pro', t),
        concurrencyFeature('pro', 'proFeature2', t),
        scheduledTasksAndSandboxesFeature('pro', t),
      ]);
    case 'max':
      return presentCopy([
        ...usageComparisonCopy('max', t),
        `All ${FLAGSHIP_MODEL_COUNT} flagship models unlocked for manual selection`,
        projectsAndStorageFeature('max', 'maxFeature4', t),
        concurrencyFeature('max', 'maxFeature5', t),
        scheduledTasksAndSandboxesFeature('max', t),
      ]);
    case 'max_15x':
      return presentCopy([
        ...usageComparisonCopy('max_15x', t),
        t('max15xFeature3'),
        projectsAndStorageFeature('max_15x', 'max15xFeature4', t),
        concurrencyFeature('max_15x', 'max15xFeature5', t),
        scheduledTasksAndSandboxesFeature('max_15x', t),
      ]);
  }
}

export function teamPlanFeatures(t: PricingT): string[] {
  return presentCopy([
    t('seatTypesNote'),
    t('teamFeature2'),
    isReleased('cli') ? t('teamFeature3') : null,
    t('teamFeature4'),
    t('teamFeature5'),
  ]);
}

export interface TeamSeatRow {
  type: TeamSeatType;
  name: string;
  price: string;
  description: string;
  alternate: string | null;
}

const SEAT_ROW_COPY = {
  standard: { name: 'seatStandardName' },
  premium: { name: 'seatPremiumName' },
} as const satisfies Record<TeamSeatType, { name: string }>;

const SEAT_PRICE_ALTERNATE_KEYS = {
  monthly: 'seatPriceMonthlyAlternate',
  yearly: 'seatPriceYearlyAlternate',
} as const satisfies Record<BillingInterval, string>;

function seatUsageDescription(type: TeamSeatType, t: PricingT): string | null {
  if (type === 'premium') {
    const factor = managedUsageMultiplier(
      teamSeatPlanTier('premium'),
      teamSeatPlanTier('standard'),
    );
    return factor === null ? null : t('seatPremiumDescription', { factor });
  }
  const comparison = compareManagedUsage(teamSeatPlanTier('standard'));
  if (!comparison) return null;
  const baseline = BILLING_PLAN_PRICING[comparison.baseline].label;
  if (comparison.factor === 1) return t('usageSameAs', { baseline });
  return comparison.factor === null
    ? null
    : t('usageMultiplierAll', { factor: comparison.factor, baseline });
}

export function teamSeatRows(
  t: PricingT,
  plans: LocalizedPlanPrices | undefined,
  interval: BillingInterval,
  locale: string | undefined,
): TeamSeatRow[] {
  const alternateInterval: BillingInterval | null =
    interval === 'yearly' ? 'monthly' : teamYearlyCheckoutReady(plans) ? 'yearly' : null;
  return TEAM_SEAT_TYPES.flatMap((type) => {
    const plan = teamSeatPlanTier(type);
    const description = seatUsageDescription(type, t);
    if (description === null || !isPlanSelectableOnSurface(plan, 'web')) return [];
    return [
      {
        type,
        name: t(SEAT_ROW_COPY[type].name),
        price: localizedPricePerMonth(plans, plan, interval, locale),
        description,
        alternate:
          alternateInterval === null
            ? null
            : t(SEAT_PRICE_ALTERNATE_KEYS[alternateInterval], {
                price: localizedPricePerMonth(plans, plan, alternateInterval, locale),
              }),
      },
    ];
  });
}

export function enterprisePlanFeatures(t: PricingT): string[] {
  return [
    t('enterpriseFeature1'),
    t('enterpriseFeature2'),
    ENTERPRISE_GOVERNANCE_FEATURE,
    t('enterpriseFeature4'),
  ];
}

export function planTierBody(plan: PlanCard, t: PricingT): string {
  return isEnterprisePlanTier(plan) ? ENTERPRISE_TIER_BODY : t(TIER_BODY_KEYS[plan]);
}

export function planFeatureLead(plan: IndividualPlanCard, t: PricingT): string | null {
  const index = INDIVIDUAL_PLAN_CARDS.indexOf(plan);
  const previous = index > 0 ? INDIVIDUAL_PLAN_CARDS[index - 1] : undefined;
  return previous ? t('everythingInPlan', { plan: BILLING_PLAN_PRICING[previous].label }) : null;
}

export function planCtaLabel(plan: SelfServePaidPlanTier, t: PricingT): string {
  switch (plan) {
    case 'basic':
      return t('basicCta');
    case 'pro':
      return t('proCta');
    case 'max':
      return t('maxCta', { plan: BILLING_PLAN_PRICING.max.label });
    case 'max_15x':
      return t('max15xCta', { plan: BILLING_PLAN_PRICING.max_15x.label });
    case 'team':
      return t('teamCta');
  }
}

export function pricingUsageExplainer(t: PricingT): string {
  return `${t('usageWindowsExplainer')} ${t('flagshipShare', {
    baseline: BILLING_PLAN_PRICING.pro.label,
    percent: Math.round(FLAGSHIP_OF_WEEKLY_BUDGET_RATIO * 100),
  })}`;
}
