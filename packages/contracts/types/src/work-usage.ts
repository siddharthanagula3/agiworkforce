import {
  classifyManagedQuotaErrorCode,
  getNextUpgradeTier,
  isFreeBillingPlanTier,
  isSelfServePaidPlanTier,
} from './billing-catalog';
import type { ManagedUsageCredits } from './managed-usage-balance';
import { PRODUCT_NAMES } from './product-names';
import type { ManagedUsageBucketReading } from './usage-vocabulary';

export const ACCOUNT_WIDE_USAGE_FEATURES: ReadonlySet<string> = new Set([
  'token_cap',
  'rolling_capacity',
]);

export function isAccountWideUsageFeature(feature: string): boolean {
  return ACCOUNT_WIDE_USAGE_FEATURES.has(feature);
}

export type WorkUsageRecovery = 'add_credits' | 'enable_usage_credits' | 'upgrade' | 'wait';

export function resolveWorkUsageRecovery(
  code: string | null | undefined,
  tier: string | null | undefined,
): WorkUsageRecovery | null {
  const block = classifyManagedQuotaErrorCode(code);
  if (!block || !isAccountWideUsageFeature(block.feature) || block.suggestStandardModel) {
    return null;
  }
  if (isFreeBillingPlanTier(tier)) return 'upgrade';
  if (block.clearedByCredits && isSelfServePaidPlanTier(tier)) return 'add_credits';
  return getNextUpgradeTier(tier) ? 'upgrade' : 'wait';
}

export function resolvePlanUsageRecovery(tier: string | null | undefined): WorkUsageRecovery {
  if (isFreeBillingPlanTier(tier)) return 'upgrade';
  if (isSelfServePaidPlanTier(tier)) return 'add_credits';
  return getNextUpgradeTier(tier) ? 'upgrade' : 'wait';
}

export function workUsageRecoveryActionLabel(recovery: WorkUsageRecovery): string | null {
  if (recovery === 'wait') return null;
  return WORK_USAGE_COPY.action[recovery];
}

export interface UsageSnapshotExhaustionInput {
  planTier: string | null | undefined;
  hasUsageRemaining: boolean;
  usageAllocation?: 'provisioned' | 'pending' | null;
  credits?: ManagedUsageCredits | null;
  readings: readonly ManagedUsageBucketReading[];
}

function resetTime(value: ManagedUsageBucketReading['resetAt']): number | null {
  if (value === null || value === undefined) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function earliestExhaustedUsageResetAt(
  readings: readonly ManagedUsageBucketReading[],
): number | null {
  let earliest: number | null = null;
  for (const reading of readings) {
    if (!Number.isFinite(reading.percentRemaining) || reading.percentRemaining > 0) continue;
    const time = resetTime(reading.resetAt);
    if (time !== null && (earliest === null || time < earliest)) earliest = time;
  }
  return earliest;
}

/**
 * A usage snapshot blocks a send only when it cannot be wrong: the server
 * reports nothing left, the allocation is provisioned, no exhausted window has
 * reset since, and no spendable or unknown credit balance could carry the turn.
 * Everything else is left to the server's own admission.
 */
export function resolveExhaustedUsageRecovery(
  input: UsageSnapshotExhaustionInput,
  now: number = Date.now(),
): WorkUsageRecovery | null {
  if (input.hasUsageRemaining || input.usageAllocation === 'pending') return null;
  const credits = input.credits;
  if (!credits) return null;
  const purchased = credits.purchased;
  if (purchased.remaining === null || (credits.bonus?.remaining ?? 0) > 0) return null;
  if (purchased.overage_enabled && purchased.remaining > 0) return null;
  const resetAt = earliestExhaustedUsageResetAt(input.readings);
  if (resetAt !== null && resetAt <= now) return null;
  if (isFreeBillingPlanTier(input.planTier)) return 'upgrade';
  if (purchased.remaining > 0) return 'enable_usage_credits';
  return resolvePlanUsageRecovery(input.planTier);
}

export const WORK_USAGE_COPY = Object.freeze({
  title: `You’re out of ${PRODUCT_NAMES.work} usage for now`,
  addCredits: 'Add credits',
  upgrade: 'Upgrade',
  action: Object.freeze({
    add_credits: 'Add credits',
    enable_usage_credits: 'Turn on usage credits',
    upgrade: 'Upgrade',
  } satisfies Record<Exclude<WorkUsageRecovery, 'wait'>, string>),
  body: Object.freeze({
    add_credits: 'Add credits to keep going now, or wait for your usage to reset.',
    enable_usage_credits:
      'Turn on usage credits in Billing to keep going with the credits you bought, or wait for your usage to reset.',
    upgrade: 'Upgrade to keep going now, or wait for your usage to reset.',
    wait: 'Your usage comes back when it resets.',
  } satisfies Record<WorkUsageRecovery, string>),
});
