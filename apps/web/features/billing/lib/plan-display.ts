import { translateUiPlural } from '@agiworkforce/ui';
import {
  MANAGED_USAGE_BASELINES,
  canUseBillingPlanCapability,
  connectorsReleased,
  formatCredits,
  getBillingPlanPricing,
  getBillingPlanProductLimits,
  getPlanCreditAllowance,
  getPlanPriceUsd,
  managedUsageComparisonLabel,
  managedUsageComparisonLines,
  normalizeBillingPlanTier,
  type BillingPlanCapability,
  type BillingPlanLimit,
  type BillingPlanPricing,
  type BillingPlanProductLimits,
  type BillingPlanTier,
  type SelfServePaidPlanTier,
} from '@agiworkforce/types';
import { formatUsdAmount } from './billing-format';
import {
  CURRENT_RELEASE_STATE,
  planCapabilityLabel,
  planCapabilityReleased,
  type ProductReleaseState,
} from './plan-capability-release';

export type SelectablePaidPlan = SelfServePaidPlanTier;
export type DisplayPaidPlan = SelectablePaidPlan | 'team';

export const WEB_PAID_PLAN_ORDER: readonly SelectablePaidPlan[] = [
  'basic',
  'pro',
  'max',
  'max_15x',
];

export interface PlanCreditWindows {
  fiveHour: number;
  weekly: number;
  monthly: number;
}

export function planCreditWindows(plan: string | null | undefined): PlanCreditWindows | null {
  const allowance = getPlanCreditAllowance(normalizeBillingPlanTier(plan));
  if (allowance.unlimited || allowance.monthly <= 0) return null;
  return { fiveHour: allowance.fiveHour, weekly: allowance.weekly, monthly: allowance.monthly };
}

export function planUsageComparisonLabel(plan: string | null | undefined): string | null {
  const tier = normalizeBillingPlanTier(plan);
  const baseline = MANAGED_USAGE_BASELINES[tier];
  return baseline
    ? managedUsageComparisonLabel(tier, baseline, getBillingPlanPricing(baseline).label)
    : null;
}

function limitLabel(
  limit: BillingPlanLimit,
  singular: string,
  plural: string,
  countKey: string,
): string {
  if (limit === 'unlimited') return `Unlimited ${plural}`;
  if (limit === 'custom') return `Custom ${singular} limit`;
  return translateUiPlural('settings', countKey, limit, {
    one: `{{count}} ${singular}`,
    other: `{{count}} ${plural}`,
  });
}

const BYTES_PER_GIGABYTE = 1024 ** 3;

function limitValue(limit: BillingPlanLimit, format: (value: number) => string): string {
  if (limit === 'unlimited') return 'Unlimited';
  if (limit === 'custom') return 'Custom';
  return format(limit);
}

function formatCount(value: number): string {
  return new Intl.NumberFormat(undefined).format(value);
}

function formatStorage(bytes: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'unit',
    unit: 'gigabyte',
    maximumFractionDigits: 1,
  }).format(bytes / BYTES_PER_GIGABYTE);
}

const COMPARED_LIMITS: ReadonlyArray<{
  key: keyof Pick<
    BillingPlanProductLimits,
    | 'projects'
    | 'knowledgeStorageBytes'
    | 'customMcpServers'
    | 'maxConcurrentTurns'
    | 'maxConnectorTools'
    | 'maxScheduledTasks'
  >;
  label: string;
  format: (value: number) => string;
  needsConnectors?: true;
}> = [
  { key: 'projects', label: 'Projects', format: formatCount },
  { key: 'knowledgeStorageBytes', label: 'File storage', format: formatStorage },
  {
    key: 'customMcpServers',
    label: 'Custom MCP servers',
    format: formatCount,
    needsConnectors: true,
  },
  { key: 'maxConcurrentTurns', label: 'Chats at once', format: formatCount },
  {
    key: 'maxConnectorTools',
    label: 'Connector tools',
    format: formatCount,
    needsConnectors: true,
  },
  { key: 'maxScheduledTasks', label: 'Scheduled tasks', format: formatCount },
];

