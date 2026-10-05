import {
  FREE_ALLOWANCE_EXHAUSTED_CODE,
  FREE_QUOTA_DAILY_LIMIT_CODE,
  FREE_QUOTA_EXHAUSTED_CODE,
  FREE_QUOTA_EXPIRED_CODE,
  FreeLimitSchema,
  type FreeLimit,
  type FreeLimitReason,
} from '@agiworkforce/cloud-contracts';
import {
  SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER,
  canUseBillingPlanCapability,
  getModelMetadataById,
  getNextUpgradeTier,
  getProviderOffering,
  isContractPricedPlan,
  isFreeBillingPlanTier,
  isPerSeatBillingPlan,
  normalizeBillingPlanTier,
  type SelfServeIndividualPlanTier,
} from '@agiworkforce/types';

import type { PaywallSlot } from '@/features/chat/types/message-metadata';
import {
  FREE_MEDIA_PLAN_CAPABILITY,
  isFreeMediaCategory,
} from '@/features/models/lib/free-media-offer';
import {
  BYOK_RECOVERY_ACTION,
  findRecoveryHref,
  type FreeCapacityRecoveryOption,
} from './freeCapacityRecovery';

const FREE_LIMIT_FEATURE = 'model_access';
const DEFAULT_REQUIRED_TIER = 'basic';

export function readFreeLimit(value: unknown): FreeLimit | undefined {
  const parsed = FreeLimitSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function freeModelLabel(id: string): string | null {
  return getProviderOffering(id)?.displayName ?? getModelMetadataById(id)?.name ?? null;
}

const FREE_LIMIT_REASON_BY_CODE: Readonly<Record<string, FreeLimitReason>> = {
  [FREE_QUOTA_EXHAUSTED_CODE]: 'allowance_used',
  [FREE_QUOTA_EXPIRED_CODE]: 'allowance_ended',
  [FREE_ALLOWANCE_EXHAUSTED_CODE]: 'shared_pool_used',
  [FREE_QUOTA_DAILY_LIMIT_CODE]: 'daily_limit_reached',
};

function planIncludingFreeOffering(
  modelId: string,
  planTier: string | null | undefined,
): SelfServeIndividualPlanTier | null {
  const category = getProviderOffering(modelId)?.category;
  const capability =
    category && isFreeMediaCategory(category) ? FREE_MEDIA_PLAN_CAPABILITY[category] : null;
  const current = normalizeBillingPlanTier(planTier);
  if (!capability || isPerSeatBillingPlan(current) || isContractPricedPlan(current)) return null;
  const reachable = SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER.slice(
    (SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER as readonly string[]).indexOf(current) + 1,
  );
  return reachable.find((tier) => canUseBillingPlanCapability(tier, capability)) ?? null;
}

function limitFromCode(
  code: string | undefined,
  requestedModel: string | undefined,
): FreeLimit | undefined {
  const reason = code ? FREE_LIMIT_REASON_BY_CODE[code] : undefined;
  return reason && requestedModel ? { model: requestedModel, reason } : undefined;
}

export function resolveFreeLimitPaywallSlot(input: {
  code: string | undefined;
  message: string;
  freeLimit?: FreeLimit | undefined;
  requestedModel?: string | undefined;
  recovery?: readonly FreeCapacityRecoveryOption[] | undefined;
  planTier: string | null | undefined;
  resetAt?: string | undefined;
}): PaywallSlot | null {
  const limit = input.freeLimit ?? limitFromCode(input.code, input.requestedModel);
  if (!limit) return null;
  const modelName = freeModelLabel(limit.model);
  if (!modelName) return null;
  const alternativeName = limit.alternative_model ? freeModelLabel(limit.alternative_model) : null;
  const alternativeModel =
    limit.alternative_model && alternativeName
      ? { id: limit.alternative_model, name: alternativeName }
      : null;
  const resetAt = limit.resets_at ?? input.resetAt;
  const byokHref = findRecoveryHref(input.recovery, BYOK_RECOVERY_ACTION);
  const dailyLimit = limit.reason === 'daily_limit_reached';
  const nextTier = dailyLimit
    ? planIncludingFreeOffering(limit.model, input.planTier)
    : getNextUpgradeTier(input.planTier);
  const freePlan = isFreeBillingPlanTier(normalizeBillingPlanTier(input.planTier));
  return {
    feature: FREE_LIMIT_FEATURE,
    requiredTier: nextTier ?? DEFAULT_REQUIRED_TIER,
    reason: input.message,
    recoveryAction: 'upgrade',
    showUpgradeCta: (dailyLimit || freePlan) && nextTier !== null,
    showResetTime: resetAt !== undefined,
    suggestStandardModel: !dailyLimit && !freePlan && alternativeModel === null,
    ...(resetAt ? { resetAt } : {}),
    freeLimit: {
      modelId: limit.model,
      modelName,
      reason: limit.reason,
      ...(alternativeModel ? { alternativeModel } : {}),
      ...(byokHref ? { byokHref } : {}),
    },
  };
}
