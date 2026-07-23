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

  it('keeps Gemini 3.1 Flash Lite available as the default Free chat model', () => {
    expect(FREE_TRIAL_MODEL).toBe('gemini-3.1-flash-lite');
    expect(FREE_TRIAL_MODELS).toContain('gemini-3.1-flash-lite');
  });

  it('offers GPT-5.4 Mini on Free while keeping GPT-5.6 Luna paid', () => {
    expect(FREE_TRIAL_MODELS).toContain('gpt-5.4-mini');
    expect(FREE_TRIAL_MODELS).not.toContain('gpt-5.6-luna');
    expect(FREE_TRIAL_MODELS).not.toContain('gemini-3.6-flash');
  });
});
