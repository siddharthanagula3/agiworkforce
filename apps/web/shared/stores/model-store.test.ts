import { describe, expect, it } from 'vitest';
import { getAutoRoutingProfiles } from '@agiworkforce/types';
import { AVAILABLE_MODELS, useModelStore } from './model-store';

describe('web model selection trust boundary', () => {
  it('classifies Auto routing profiles as managed cloud without fake model metadata', () => {
    useModelStore.getState().setSelectedModel('auto-balanced');

    expect(useModelStore.getState().selectedModelId).toBe('auto-balanced');
    expect(useModelStore.getState().selectedProvider).toBe('managed_cloud');
  });

  it('uses canonical Auto profile labels and descriptions without a web-owned copy', () => {
    const autoRows = AVAILABLE_MODELS.filter((model) => model.providerKey === 'managed_cloud');

    expect(autoRows.map(({ id, name, description }) => ({ id, name, description }))).toEqual(
      getAutoRoutingProfiles().map(({ id, label, description }) => ({
        id,
        name: label,
        description,
      })),
    );
  });
});
