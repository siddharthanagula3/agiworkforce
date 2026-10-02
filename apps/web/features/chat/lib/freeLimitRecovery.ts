import {
  FREE_ALLOWANCE_EXHAUSTED_CODE,
  FREE_QUOTA_EXHAUSTED_CODE,
  FREE_QUOTA_EXPIRED_CODE,
  FreeLimitSchema,
  type FreeLimit,
  type FreeLimitReason,
} from '@agiworkforce/cloud-contracts';
import { getModelMetadataById, getNextUpgradeTier, getProviderOffering } from '@agiworkforce/types';

import type { PaywallSlot } from '@/features/chat/types/message-metadata';

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
};

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
  planTier: string | null | undefined;
  resetAt?: string | undefined;
}): PaywallSlot | null {
  const limit = input.freeLimit ?? limitFromCode(input.code, input.requestedModel);
  if (!limit) return null;
  const modelName = freeModelLabel(limit.model);
  if (!modelName) return null;
  const alternativeName = limit.alternative_model ? freeModelLabel(limit.alternative_model) : null;
  const resetAt = limit.resets_at ?? input.resetAt;
  const nextTier = getNextUpgradeTier(input.planTier);
  return {
    feature: FREE_LIMIT_FEATURE,
    requiredTier: nextTier ?? DEFAULT_REQUIRED_TIER,
    reason: input.message,
    recoveryAction: 'upgrade',
    showUpgradeCta: nextTier !== null,
    showResetTime: resetAt !== undefined,
    suggestStandardModel: false,
    ...(resetAt ? { resetAt } : {}),
    freeLimit: {
      modelId: limit.model,
      modelName,
      reason: limit.reason,
      ...(limit.alternative_model && alternativeName
        ? { alternativeModel: { id: limit.alternative_model, name: alternativeName } }
        : {}),
    },
  };
}