const COMPARED_CAPABILITIES: readonly BillingPlanCapability[] = [
  'skills_connectors',
  'agi_work',
  'image_generation',
  'video_generation',
  'managed_api',
  'developer_surfaces',
];

const FEATURED_CAPABILITIES: readonly BillingPlanCapability[] = [
  'skills_connectors',
  'agi_work',
  'image_generation',
  'video_generation',
  'developer_surfaces',
  'team_admin',
  'enterprise_controls',
];

export interface PlanValueChange {
  label: string;
  from: string;
  to: string;
}

export interface PlanChangeSummary {
  credits: PlanValueChange[];
  limits: PlanValueChange[];
  lostCapabilities: string[];
}

export function summarizePlanChange(
  from: BillingPlanTier,
  to: BillingPlanTier,
  release: ProductReleaseState = CURRENT_RELEASE_STATE,
): PlanChangeSummary {
  const fromWindows = planCreditWindows(from);
  const toWindows = planCreditWindows(to);
  const credits: PlanValueChange[] =
    fromWindows && toWindows
      ? [
          {
            label: 'Credits per 5 hours',
            from: formatCredits(fromWindows.fiveHour),
            to: formatCredits(toWindows.fiveHour),
          },
          {
            label: 'Credits a week',
            from: formatCredits(fromWindows.weekly),
            to: formatCredits(toWindows.weekly),
          },
          {
            label: 'Credits a month',
            from: formatCredits(fromWindows.monthly),
            to: formatCredits(toWindows.monthly),
          },
        ]
      : [];

  const fromLimits = getBillingPlanProductLimits(from);
  const toLimits = getBillingPlanProductLimits(to);
  const limits: PlanValueChange[] =
    fromLimits && toLimits
      ? COMPARED_LIMITS.flatMap(({ key, label, format, needsConnectors }) => {
          if (needsConnectors && !connectorsReleased(release.connectors)) return [];
          const before = limitValue(fromLimits[key], format);
          const after = limitValue(toLimits[key], format);
          return before === after ? [] : [{ label, from: before, to: after }];
        })
      : [];

  return {
    credits,
    limits,
    lostCapabilities: COMPARED_CAPABILITIES.flatMap((capability) =>
      planCapabilityReleased(capability, release) &&
      canUseBillingPlanCapability(from, capability) &&
      !canUseBillingPlanCapability(to, capability)
        ? [planCapabilityLabel(capability, release)]
        : [],
    ),
  };
}

export interface BillingPlanDisplay {
  pricing: BillingPlanPricing;
  monthlyPriceUsd: number | null;
  usage: string[];
  features: string[];
}

export function getBillingPlanDisplay(
  plan: BillingPlanTier,
  release: ProductReleaseState = CURRENT_RELEASE_STATE,
): BillingPlanDisplay {
  const pricing = getBillingPlanPricing(plan);
  const monthlyPriceUsd = getPlanPriceUsd(plan, 'monthly');
  const limits = getBillingPlanProductLimits(plan);
  const features: string[] = [];
  const offered = (capability: BillingPlanCapability) =>
    planCapabilityReleased(capability, release) && canUseBillingPlanCapability(plan, capability);

  if (offered('managed_chat')) {
    features.push(planCapabilityLabel('managed_chat', release));
  }
  if (limits) {
    features.push(limitLabel(limits.projects, 'project', 'projects', 'counts.planProjects'));
    if (connectorsReleased(release.connectors)) {
      features.push(
        limitLabel(
          limits.customMcpServers,
          'custom MCP server',
          'custom MCP servers',
          'counts.planCustomMcpServers',
        ),
      );
    }
  }
  for (const capability of FEATURED_CAPABILITIES) {
    if (offered(capability)) {
      features.push(planCapabilityLabel(capability, release));
    }
  }

  return {
    pricing,
    monthlyPriceUsd,
    usage: managedUsageComparisonLines(plan),
    features,
  };
}

export function formatCatalogPrice(amountUsd: number): string {
  return formatUsdAmount(amountUsd);
}
