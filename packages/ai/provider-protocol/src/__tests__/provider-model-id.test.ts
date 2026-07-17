import { describe, expect, it } from 'vitest';

import { listCanonicalModels } from '@agiworkforce/types';
import { toProviderApiModelId } from '../provider-model-id';

describe('toProviderApiModelId', () => {
  it('maps a canonical product model ID to the provider wire ID', () => {
    expect(toProviderApiModelId('claude-opus-4.8')).toBe('claude-opus-4-8');
  });

  it('keeps an already-mapped provider wire ID stable', () => {
    expect(toProviderApiModelId('claude-opus-4-8')).toBe('claude-opus-4-8');
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
