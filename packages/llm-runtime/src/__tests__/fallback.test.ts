import { describe, expect, it } from 'vitest';

import {
  getAllowedModelsForTier,
  getModelMetadataById,
  getModelsForProvider,
} from '@agiworkforce/types';

import { buildFallbackChain } from '../fallback';

describe('buildFallbackChain', () => {
  // The catalog lives in @agiworkforce/types/models.json — these tests
  // validate behaviour against the live catalog without hardcoding model
  // IDs (per locked rule).

  it('returns [] when current model is unknown', () => {
    expect(buildFallbackChain('not-a-real-model', 'same-provider-cheaper')).toEqual([]);
  });

  it('same-provider-cheaper excludes the current model itself', () => {
    const anthropicModels = getModelsForProvider('anthropic');
    if (anthropicModels.length === 0) return;
    const first = anthropicModels[0]!;
    const chain = buildFallbackChain(first.id, 'same-provider-cheaper', { maxDepth: 5 });
    expect(chain).not.toContain(first.id);
  });

  it('cross-provider fallback returns models from OTHER providers', () => {
    const anthropicModels = getModelsForProvider('anthropic');
    if (anthropicModels.length === 0) return;
    const first = anthropicModels[0]!;
    const chain = buildFallbackChain(first.id, 'cross-provider', { maxDepth: 3 });
    for (const id of chain) {
      const meta = getModelMetadataById(id);
      expect(meta?.provider).not.toBe('anthropic');
    }
  });

  it('economy-tier returns only economy-tier ids', () => {
    const anthropicModels = getModelsForProvider('anthropic');
    if (anthropicModels.length === 0) return;
    const first = anthropicModels[0]!;
    const chain = buildFallbackChain(first.id, 'economy-tier');
    const economy = new Set(getAllowedModelsForTier('economy'));
    for (const id of chain) {
      expect(economy.has(id)).toBe(true);
    }
  });

  it('respects exclude list', () => {
    const anthropicModels = getModelsForProvider('anthropic');
    if (anthropicModels.length < 2) return;
    const [first, second] = anthropicModels;
    const exclude = new Set([second!.id]);
    const chain = buildFallbackChain(first!.id, 'same-provider-cheaper', { exclude });
    expect(chain).not.toContain(second!.id);
  });

  it('respects maxDepth', () => {
    const anthropicModels = getModelsForProvider('anthropic');
    if (anthropicModels.length === 0) return;
    const chain = buildFallbackChain(anthropicModels[0]!.id, 'same-provider-cheaper', {
      maxDepth: 1,
    });
    expect(chain.length).toBeLessThanOrEqual(1);
  });
});
