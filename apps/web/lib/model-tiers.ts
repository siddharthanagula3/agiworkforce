import 'server-only';

import {
  getAllowedModelsForTier as getCatalogAllowedModelsForTier,
  normalizeModelId,
} from '@agiworkforce/types';

/**
 * Shared model tier definitions for LLM access control.
 *
 * Canonical access policy now comes from `packages/contracts/types/src/models.json`.
 * This server helper only adapts that catalog into the web API shape.
 */

type PaidTier = 'pro' | 'max' | 'enterprise';

function normalizeTier(tier: string): 'free' | PaidTier {
  // Basic ($8/mo, formerly 'hobby') shares PRO's model set — the tiers are
  // differentiated by usage budget
  // (BILLING_PLAN_PRICING.basic.monthlyUsageBudgetUsd in
  // @agiworkforce/types), not by allowlist. Founder directive 2026-07-16:
  // flagship models (Opus/Fable/Sol class) are max/enterprise ONLY — the
  // earlier basic→'max' mapping wrongly let an $8 subscriber pick flagship
  // models a $20 Pro user cannot.
  switch (tier.toLowerCase()) {
    case 'pro':
    case 'team':
    case 'basic':
    case 'hobby':
      return 'pro';
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
