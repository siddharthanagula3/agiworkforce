import {
  classifyManagedQuotaErrorCode,
  getNextUpgradeTier,
  isFreeBillingPlanTier,
  isSelfServePaidPlanTier,
} from './billing-catalog';
import { PRODUCT_NAMES } from './product-names';

export const ACCOUNT_WIDE_USAGE_FEATURES: ReadonlySet<string> = new Set([
  'token_cap',
  'rolling_capacity',
]);

export function isAccountWideUsageFeature(feature: string): boolean {
  return ACCOUNT_WIDE_USAGE_FEATURES.has(feature);
}

export type WorkUsageRecovery = 'add_credits' | 'upgrade' | 'wait';

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

export const WORK_USAGE_COPY = Object.freeze({
  title: `You’re out of ${PRODUCT_NAMES.work} usage for now`,
  addCredits: 'Add credits',
  upgrade: 'Upgrade',
  body: Object.freeze({
    add_credits: 'Add credits to keep going now, or wait for your usage to reset.',
    upgrade: 'Upgrade to keep going now, or wait for your usage to reset.',
    wait: 'Your usage comes back when it resets.',
  } satisfies Record<WorkUsageRecovery, string>),
});
