import * as vscode from 'vscode';
import {
  canUseBillingPlanCapability,
  creditAmount,
  creditsFromCents,
  formatCredits,
  formatPrivacyModeLabel,
  MANAGED_USAGE_BUCKET_ORDER,
  type ManagedUsageBucket,
  type ManagedUsageBucketReading,
  type ManagedUsageCredits,
  type UsageMeter,
  type UIPlanTier,
  WORK_USAGE_COPY,
} from '@agiworkforce/types';
import { fetchTierInfo, type TierInfo } from '../utils/api';
import { Config } from '../platform/config';
import { coerceTier } from '../integrations/tierResolver';

const LOCAL_PREFIXES = ['ollama/', 'lmstudio/', 'lms/', 'local/'];
function isLocalModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return LOCAL_PREFIXES.some((prefix) => lower.startsWith(prefix));
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
  credits?: ManagedUsageCredits;
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
  const tier = coerceTier(tierInfo.tier);
  if (tier === undefined || tier === 'local' || tier === 'byok') return null;
  const accountPlanTier = coerceTier(tierInfo.accountPlanTier) ?? tier;

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

  const credits = {
    ...(tierInfo.creditBalanceCents === undefined
      ? {}
      : {
          creditBalanceCents: tierInfo.creditBalanceCents,
          overageEnabled: tierInfo.overageEnabled === true,
        }),
    ...(tierInfo.credits === undefined ? {} : { credits: tierInfo.credits }),
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

export async function resolveUsageMeter(
  secrets: vscode.SecretStorage,
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

export function formatBucketCreditsLeft(reading: ManagedUsageBucketReading): string | null {
  const { allowanceCredits, usedCredits } = reading;
  if (allowanceCredits === undefined || usedCredits === undefined || allowanceCredits <= 0) {
    return null;
  }
  return `${creditAmount(allowanceCredits - usedCredits)} of ${formatCredits(allowanceCredits)} left`;
}

export const CREDIT_BALANCE_LABEL = 'Credits';

export interface CreditBalanceSource {
  creditBalanceCents?: number;
  credits?: ManagedUsageCredits;
}

/** `/api/usage` nets purchased credits against turns in flight; the cents figure predates it. */
export function creditBalanceCredits(source: CreditBalanceSource): number | undefined {
  const purchased = source.credits?.purchased.remaining;
  if (typeof purchased === 'number') return purchased;
  return source.creditBalanceCents === undefined
    ? undefined
    : creditsFromCents(source.creditBalanceCents);
}

/** False when someone else manages the account's plan, so its user cannot buy or turn on credits. */
export function creditsSelfServe(source: CreditBalanceSource): boolean {
  return source.credits?.purchased.self_serve !== false;
}

export function formatCreditBalance(credits: number): string {
  return formatCredits(credits);
}

export function formatCreditSpendability(
  credits: number,
  overageEnabled: boolean,
  selfServe = true,
): string {
  if (!selfServe && (!overageEnabled || credits <= 0)) return WORK_USAGE_COPY.body.wait;
  if (credits <= 0) return 'Buy credits to work past a limit';
  return overageEnabled ? 'Spent when a limit stops you' : 'Off - enable in billing to spend';
}

export const CREDIT_TOP_UP_LABEL = 'Add credits';

export const USAGE_CREDITS_IN_USE_LABEL = 'Now using usage credits';

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

export function daysUntilReset(resetsAt: string): number {
  const diff = new Date(resetsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}
