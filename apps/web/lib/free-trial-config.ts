import {
  getAllowedModelsForTier,
  getDefaultModelFor,
  getModelMetadataById,
} from '@agiworkforce/types';

// Client-safe free-plan model policy. Usage ceilings intentionally do not live in
// this module: it is imported by browser components, while the free usage limit is
// private server policy and must never become a published countdown.

/**
 * Default selection for a free trial. The tier-aware catalog policy resolves
 * the current free-chat workhorse without duplicating a model ID or selecting a
 * model outside the Economy allowlist.
 */
export const FREE_TRIAL_MODEL = getDefaultModelFor('free', 'chat');

/**
 * The models free/demo users may select. Basic and Free share the Economy roster,
 * while each model's catalog `tierPolicy.minTier` is the authoritative boundary.
 * Keeping that filter here prevents paid Economy models from leaking into Free UI/API
 * surfaces without duplicating a hand-maintained model list.
 */
export const FREE_TRIAL_MODELS: readonly string[] = getAllowedModelsForTier('economy').filter(
  (modelId) => getModelMetadataById(modelId)?.tierPolicy?.minTier === 'free',
);
