import 'server-only';

import {
  getAllowedModelsForTier as getCatalogAllowedModelsForTier,
  normalizeModelId,
} from '@agiworkforce/types';

/**
 * Shared model tier definitions for LLM access control.
 *
 * Canonical access policy now comes from `packages/types/src/models.json`.
 * This server helper only adapts that catalog into the web API shape.
 */

type PaidTier = 'pro' | 'max' | 'enterprise';

function normalizeTier(tier: string): 'free' | PaidTier {
  switch (tier.toLowerCase()) {
    case 'pro':
    case 'team':
      return 'pro';
    // Basic ($8/mo, formerly 'hobby') has the SAME model/feature access as
    // Pro/Max — it's differentiated only by a lower per-provider usage
    // budget (BILLING_PLAN_PRICING.basic.monthlyUsageBudgetUsd in
    // @agiworkforce/types), not by a smaller model allowlist. Mapping to
    // 'max' here (the broadest PaidTier) unlocks flagship models too;
    // without this case it fell through to 'free', which zeroed out model
    // access entirely for every Basic subscriber.
    case 'basic':
    case 'hobby':
    case 'max':
      return 'max';
    case 'enterprise':
      return 'enterprise';
    default:
      return 'free';
  }
}

function lowercaseSet(modelIds: string[]): Set<string> {
  return new Set(modelIds.map((modelId) => modelId.toLowerCase()));
}

export const ECONOMY_MODELS = lowercaseSet(getCatalogAllowedModelsForTier('economy'));

const PRO_MODELS = getCatalogAllowedModelsForTier('pro_additions').map((modelId) =>
  modelId.toLowerCase(),
);
const FLAGSHIP_MODELS = getCatalogAllowedModelsForTier('flagship_additions').map((modelId) =>
  modelId.toLowerCase(),
);

export const MODEL_TIER_REQUIREMENTS: Record<string, PaidTier[]> = Object.fromEntries([
  ...PRO_MODELS.map((modelId) => [modelId, ['pro', 'max', 'enterprise'] as PaidTier[]]),
  ...FLAGSHIP_MODELS.map((modelId) => [modelId, ['max', 'enterprise'] as PaidTier[]]),
]);

export function canAccessModel(model: string, subscriptionTier: string): boolean {
  const tier = normalizeTier(subscriptionTier);

  if (tier === 'free') {
    return false;
  }

  const modelLower = model.toLowerCase();
  if (modelLower.startsWith('auto-')) {
    return true;
  }

  const canonicalModelId = normalizeModelId(model)?.toLowerCase();
  if (!canonicalModelId) {
    return false;
  }

  const requiredTiers = MODEL_TIER_REQUIREMENTS[canonicalModelId];
  if (requiredTiers) {
    return requiredTiers.includes(tier as PaidTier);
  }

  return ECONOMY_MODELS.has(canonicalModelId);
}
