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

  it('keeps the catalog-selected Free default in the selectable Free roster', () => {
    expect(FREE_TRIAL_MODEL).toBe(getDefaultModelFor('free', 'chat'));
    expect(FREE_TRIAL_MODELS).toContain(FREE_TRIAL_MODEL);
  });

  it('keeps paid Economy models out without duplicating the roster', () => {
    const paidEconomyModels = getAllowedModelsForTier('economy').filter(
      (modelId) => getModelMetadataById(modelId)?.tierPolicy?.minTier !== 'free',
    );
    expect(FREE_TRIAL_MODELS.length).toBeGreaterThan(0);
    expect(paidEconomyModels.every((modelId) => !FREE_TRIAL_MODELS.includes(modelId))).toBe(true);
  });
});
