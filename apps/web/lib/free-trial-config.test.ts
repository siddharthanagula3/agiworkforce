import { describe, expect, it } from 'vitest';
import { getAllowedModelsForTier, getRoutingSlotModel } from '@agiworkforce/types';
import {
  FREE_TRIAL_MAX_INPUT_CHARS,
  FREE_TRIAL_MAX_INPUT_TOKENS,
  FREE_TRIAL_MAX_OUTPUT_TOKENS,
  FREE_TRIAL_MODEL,
  FREE_TRIAL_MODELS,
  FREE_TRIAL_PROMPT_LIMIT,
} from './free-trial-config';

describe('free trial config', () => {
  it('exposes the shared client and server trial caps from one module', () => {
    expect(FREE_TRIAL_PROMPT_LIMIT).toBeGreaterThan(0);
    expect(FREE_TRIAL_MAX_INPUT_CHARS).toBeGreaterThan(0);
    expect(FREE_TRIAL_MAX_INPUT_TOKENS).toBeGreaterThan(0);
    expect(FREE_TRIAL_MAX_OUTPUT_TOKENS).toBeGreaterThan(0);
  });

  it('derives the default model and model set from the catalog (no hardcoded IDs)', () => {
    expect(FREE_TRIAL_MODEL).toBe(getRoutingSlotModel('general_balanced'));
    expect(FREE_TRIAL_MODELS).toEqual(getAllowedModelsForTier('economy'));
    // the default selection must live inside the selectable Hobby set
    expect(FREE_TRIAL_MODELS).toContain(FREE_TRIAL_MODEL);
  });
});
