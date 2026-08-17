import * as vscode from 'vscode';
import {
  canUseBillingPlanCapability,
  formatPrivacyModeLabel,
  MANAGED_USAGE_BUCKET_ORDER,
  type ManagedUsageBucket,
  type ManagedUsageBucketReading,
  type UsageMeter,
  type UIPlanTier,
} from '@agiworkforce/types';
import { fetchTierInfo, type TierInfo } from '../utils/api';
import { Config } from '../platform/config';

const LOCAL_PREFIXES = ['ollama/', 'lmstudio/', 'lms/', 'local/'];
const VALID_TIERS: ReadonlySet<string> = new Set<UIPlanTier>([
  'local',
  'byok',
  'free',
  'basic',
  'pro',
  'max',
  'max_15x',
  'team',
  'enterprise',
]);

function isLocalModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return LOCAL_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function coercePlanTier(raw: string | undefined): UIPlanTier | undefined {
  if (raw === undefined) return undefined;
  const normalized = raw.toLowerCase().replace(/-/g, '_');
  const remapped =
    normalized === 'hobby'
      ? 'basic'
      : normalized === 'pro+' || normalized === 'pro_plus'
        ? 'max'
        : normalized;
  return VALID_TIERS.has(remapped) ? (remapped as UIPlanTier) : undefined;
}

export type ExtensionUsageMeter = UsageMeter & {
  accountPlanTier?: UIPlanTier;
  managedDeveloperEligible?: boolean;
  subscriptionStatus?: string;
  hasUsageRemaining?: boolean;
  buckets?: ManagedUsageBucketReading[];
  bindingBucket?: ManagedUsageBucket;
  creditBalanceCents?: number;
  overageEnabled?: boolean;
};

export function selectBindingUsageBucket(
  buckets: readonly ManagedUsageBucketReading[],
): ManagedUsageBucketReading | undefined {
  let binding: ManagedUsageBucketReading | undefined;
  for (const bucket of MANAGED_USAGE_BUCKET_ORDER) {
    const reading = buckets.find((candidate) => candidate.bucket === bucket);
    if (!reading || !Number.isFinite(reading.percentRemaining)) continue;
    if (binding === undefined || reading.percentRemaining < binding.percentRemaining) {
      binding = reading;
    }
  }
  return binding;
}

function bucketResetTimestamp(reading: ManagedUsageBucketReading): string | null {
  return typeof reading.resetAt === 'string' ? reading.resetAt : null;
}

function buildManagedMeter(tierInfo: TierInfo): ExtensionUsageMeter | null {
  const tier = coercePlanTier(tierInfo.tier);
  if (tier === undefined || tier === 'local' || tier === 'byok') return null;
  const accountPlanTier = coercePlanTier(tierInfo.accountPlanTier) ?? tier;

  if (!canUseBillingPlanCapability(tier, 'developer_surfaces')) {
    return {
      remaining: null,
      resetsAt: tierInfo.resetsAt ?? null,
      source: 'user-api-key',
      accountPlanTier,
      managedDeveloperEligible: false,
      ...(tierInfo.subscriptionStatus === undefined
        ? {}
        : { subscriptionStatus: tierInfo.subscriptionStatus }),
    };
  }

  const hasUsageRemaining =
    tierInfo.hasUsageRemaining === undefined
      ? {}
      : { hasUsageRemaining: tierInfo.hasUsageRemaining };
  const subscriptionStatus =
    tierInfo.subscriptionStatus === undefined
      ? {}
      : { subscriptionStatus: tierInfo.subscriptionStatus };

  const credits =
    tierInfo.creditBalanceCents === undefined
      ? {}
      : {
          creditBalanceCents: tierInfo.creditBalanceCents,
          overageEnabled: tierInfo.overageEnabled === true,
        };

  const buckets = tierInfo.usageBuckets ?? [];
  const binding = selectBindingUsageBucket(buckets);
  if (binding !== undefined) {
    return {
      remaining: Math.max(0, Math.min(1, binding.percentRemaining / 100)),
      resetsAt: bucketResetTimestamp(binding),
      source: 'managed-plan',
      accountPlanTier,
      managedDeveloperEligible: true,
      buckets,
      bindingBucket: binding.bucket,
      ...hasUsageRemaining,
      ...subscriptionStatus,
      ...credits,
    };
  }

  if (typeof tierInfo.usagePercentage === 'number') {
    const remaining = Math.max(0, Math.min(1, 1 - tierInfo.usagePercentage / 100));
    return {
      remaining,
      resetsAt: tierInfo.resetsAt ?? null,
      source: 'managed-plan',
      accountPlanTier,
      managedDeveloperEligible: true,
      ...hasUsageRemaining,
      ...subscriptionStatus,
      ...credits,
    };
  }

  return {
    remaining: null,
    resetsAt: tierInfo.resetsAt ?? null,
    source: 'managed-plan',
    accountPlanTier,
    managedDeveloperEligible: true,
    ...hasUsageRemaining,
    ...subscriptionStatus,
    ...credits,
  };
}

export interface ActiveModelContext {
  modelId?: string;
  isLocalRuntimeModel?: boolean;
}

function resolveActiveModel(context: ActiveModelContext): {
  modelId: string;
  isLocal: boolean;
} {
  const modelId = context.modelId ?? Config.model();
  return { modelId, isLocal: context.isLocalRuntimeModel === true || isLocalModel(modelId) };
}

export async function resolvePlanTier(
  secrets: vscode.SecretStorage,
  context: ActiveModelContext = {},
): Promise<UIPlanTier> {
  if (resolveActiveModel(context).isLocal) return 'local';

  const tierInfo = await fetchTierInfo(secrets);
  const tier = coercePlanTier(tierInfo?.tier);
  if (tier !== undefined) return tier;

  return 'byok';
}

export async function resolveUsageMeter(
  secrets: vscode.SecretStorage,
  _sessionTokens: number,
  context: ActiveModelContext = {},
): Promise<ExtensionUsageMeter> {
  if (resolveActiveModel(context).isLocal) {
    return {
      remaining: null,
      resetsAt: null,
      source: 'unbounded',
    };
  }

  const tierInfo = await fetchTierInfo(secrets);
  if (tierInfo !== undefined) {
    const managedMeter = buildManagedMeter(tierInfo);
    if (managedMeter !== null) return managedMeter;
  }

  return {
    remaining: null,
    resetsAt: null,
    source: 'user-api-key',
  };
}

export function formatManagedUsageLabel(
  remaining: number,
  limitTokens: number,
  reportedUsedTokens?: number,
): string {
  const usedTokens = reportedUsedTokens ?? Math.round((1 - remaining) * limitTokens);
  return `${fmtK(usedTokens)}/${fmtK(limitTokens)} tokens`;
}

export const CREDIT_BALANCE_LABEL = 'Credits';

export function formatCreditBalance(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatCreditSpendability(cents: number, overageEnabled: boolean): string {
  if (cents <= 0) return 'Buy credits to work past a limit';
  return overageEnabled ? 'Spent when a limit stops you' : 'Off - enable in billing to spend';
}

export function formatUsageMeterFallbackLabel(source: UsageMeter['source']): string {
  switch (source) {
    case 'unbounded':
      return `${formatPrivacyModeLabel('local')} model - no quota tracking`;
    case 'user-api-key':
      return `${formatPrivacyModeLabel('byok')} mode - no AGI-managed quota is active`;
    case 'managed-plan':
      return `${formatPrivacyModeLabel('managed')} usage unavailable`;
  }
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function daysUntilReset(resetsAt: string): number {
  const diff = new Date(resetsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}
