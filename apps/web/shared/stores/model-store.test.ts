import { describe, expect, it } from 'vitest';
import { getAutoRoutingProfiles, getModelsForTierAndSurface } from '@agiworkforce/types';
import { AVAILABLE_MODELS, resolveSelectableModelId, useModelStore } from './model-store';

describe('web model selection trust boundary', () => {
  it('classifies Auto routing profiles as managed cloud without fake model metadata', () => {
    const selectableAutoProfile = getAutoRoutingProfiles()[0];
    expect(selectableAutoProfile).toBeDefined();
    useModelStore.getState().setSelectedModel(selectableAutoProfile!.id);

    expect(useModelStore.getState().selectedModelId).toBe(selectableAutoProfile!.id);
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

  it('derives manual rows from the shared Max + web runtime intersection', () => {
    const expectedIds = getModelsForTierAndSurface('max', 'web/cloud-chat', {
      modelTypes: ['chat', 'code', 'reasoning', 'multimodal', 'search'],
    }).map((model) => model.id);
    const actualIds = AVAILABLE_MODELS.filter(
      (model) => model.providerKey !== 'managed_cloud' && model.availability !== 'coming_soon',
    ).map((model) => model.id);

    expect(actualIds).toEqual(expectedIds);
  });

  it('rehydrates an unknown persisted model to the canonical default', async () => {
    localStorage.setItem(
      'agi-model-store',
      JSON.stringify({
        state: {
          selectedModelId: 'removed-provider-model',
          selectedProvider: 'anthropic',
        },
        version: 4,
      }),
    );

    await useModelStore.persist.rehydrate();

    expect(useModelStore.getState().selectedModelId).toBe(getAutoRoutingProfiles()[0]!.id);
    expect(useModelStore.getState().selectedProvider).toBe('managed_cloud');
  });

  it('repairs a same-version stale model instead of sending the hidden retired ID', async () => {
    localStorage.setItem(
      'agi-model-store',
      JSON.stringify({
        state: {
          selectedModelId: 'removed-provider-model',
          selectedProvider: 'anthropic',
        },
        version: 5,
      }),
    );

    await useModelStore.persist.rehydrate();

    expect(useModelStore.getState().selectedModelId).toBe(getAutoRoutingProfiles()[0]!.id);
    expect(useModelStore.getState().selectedProvider).toBe('managed_cloud');
  });

  it('rejects stale setter values and mismatched provider hints at the store boundary', () => {
    useModelStore.getState().setSelectedModel('removed-provider-model', 'anthropic');
    expect(useModelStore.getState().selectedModelId).toBe(getAutoRoutingProfiles()[0]!.id);
    expect(useModelStore.getState().selectedProvider).toBe('managed_cloud');
    expect(resolveSelectableModelId('removed-provider-model')).toBe(
      getAutoRoutingProfiles()[0]!.id,
    );

    const liveManualModel = AVAILABLE_MODELS.find(
      (model) => model.providerKey !== 'managed_cloud' && model.availability !== 'coming_soon',
    );
    expect(liveManualModel).toBeDefined();
    useModelStore.getState().setSelectedModel(liveManualModel!.id, 'fixture-provider');
    expect(useModelStore.getState().selectedProvider).toBe(liveManualModel!.providerKey);
  });
});
