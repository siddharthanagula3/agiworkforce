import { describe, expect, it } from 'vitest';

import {
  getModelMetadataById,
  listCanonicalModels,
  requireProviderDefaultModel,
} from '@agiworkforce/types';
import { toProviderApiModelId } from '../provider-model-id';

describe('toProviderApiModelId', () => {
  it('keeps a canonical product and provider ID aligned', () => {
    const modelId = requireProviderDefaultModel('anthropic');
    const providerModelId = getModelMetadataById(modelId)?.apiModelId ?? modelId;
    expect(toProviderApiModelId(modelId)).toBe(providerModelId);
  });

  it('derives every provider wire ID from the canonical model registry', () => {
    for (const model of listCanonicalModels()) {
      const providerModelId = model.apiModelId ?? model.id;
      expect(toProviderApiModelId(model.id), model.id).toBe(providerModelId);
      expect(toProviderApiModelId(providerModelId), providerModelId).toBe(providerModelId);
    }
  });

  it('passes an unknown model through without inventing an ID', () => {
    expect(toProviderApiModelId('fixture-vendor-future-model')).toBe('fixture-vendor-future-model');
  });
});
