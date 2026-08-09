/**
 * The desktop model gate used to re-derive the tier cascade locally, and its
 * Free branch was written as `accessTier === 'free' || accessTier === 'basic'`
 * — one roster for both plans. That is not the product: two Economy models
 * carry `tierPolicy.minTier: 'basic'`, so a Free desktop could select a model
 * the server (and every other surface) refuses. These pin that the desktop and
 * the shared catalog answer the same question the same way.
 */
import { describe, it, expect } from 'vitest';
import { getAllowedModelsForTier, getModelMetadataById } from '@agiworkforce/types';
import {
  getAllowedModelsForTier as getDesktopAllowedModelsForTier,
  isModelAllowedForTier,
} from '../llm';

const ECONOMY_MODELS = getAllowedModelsForTier('economy');

const PAID_ONLY_ECONOMY_MODELS = ECONOMY_MODELS.filter(
  (modelId) => getModelMetadataById(modelId)?.tierPolicy?.minTier !== 'free',
);

const FREE_ECONOMY_MODELS = ECONOMY_MODELS.filter(
  (modelId) => getModelMetadataById(modelId)?.tierPolicy?.minTier === 'free',
);

describe('isModelAllowedForTier — Free is not Basic', () => {
  it('has Economy models that Free must not reach (otherwise this suite proves nothing)', () => {
    expect(PAID_ONLY_ECONOMY_MODELS.length).toBeGreaterThan(0);
    expect(FREE_ECONOMY_MODELS.length).toBeGreaterThan(0);
  });

  it('refuses Free the Economy models sold from Basic up', () => {
    for (const modelId of PAID_ONLY_ECONOMY_MODELS) {
      expect(isModelAllowedForTier(modelId, 'free')).toBe(false);
      expect(isModelAllowedForTier(modelId, 'basic')).toBe(true);
    }
  });

  it('still grants Free the Economy models its plan includes', () => {
    for (const modelId of FREE_ECONOMY_MODELS) {
      expect(isModelAllowedForTier(modelId, 'free')).toBe(true);
    }
  });

  // The roster the picker lists and the gate that enforces it are the same
  // question. They used to be answered by two different bodies of code in this
  // one file, and after the gate started reading `tierPolicy.minTier` they gave
  // two different answers for Free: the roster offered all 5 Economy models
  // while the gate refused 2. This fails against that shape.
  it('lists exactly the models the gate admits, for every tier', () => {
    const tiers = [
      'local-only',
      'byok',
      'free',
      'basic',
      'pro',
      'max',
      'max_15x',
      'team',
      'enterprise',
    ] as const;
    for (const tier of tiers) {
      const listed = getDesktopAllowedModelsForTier(tier);
      expect(listed.filter((modelId) => !isModelAllowedForTier(modelId, tier))).toEqual([]);
      const refusedButSelectable = ECONOMY_MODELS.filter(
        (modelId) => isModelAllowedForTier(modelId, tier) && !listed.includes(modelId),
      );
      expect(refusedButSelectable).toEqual([]);
    }
  });

  it('offers Free only the Economy models the catalog sells to Free', () => {
    expect(getDesktopAllowedModelsForTier('free').sort()).toEqual([...FREE_ECONOMY_MODELS].sort());
  });
});
