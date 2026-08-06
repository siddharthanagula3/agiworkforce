import { describe, expect, it } from 'vitest';
import {
  getAllowedModelsForTier,
  getDefaultModelFor,
  getModelMetadataById,
} from '@agiworkforce/types';
import * as freeTrialConfig from './free-trial-config';

const { FREE_TRIAL_MODEL, FREE_TRIAL_MODELS } = freeTrialConfig;

describe('free trial config', () => {
  it('does not expose usage ceilings or per-message caps to client bundles', () => {
    expect(freeTrialConfig).not.toHaveProperty('FREE_TRIAL_PROMPT_LIMIT');
    expect(freeTrialConfig).not.toHaveProperty('FREE_TRIAL_PERIOD_TOKEN_BUDGET');
    expect(freeTrialConfig).not.toHaveProperty('FREE_TRIAL_MAX_INPUT_CHARS');
    expect(freeTrialConfig).not.toHaveProperty('FREE_TRIAL_MAX_INPUT_TOKENS');
    expect(freeTrialConfig).not.toHaveProperty('FREE_TRIAL_MAX_OUTPUT_TOKENS');
  });

  it('derives the default and only exposes catalog models whose minimum tier is Free', () => {
    expect(FREE_TRIAL_MODEL).toBe(getDefaultModelFor('free', 'chat'));
    expect(FREE_TRIAL_MODELS).toEqual(
      getAllowedModelsForTier('economy').filter(
        (modelId) => getModelMetadataById(modelId)?.tierPolicy?.minTier === 'free',
      ),
    );
    // the default selection must live inside the selectable Hobby set
    expect(FREE_TRIAL_MODELS).toContain(FREE_TRIAL_MODEL);
  });

  it('keeps Gemini 3.5 Flash-Lite available as the default Free chat model', () => {
    expect(FREE_TRIAL_MODEL).toBe('gemini-3.5-flash-lite');
    expect(FREE_TRIAL_MODELS).toContain('gemini-3.5-flash-lite');
  });

  it('offers exactly the three-model Free roster set by the 2026-08-04 pricing decision', () => {
    // GPT-5.6 Luna joined Free on its permanent price reduction. The roster is
    // sourced from tierPolicy.minTier in models.curation.json — models.json is
    // GENERATED, so a change made there alone is erased by `pnpm sync:models`.
    expect([...FREE_TRIAL_MODELS].sort()).toEqual([
      'gemini-3.5-flash-lite',
      'gpt-5.4-mini',
      'gpt-5.6-luna',
    ]);
    // Still paid: the rest of the Economy roster carries minTier 'basic'.
    expect(FREE_TRIAL_MODELS).not.toContain('gemini-3.6-flash');
    expect(FREE_TRIAL_MODELS).not.toContain('qwen-3.5-flash');
  });
});
