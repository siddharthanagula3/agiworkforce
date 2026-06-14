import { getAllowedModelsForTier, getRoutingSlotModel } from '@agiworkforce/types';

// Free website/cloud users get the FULL Hobby experience (the economy-tier model
// set + its features) but capped at FREE_TRIAL_PROMPT_LIMIT prompts. Every model
// ID is read from the catalog (never hardcoded) so the trial automatically tracks
// the live curation in packages/types/src/models.json.

/**
 * Default selection for a free trial: the cheapest fast model AGI routes to.
 * Resolved from the `general_fast` routing slot rather than a literal ID.
 */
export const FREE_TRIAL_MODEL = getRoutingSlotModel('general_fast');
export const FREE_TRIAL_PROMPT_LIMIT = 3;

// Per-prompt token budget. Caps a single free prompt so the 3 prompts can't be
// used to burn cost on giant inputs/outputs. Even on the priciest Hobby model the
// worst case is ~$0.016/prompt → ~$0.05 across all 3.
export const FREE_TRIAL_MAX_OUTPUT_TOKENS = 2000;
export const FREE_TRIAL_MAX_INPUT_TOKENS = 8000;
export const FREE_TRIAL_MAX_INPUT_CHARS = 32_000; // cheap char pre-filter (~8k tokens)

/**
 * The models free/demo users may select — the full economy/Hobby tier set straight
 * from the catalog (SSOT: `tierAllowedModels.economy`), so the free trial is a real
 * Hobby experience rather than a hand-maintained subset. Per-model capability gating
 * in the composer + server ensures a prompt is never wasted on an action the selected
 * model can't perform (e.g. images to a no-vision model). The shared 3-prompt cap +
 * per-prompt token budget above cover the whole set.
 */
export const FREE_TRIAL_MODELS: readonly string[] = getAllowedModelsForTier('economy');
