import { getAllowedModelsForTier, getDefaultModelFor } from '@agiworkforce/types';

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
 * The models free/demo users may select — the full economy/Hobby tier set straight
 * from the catalog (SSOT: `tierAllowedModels.economy`), so the free trial is a real
 * Hobby experience rather than a hand-maintained subset. Per-model capability gating
 * in the composer + server ensures a prompt is never wasted on an action the selected
 * model can't perform (e.g. images to a no-vision model).
 */
export const FREE_TRIAL_MODELS: readonly string[] = getAllowedModelsForTier('economy');
