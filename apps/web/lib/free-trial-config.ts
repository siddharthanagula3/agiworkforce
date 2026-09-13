import {
  canAccessModelForSubscriptionTier,
  getAllowedModelsForTier,
  getDefaultModelFor,
  normalizeBillingPlanTier,
} from '@agiworkforce/types';

const FREE_PLAN_TIER = normalizeBillingPlanTier(null);

export const FREE_TRIAL_MODEL = getDefaultModelFor(FREE_PLAN_TIER, 'chat');

export const FREE_TRIAL_MODELS: readonly string[] = getAllowedModelsForTier('economy').filter(
  (modelId) => canAccessModelForSubscriptionTier(modelId, FREE_PLAN_TIER),
);
