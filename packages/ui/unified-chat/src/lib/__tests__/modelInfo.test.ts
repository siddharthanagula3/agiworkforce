import { describe, expect, it } from 'vitest';
import {
  createChatModelInfo,
  getManagedModelPresentationLabel,
  getModelPresentationLabel,
  parseDiscoveredChatModels,
} from '../modelInfo';
import { requireCatalogModel } from '../../test/modelCatalogFixtures';

const canonicalChatModel = requireCatalogModel(
  (model) =>
    model.contextWindow !== undefined &&
    model.capabilities.thinking &&
    model.capabilities.vision &&
    model.capabilities.tools &&
    model.availability !== 'coming_soon' &&
    model.availability !== 'unavailable',
  'a live chat model with thinking, vision, and tool capabilities',
);

const expectedPresentationTier =
  canonicalChatModel.qualityTier === 'best'
    ? 'flagship'
    : canonicalChatModel.qualityTier === 'fast'
      ? 'fast'
      : 'standard';

describe('createChatModelInfo', () => {
  it('derives canonical identity and capabilities from the shared model catalog', () => {
    expect(
      createChatModelInfo({
        id: canonicalChatModel.id,
        name: 'stale host label',
        provider: 'fixture-wrong-provider',
        isLocal: false,
        isByok: true,
      }),
    ).toEqual(
      expect.objectContaining({
        id: canonicalChatModel.id,
        name: canonicalChatModel.name,
        provider: canonicalChatModel.provider,
        tier: expectedPresentationTier,
        supportsThinking: canonicalChatModel.capabilities.thinking,
        supportsVision: canonicalChatModel.capabilities.vision,
        supportsTools: canonicalChatModel.capabilities.tools,
        contextWindow: canonicalChatModel.contextWindow,
        isLocal: false,
        isByok: true,
        metadataSource: 'registry',
        availability: canonicalChatModel.availability ?? 'live',
      }),
    );
  });

  it('preserves truthful unknown capability state for a dynamically discovered model', () => {
    expect(
      createChatModelInfo({
        id: 'fixture-private-gateway-model',
        name: 'Custom Model Fixture',
        provider: 'fixture_private_gateway',
        isLocal: false,
        isByok: true,
      }),
    ).toEqual({
      id: 'fixture-private-gateway-model',
      name: 'Custom Model Fixture',
      provider: 'fixture_private_gateway',
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
        id: canonicalChatModel.id,
        name: 'stale host label',
        provider: 'fixture-wrong-provider',
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

describe('getModelPresentationLabel', () => {
  it('uses the canonical display name for a catalog model', () => {
    expect(getModelPresentationLabel(canonicalChatModel.id)).toBe(canonicalChatModel.name);
  });

  it('preserves an unknown Local/BYOK identifier honestly', () => {
    expect(getModelPresentationLabel('fixture-private-gateway-model')).toBe(
      'fixture-private-gateway-model',
    );
  });
});

describe('getManagedModelPresentationLabel', () => {
  it('uses the canonical display name for a managed catalog model', () => {
    expect(getManagedModelPresentationLabel(canonicalChatModel.id)).toBe(canonicalChatModel.name);
  });

  it('does not expose an unknown historical managed transport identifier', () => {
    expect(getManagedModelPresentationLabel('fixture-retired-managed-model')).toBe(
      'Unavailable model',
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
