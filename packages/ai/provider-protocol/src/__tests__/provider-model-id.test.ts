import { describe, expect, it } from 'vitest';

import { listCanonicalModels } from '@agiworkforce/types';
import { toProviderApiModelId } from '../provider-model-id';

describe('toProviderApiModelId', () => {
  it('keeps the Opus 5 canonical product and provider ID stable', () => {
    expect(toProviderApiModelId('claude-opus-5')).toBe('claude-opus-5');
  });

  it('derives every provider wire ID from the canonical model registry', () => {
    for (const model of listCanonicalModels()) {
      const providerModelId = model.apiModelId ?? model.id;
      expect(toProviderApiModelId(model.id), model.id).toBe(providerModelId);
      expect(toProviderApiModelId(providerModelId), providerModelId).toBe(providerModelId);
    }
  });

  it('passes an unknown model through without inventing an ID', () => {
    expect(toProviderApiModelId('vendor-future-model')).toBe('vendor-future-model');
  });
});
