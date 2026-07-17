import { describe, expect, it } from 'vitest';
import { createChatModelInfo, parseDiscoveredChatModels } from '../modelInfo';

describe('createChatModelInfo', () => {
  it('derives canonical identity and capabilities from the shared model catalog', () => {
    expect(
      createChatModelInfo({
        id: 'claude-sonnet-5',
        name: 'stale host label',
        provider: 'wrong-provider',
        isLocal: false,
        isByok: true,
      }),
    ).toEqual(
      expect.objectContaining({
        id: 'claude-sonnet-5',
        name: 'Claude Sonnet 5',
        provider: 'anthropic',
        tier: 'standard',
        supportsThinking: true,
        supportsVision: true,
        supportsTools: true,
        contextWindow: 1_000_000,
        isLocal: false,
        isByok: true,
        metadataSource: 'registry',
        availability: 'live',
      }),
    );
  });

  it('preserves truthful unknown capability state for a dynamically discovered model', () => {
    expect(
      createChatModelInfo({
        id: 'private-gateway/custom-model',
        name: 'Custom Model',
        provider: 'private_gateway',
        isLocal: false,
        isByok: true,
      }),
    ).toEqual({
      id: 'private-gateway/custom-model',
      name: 'Custom Model',
      provider: 'private_gateway',
      tier: 'standard',
      supportsThinking: false,
      supportsVision: false,
      supportsTools: false,
      contextWindow: 0,
      isLocal: false,
      isByok: true,
      metadataSource: 'unknown',
      availability: 'live',
    });
  });

  it('carries current live registry availability into the selector DTO', () => {
    expect(
      createChatModelInfo({
        id: 'gpt-5.6-sol',
        name: 'GPT-5.6 Sol',
        provider: 'openai',
        isLocal: false,
        isByok: false,
      }),
    ).toEqual(
      expect.objectContaining({
        availability: 'live',
        metadataSource: 'registry',
      }),
    );
  });
});

describe('parseDiscoveredChatModels', () => {
  it('accepts only runtime-valid model discovery records', () => {
    expect(
      parseDiscoveredChatModels([
        { id: 'valid', name: 'Valid', provider: 'openai', available: true },
        { id: 'catalog-only', name: 'Catalog only', provider: 'anthropic' },
        { id: '', name: 'Missing id', provider: 'openai' },
        { id: 'missing-provider', name: 'Missing provider', provider: '' },
        { id: 'bad-availability', name: 'Bad availability', provider: 'openai', available: 'yes' },
        null,
      ]),
    ).toEqual([
      { id: 'valid', name: 'Valid', provider: 'openai', available: true },
      { id: 'catalog-only', name: 'Catalog only', provider: 'anthropic' },
    ]);
    expect(parseDiscoveredChatModels({ models: [] })).toEqual([]);
  });
});
