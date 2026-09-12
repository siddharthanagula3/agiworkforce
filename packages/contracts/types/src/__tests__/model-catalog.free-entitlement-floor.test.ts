import { describe, expect, it } from 'vitest';

import {
  canAccessModelForSubscriptionTier,
  getAllowedModelsForTier,
  getModelMetadataById,
  listCanonicalModels,
} from '../model-catalog';

/**
 * Production forensic, 2026-09-12. The live catalogue admitted eight models to
 * an anonymous visitor when only three are named free:
 *
 *   gpt-5.6-luna, gemini-3.5-flash-lite, openrouter-free   (named free)
 *   sonar, glm-5.3-flash, deepseek-v4-flash-vision-exp,
 *   gpt-oss-120b, gpt-oss-20b                              (never named)
 *
 * A model named in a tier table must clear economy membership AND
 * minTier 'free'. An unnamed model fell through to a price-derived floor whose
 * 'basic' branch returned true for free, so being absent from the tables was
 * broader than being present in them.
 */
describe('free entitlement · absence never grants more than presence', () => {
  const FREE_BY_NAME = getAllowedModelsForTier('economy').filter(
    (id) => getModelMetadataById(id)?.tierPolicy?.minTier === 'free',
  );

  it('admits exactly the models named free, and no others', () => {
    const admitted = listCanonicalModels()
      .map((model) => model.id)
      .filter((id) => canAccessModelForSubscriptionTier(id, 'free'));

    expect([...admitted].sort()).toEqual([...FREE_BY_NAME].sort());
  });

  it.each([
    'sonar',
    'glm-5.3-flash',
    'deepseek-v4-flash-vision-exp',
    'gpt-oss-120b',
    'gpt-oss-20b',
  ])('does not admit %s to free through the derived floor', (modelId) => {
    // Guard the fixture: these are exactly the models that are NOT named in a
    // tier table, which is what sent them down the derived path.
    expect(FREE_BY_NAME).not.toContain(modelId);
    expect(canAccessModelForSubscriptionTier(modelId, 'free')).toBe(false);
  });

  it('still admits the named free models', () => {
    for (const id of FREE_BY_NAME) {
      expect(canAccessModelForSubscriptionTier(id, 'free')).toBe(true);
    }
    expect(FREE_BY_NAME.length).toBeGreaterThan(0);
  });

  it('keeps paid tiers reaching unnamed cheap models', () => {
    // The floor exists so a cheap unnamed model is not stranded above Basic.
    // Removing free from it must not close it for everyone else.
    for (const tier of ['basic', 'pro', 'max', 'max_15x']) {
      expect(canAccessModelForSubscriptionTier('glm-5.3-flash', tier)).toBe(true);
    }
  });

  it('never lets an unnamed model outrank a named one on free', () => {
    const named = listCanonicalModels()
      .map((model) => model.id)
      .filter((id) => getAllowedModelsForTier('economy').includes(id));

    for (const id of named) {
      const isFreeByName = getModelMetadataById(id)?.tierPolicy?.minTier === 'free';
      // A named model that is not minTier free must be denied on free. If an
      // unnamed model of the same price can pass, the tables mean nothing.
      if (!isFreeByName) expect(canAccessModelForSubscriptionTier(id, 'free')).toBe(false);
    }
  });
});
