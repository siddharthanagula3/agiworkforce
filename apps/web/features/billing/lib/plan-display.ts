import {
  canUseBillingPlanCapability,
  formatCredits,
  getBillingPlanPricing,
  getBillingPlanProductLimits,
  getPlanCreditAllowance,
  getPlanPriceUsd,
  isMax15xPlanTier,
  isMaxPlanTier,
  isPerSeatBillingPlan,
  isProPlanTier,
  managedUsageComparisonLabel,
  normalizeBillingPlanTier,
  type BillingPlanCapability,
  type BillingPlanLimit,
  type BillingPlanPricing,
  type BillingPlanProductLimits,
  type BillingPlanTier,
  type SelfServePaidPlanTier,
} from '@agiworkforce/types';
import { formatUsdAmount } from './billing-format';

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

export function formatPlanCreditWindows(plan: string | null | undefined): string | null {
  const windows = planCreditWindows(plan);
  if (!windows) return null;
  return [
    `${formatCredits(windows.fiveHour)} per 5 hours`,
    `${formatCredits(windows.weekly)} a week`,
    `${formatCredits(windows.monthly)} a month`,
  ].join(' · ');
}

function usageBaselineOf(plan: BillingPlanTier): BillingPlanTier | null {
  if (isProPlanTier(plan)) return 'basic';
  if (isMaxPlanTier(plan) || isMax15xPlanTier(plan) || isPerSeatBillingPlan(plan)) return 'pro';
  return null;
}

export function planUsageComparisonLabel(plan: string | null | undefined): string | null {
  const tier = normalizeBillingPlanTier(plan);
  const baseline = usageBaselineOf(tier);
  return baseline
    ? managedUsageComparisonLabel(tier, baseline, getBillingPlanPricing(baseline).label)
    : null;
}

function limitLabel(limit: BillingPlanLimit, singular: string, plural: string): string {
  if (limit === 'unlimited') return `Unlimited ${plural}`;
  if (limit === 'custom') return `Custom ${singular} limit`;
  return `${String(limit)} ${limit === 1 ? singular : plural}`;
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
}> = [
  { key: 'projects', label: 'Projects', format: formatCount },
  { key: 'knowledgeStorageBytes', label: 'Knowledge storage', format: formatStorage },
  { key: 'customMcpServers', label: 'Custom MCP servers', format: formatCount },
  { key: 'maxConcurrentTurns', label: 'Chats at once', format: formatCount },
  { key: 'maxConnectorTools', label: 'Connector tools', format: formatCount },
  { key: 'maxScheduledTasks', label: 'Scheduled tasks', format: formatCount },
];

const COMPARED_CAPABILITIES: ReadonlyArray<readonly [BillingPlanCapability, string]> = [
  ['skills_connectors', 'Skills and connectors'],
  ['agi_work', 'AGI Work'],
  ['image_generation', 'Image generation'],
  ['video_generation', 'Video generation'],
  ['managed_api', 'Managed API access'],
  ['developer_surfaces', 'Managed CLI, Chrome, and VS Code access'],
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

export function summarizePlanChange(from: BillingPlanTier, to: BillingPlanTier): PlanChangeSummary {
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
      ? COMPARED_LIMITS.flatMap(({ key, label, format }) => {
          const before = limitValue(fromLimits[key], format);
          const after = limitValue(toLimits[key], format);
          return before === after ? [] : [{ label, from: before, to: after }];
        })
      : [];

  return {
    credits,
    limits,
    lostCapabilities: COMPARED_CAPABILITIES.flatMap(([capability, label]) =>
      canUseBillingPlanCapability(from, capability) && !canUseBillingPlanCapability(to, capability)
        ? [label]
        : [],
    ),
  };
}

export interface BillingPlanDisplay {
  pricing: BillingPlanPricing;
  monthlyPriceUsd: number | null;
  yearlyPriceUsd: number | null;
  annualAvailable: boolean;
  features: string[];
}

export function getBillingPlanDisplay(plan: BillingPlanTier): BillingPlanDisplay {
  const pricing = getBillingPlanPricing(plan);
  const monthlyPriceUsd = getPlanPriceUsd(plan, 'monthly');
  const yearlyPriceUsd = getPlanPriceUsd(plan, 'yearly');
  const limits = getBillingPlanProductLimits(plan);
  const features: string[] = [];

  const creditWindows = formatPlanCreditWindows(plan);
  if (creditWindows) features.push(creditWindows);
  if (canUseBillingPlanCapability(plan, 'managed_chat')) features.push('Managed chat and tools');
  if (limits) {
    features.push(limitLabel(limits.projects, 'project', 'projects'));
    features.push(limitLabel(limits.customMcpServers, 'custom MCP server', 'custom MCP servers'));
  }
  if (canUseBillingPlanCapability(plan, 'skills_connectors')) {
    features.push('Skills and connectors');
  }
  if (canUseBillingPlanCapability(plan, 'agi_work')) features.push('AGI Work');
  if (canUseBillingPlanCapability(plan, 'image_generation')) features.push('Image generation');
  if (canUseBillingPlanCapability(plan, 'video_generation')) features.push('Video generation');
  if (canUseBillingPlanCapability(plan, 'developer_surfaces')) {
    features.push('Managed CLI, Chrome, and VS Code access');
  }
  if (canUseBillingPlanCapability(plan, 'team_admin')) features.push('Team administration');
  if (canUseBillingPlanCapability(plan, 'enterprise_controls')) {
    features.push('Enterprise controls');
  }

  return {
    pricing,
    monthlyPriceUsd,
    yearlyPriceUsd,
    annualAvailable: yearlyPriceUsd !== null && yearlyPriceUsd > 0,
    features,
  };
}

export function formatCatalogPrice(amountUsd: number): string {
  return formatUsdAmount(amountUsd);
}
