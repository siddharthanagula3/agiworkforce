import {
  SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER,
  classifyManagedQuotaErrorCode,
  getBillingPlanPricing,
  getNextUpgradeTier,
  isBillingPlanTier,
  isContractPricedPlan,
  isFreeOfChargePlanTier,
  isPerSeatBillingPlan,
  isSelfServeIndividualPlanTier,
  normalizeBillingPlanTier,
  type BillingPlanTier,
  type ManagedUsageSummaryResponse,
  type SelfServeIndividualPlanTier,
} from '@agiworkforce/types';
import type { MediaPaywallRecoveryAction } from '@/lib/hooks/useMediaGeneration';
import type { MessageMetadata } from '@shared/stores/web-chat-store';

export type MediaPaywallFeature = 'image' | 'video';

export interface MediaBillingRefusal {
  readonly isPaywall: boolean;
  readonly message: string;
  readonly code?: string;
  readonly currentPlan?: string;
  readonly requiredPlans?: readonly string[];
  readonly resetAt?: string;
  readonly recoveryAction: MediaPaywallRecoveryAction | null;
}

export interface MediaPaywallRecoveryHandlers {
  openSettings: (section: 'billing' | 'usage') => void;
  openUpgrade: (targetTier: SelfServeIndividualPlanTier) => void;
}

type PaywallSlot = NonNullable<MessageMetadata['paywall']>;
type PaidBillingPlanTier = Exclude<BillingPlanTier, 'local-only' | 'byok' | 'free'>;

const DEFAULT_REQUIRED_TIER: Readonly<Record<MediaPaywallFeature, PaidBillingPlanTier>> = {
  image: 'pro',
  video: 'max_15x',
};

function isPaidBillingPlanTier(value: string): value is PaidBillingPlanTier {
  return isBillingPlanTier(value) && !['local-only', 'byok', 'free'].includes(value);
}

function resolveRequiredTier(
  feature: MediaPaywallFeature,
  requiredPlans: readonly string[] | undefined,
): PaidBillingPlanTier {
  const candidates = new Set(
    (requiredPlans ?? []).map((plan) => plan.toLowerCase()).filter(isPaidBillingPlanTier),
  );

  const individual = SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER.find((tier) => candidates.has(tier));
  if (individual) return individual;
  if (candidates.has('team')) return 'team';
  if (candidates.has('enterprise')) return 'enterprise';
  return DEFAULT_REQUIRED_TIER[feature];
}

function effectiveCurrentTier(
  clientTier: BillingPlanTier | null | undefined,
  serverTier: string | undefined,
): BillingPlanTier {
  return serverTier && isBillingPlanTier(serverTier.toLowerCase())
    ? (serverTier.toLowerCase() as BillingPlanTier)
    : normalizeBillingPlanTier(clientTier);
}

function quotaResetAt(
  code: string | undefined,
  usage: ManagedUsageSummaryResponse | null,
): string | undefined {
  if (!usage || !code) return undefined;
  switch (code.toLowerCase()) {
    case 'insufficient_credits':
    case 'monthly_limit_exceeded':
    case 'monthly_credit_limit_reached':
      return usage.usage_reset_at ?? undefined;
    case 'rolling_five_hour_limit_reached':
      return usage.session_reset_at ?? undefined;
    case 'rolling_weekly_limit_reached':
      return usage.weekly_reset_at ?? undefined;
    case 'flagship_weekly_limit_reached':
      return usage.flagship_weekly_reset_at ?? undefined;
    default:
      return undefined;
  }
}

function noUpgradeQuotaReason(code: string | undefined, currentTier: BillingPlanTier): string {
  const planLabel = getBillingPlanPricing(currentTier).label;
  switch (code?.toLowerCase()) {
    case 'rolling_five_hour_limit_reached':
      return 'Your current session capacity is used up. Wait for earlier usage to leave the window, or review the reset time in Usage.';
    case 'rolling_weekly_limit_reached':
      return 'Your weekly capacity is used up. Wait for earlier usage to leave the window, or review the reset time in Usage.';
    case 'flagship_weekly_limit_reached':
      return 'Your weekly capacity for the most capable models is used up. Choose a standard model, wait for the reset, or review Usage.';
    case 'rate_limit_exceeded':
      return 'Too many requests were sent in a short time. Wait a moment and try again.';
    default:
      return `Your ${planLabel} usage for this billing period is used up. Wait for the reset or review usage and billing details.`;
  }
}

