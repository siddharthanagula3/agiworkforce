import { describe, expect, it } from 'vitest';
import {
  CHAT_MODEL_TYPES,
  getAutoRoutingProfiles,
  getModelsForTierAndSurface,
  listChatModels,
  listManagedRoutesForModel,
} from '@agiworkforce/types';
import {
  AVAILABLE_MODELS,
  findSelectableModel,
  isSelectableModelId,
  resolveSelectableModelId,
  useModelStore,
} from './model-store';

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

  it('derives manual rows from every chat model a managed route can serve', () => {
    const expectedIds = listChatModels()
      .filter((model) => listManagedRoutesForModel(model.id).length > 0)
      .map((model) => model.id);
    const actualIds = AVAILABLE_MODELS.filter(
      (model) => model.providerKey !== 'managed_cloud' && model.availability !== 'coming_soon',
    ).map((model) => model.id);

    expect([...actualIds].sort()).toEqual([...expectedIds].sort());
  });

  it("holds exactly the shared owner's rows for this surface, in its order", () => {
    const surfaceIds = getModelsForTierAndSurface('max', 'web/cloud-chat', {
      modelTypes: [...CHAT_MODEL_TYPES],
    }).map((model) => model.id);
    const actualIds = AVAILABLE_MODELS.filter(
      (model) => model.providerKey !== 'managed_cloud' && model.availability !== 'coming_soon',
    ).map((model) => model.id);

    expect(surfaceIds.length).toBeGreaterThan(0);
    expect(actualIds).toEqual(surfaceIds);
  });

  /**
   * The picker offers whatever `/api/models/catalogue` admits. An id it offers
   * that this store will not hold used to resolve back to the Auto default with
   * no request, no message and no notice, so the row read as a working control
   * that did nothing.
   */
  it('holds every model the catalogue projection can offer', () => {
    const offerable = listChatModels().filter(
      (model) => listManagedRoutesForModel(model.id).length > 0,
    );

    expect(offerable.length).toBeGreaterThan(0);
    for (const model of offerable) {
      expect(isSelectableModelId(model.id)).toBe(true);
      expect(resolveSelectableModelId(model.id)).toBe(model.id);
      expect(findSelectableModel(model.id)?.id).toBe(model.id);
    }
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
