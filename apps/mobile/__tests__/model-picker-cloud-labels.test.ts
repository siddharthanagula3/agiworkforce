import {
  AUTO_MODES,
  DEFAULT_CLOUD_MODEL_ID,
  canAccessCloudModelForTier,
  getDefaultCloudModelIdForTier,
  getShortDisplayName,
  getModelListForCloudAccess,
  isSelectableModelIdForCloudAccess,
  LOCKED_CLOUD_MODELS,
} from '../src/features/model-picker/service';
import {
  getDefaultModelFor,
  getModelMetadataById,
  getPickerModelsForRuntimeProfile,
  getAutoRoutingProfiles,
  getModelsForTierAndSurface,
  getAllowedModelsForTier,
  canAccessModelForSubscriptionTier,
} from '@agiworkforce/types';

describe('mobile cloud model labels', () => {
  it('uses the shared surface entitlement for Free models', () => {
    const allowed = new Set(
      getModelsForTierAndSurface('free', 'mobile/cloud-chat', {
        modelTypes: ['chat', 'reasoning', 'multimodal', 'search', 'code'],
      }).map((model) => model.id),
    );
    const mobileModels = getModelListForCloudAccess(true, 'free').filter(
      (model) => model.surface === 'cloud_managed' && model.availability === 'ready',
    );
    expect(new Set(mobileModels.map((model) => model.id))).toEqual(allowed);
    const economyOnly = getAllowedModelsForTier('economy').find(
      (id) => !canAccessModelForSubscriptionTier(id, 'free'),
    );
    expect(economyOnly).toBeDefined();
    expect(canAccessCloudModelForTier(economyOnly!, 'free')).toBe(false);
  });

  it('derives Auto presentation from the shared routing policy', () => {
    expect(AUTO_MODES).toEqual(
      getAutoRoutingProfiles().map((profile) => ({
        id: profile.id,
        name: profile.label,
        description: profile.description,
        icon:
          profile.profile === 'economy' ? 'Zap' : profile.profile === 'premium' ? 'Crown' : 'Scale',
        tier: profile.profile,
      })),
    );
  });

  it('shows canonical model identity instead of Mobile-owned capability aliases', () => {
    const unlockedModels = getModelListForCloudAccess(true).filter(
      (model) => model.surface === 'cloud_managed',
    );
    expect(unlockedModels.length).toBeGreaterThan(0);
    for (const model of unlockedModels) {
      const canonical = getModelMetadataById(model.id);
      expect(canonical).toBeDefined();
      expect(model.name).toBe(canonical!.name);
      expect(getShortDisplayName(model.id)).toBe(canonical!.name);
    }
  });

  it('derives the provider roster from the Mobile Cloud runtime profile', () => {
    const expectedProviderIds = Array.from(
      new Set(getPickerModelsForRuntimeProfile('mobile/cloud-chat').map((model) => model.provider)),
    );
    const actualProviderIds = Array.from(
      new Set(
        getModelListForCloudAccess(true)
          .filter((model) => model.surface === 'cloud_managed')
          .map((model) => model.provider),
      ),
    );

    expect(actualProviderIds).toEqual(expectedProviderIds);
    expect(new Set(LOCKED_CLOUD_MODELS.map((model) => model.provider))).toEqual(
      new Set(expectedProviderIds),
    );
  });

  it('derives the default from the shared tier policy', () => {
    expect(DEFAULT_CLOUD_MODEL_ID).toBe(getDefaultModelFor(undefined, 'chat'));
    expect(isSelectableModelIdForCloudAccess(DEFAULT_CLOUD_MODEL_ID!, false)).toBe(false);
    expect(isSelectableModelIdForCloudAccess(DEFAULT_CLOUD_MODEL_ID!, true)).toBe(true);
  });

  it('keeps every tier default visible and selectable in that tier picker', () => {
    for (const tier of [undefined, 'free', 'basic', 'pro', 'max', 'team', 'enterprise'] as const) {
      const defaultId = getDefaultCloudModelIdForTier(tier);
      expect(defaultId).toBe(getDefaultModelFor(tier, 'chat'));
      const browsable = getModelListForCloudAccess(true, tier).filter(
        (model) => model.surface === 'cloud_managed',
      );
      expect(
        browsable.some((model) => model.id === defaultId && model.availability === 'ready'),
      ).toBe(true);
    }
  });

  it('keeps the same canonical display name at every subscription tier', () => {
    const modelId = DEFAULT_CLOUD_MODEL_ID!;
    const canonicalName = getModelMetadataById(modelId)!.name;
    for (const tier of [undefined, 'free', 'basic', 'pro', 'max', 'team', 'enterprise'] as const) {
      expect(getShortDisplayName(modelId, tier)).toBe(canonicalName);
    }
  });
});