function planCanUpgradeTo(currentTier: BillingPlanTier, targetTier: PaidBillingPlanTier): boolean {
  if (!isSelfServeIndividualPlanTier(targetTier)) return false;
  if (isPerSeatBillingPlan(currentTier) || isContractPricedPlan(currentTier)) return false;
  if (isFreeOfChargePlanTier(currentTier)) return true;
  const currentIndex = SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER.indexOf(
    currentTier as SelfServeIndividualPlanTier,
  );
  const targetIndex = SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER.indexOf(targetTier);
  return currentIndex < targetIndex;
}

export function resolveMediaPaywallSlot(input: {
  feature: MediaPaywallFeature;
  refusal: MediaBillingRefusal;
  currentTier: BillingPlanTier | null | undefined;
  usage: ManagedUsageSummaryResponse | null;
}): PaywallSlot | null {
  const { feature, refusal, usage } = input;
  if (!refusal.isPaywall) return null;

  const currentTier = effectiveCurrentTier(input.currentTier, refusal.currentPlan);
  const requiredTier = resolveRequiredTier(feature, refusal.requiredPlans);
  const mediaFeature = feature === 'video' ? 'video_generation' : 'image_quota';
  const code = refusal.code?.toLowerCase();

  if (code === 'subscription_required') {
    return {
      feature: mediaFeature,
      requiredTier,
      reason: refusal.message,
      recoveryAction: 'subscribe',
      showUpgradeCta: true,
      showResetTime: false,
      suggestStandardModel: false,
    };
  }

  if (code === 'subscription_inactive') {
    return {
      feature: mediaFeature,
      requiredTier: isFreeOfChargePlanTier(currentTier) ? requiredTier : currentTier,
      reason: refusal.message,
      recoveryAction: 'manage_billing',
      showUpgradeCta: true,
      showResetTime: false,
      suggestStandardModel: false,
    };
  }

  if (code === 'plan_upgrade_required') {
    const canUpgrade = planCanUpgradeTo(currentTier, requiredTier);
    return {
      feature: mediaFeature,
      requiredTier,
      reason: canUpgrade
        ? refusal.message
        : 'Your account could not confirm access to this capability. Review billing details before trying again.',
      recoveryAction: canUpgrade ? 'upgrade' : 'manage_billing',
      showUpgradeCta: true,
      showResetTime: false,
      suggestStandardModel: false,
    };
  }

  const quota = classifyManagedQuotaErrorCode(code);
  if (quota) {
    const nextTier = getNextUpgradeTier(currentTier);
    const canUpgrade = quota.showUpgradeCta && nextTier !== null;
    const resetAt = refusal.resetAt ?? quotaResetAt(code, usage);
    return {
      feature: quota.feature,
      requiredTier: nextTier ?? (isFreeOfChargePlanTier(currentTier) ? requiredTier : currentTier),
      reason: canUpgrade ? quota.reason : noUpgradeQuotaReason(code, currentTier),
      recoveryAction: canUpgrade ? 'upgrade' : 'view_usage',
      showUpgradeCta: canUpgrade || quota.kind !== 'rate_limit',
      showResetTime: quota.showResetTime,
      suggestStandardModel: quota.suggestStandardModel,
      ...(resetAt ? { resetAt } : {}),
    };
  }

  if (refusal.recoveryAction) {
    const nextTier = getNextUpgradeTier(currentTier);
    return {
      feature: mediaFeature,
      requiredTier: nextTier ?? (isFreeOfChargePlanTier(currentTier) ? requiredTier : currentTier),
      reason: nextTier ? refusal.message : noUpgradeQuotaReason(code, currentTier),
      recoveryAction: nextTier ? refusal.recoveryAction : 'view_usage',
      showUpgradeCta: true,
      showResetTime: false,
      suggestStandardModel: false,
    };
  }

  return null;
}

export function runMediaPaywallRecovery(
  selection: { recoveryAction: MediaPaywallRecoveryAction; requiredTier: string },
  handlers: MediaPaywallRecoveryHandlers,
): void {
  if (selection.recoveryAction === 'manage_billing') {
    handlers.openSettings('billing');
    return;
  }
  if (selection.recoveryAction === 'view_usage') {
    handlers.openSettings('usage');
    return;
  }
  if (selection.recoveryAction === 'top_up') {
    handlers.openSettings('billing');
    return;
  }
  if (isSelfServeIndividualPlanTier(selection.requiredTier)) {
    handlers.openUpgrade(selection.requiredTier);
    return;
  }
  handlers.openSettings('billing');
}
