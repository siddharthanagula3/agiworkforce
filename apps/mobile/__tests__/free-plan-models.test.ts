jest.mock('@/src/features/billing/nativePurchaseAvailability', () => ({
  NATIVE_PURCHASES_AVAILABLE: false,
}));
import {
  getModelMetadataById,
  getRoutingSlotModel,
  resolveModelFamilySlot,
} from '@agiworkforce/types';
import {
  canAccessCloudModelForTier,
  getDefaultCloudModelIdForTier,
  getModelListForCloudAccess,
} from '../src/features/model-picker/service';

const FAST_OPENAI = resolveModelFamilySlot('openai/gpt-fast');
const FAST_ANTHROPIC = getRoutingSlotModel('fast_anthropic');

function cloudModels(tier: string) {
  return getModelListForCloudAccess(true, tier).filter(
    (model) => model.surface === 'cloud_managed',
  );
}

describe('the AGI Cloud models a Free account can pick on the phone', () => {
  it('lists the fast OpenAI and fast Anthropic models, both ready to pick', () => {
    const listed = cloudModels('free');

    expect(listed.map((model) => model.id).sort()).toEqual([FAST_OPENAI, FAST_ANTHROPIC].sort());
    for (const model of listed) {
      expect(model.availability).toBe('ready');
      expect(model.lockReason).toBeUndefined();
      expect(canAccessCloudModelForTier(model.id, 'free')).toBe(true);
    }
  });

  it('names each model by its display name', () => {
    for (const model of cloudModels('free')) {
      expect(model.name).toBe(getModelMetadataById(model.id)?.name);
    }
  });

  it('keeps the fast OpenAI model as the Free default', () => {
    expect(getDefaultCloudModelIdForTier('free')).toBe(FAST_OPENAI);
  });

  it('still keeps both models on a paid plan', () => {
    for (const tier of ['basic', 'pro', 'max']) {
      const ids = cloudModels(tier).map((model) => model.id);
      expect(ids).toEqual(expect.arrayContaining([FAST_OPENAI, FAST_ANTHROPIC]));
    }
  });
});
