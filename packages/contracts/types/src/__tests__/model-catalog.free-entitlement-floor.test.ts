import { describe, expect, it } from 'vitest';

import {
  canAccessModelForSubscriptionTier,
  getAllowedModelsForTier,
  getModelMetadataById,
  listCanonicalModels,
} from '../model-catalog';

/**
 * Production forensic, 2026-09-12. The live catalogue admitted eight models to
 * an anonymous visitor when only three were named free: the other five had never
 * been named at any tier, and two of those are served only by a provider this
 * deployment holds no credential for.
 *
 * A model named in a tier table must clear economy membership AND
 * minTier 'free'. An unnamed model fell through to a price-derived floor whose
 * 'basic' branch returned true for free, so being absent from the tables was
 * broader than being present in them.
 *
 * The cases below derive their subjects from the registry rather than listing
 * ids. A list would be a second copy of the catalogue: it would go stale on the
 * next curation edit, and it would say nothing about a model added after it was
 * written, which is exactly the model most likely to fall down this path.
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

  const NAMED_ANYWHERE = new Set([
    ...getAllowedModelsForTier('economy'),
    ...getAllowedModelsForTier('pro_additions'),
    ...getAllowedModelsForTier('flagship_additions'),
  ]);
  const UNNAMED = listCanonicalModels()
    .map((model) => model.id)
    .filter((id) => !NAMED_ANYWHERE.has(id));

  it('guards the fixture: unnamed models exist to be tested', () => {
    expect(UNNAMED.length).toBeGreaterThan(0);
    for (const id of UNNAMED) expect(FREE_BY_NAME).not.toContain(id);
  });

  it('admits no unnamed model to free through the derived floor', () => {
    const leaked = UNNAMED.filter((id) => canAccessModelForSubscriptionTier(id, 'free'));

    expect(leaked).toEqual([]);
  });

  it('still admits the named free models', () => {
    for (const id of FREE_BY_NAME) {
      expect(canAccessModelForSubscriptionTier(id, 'free')).toBe(true);
    }
    expect(FREE_BY_NAME.length).toBeGreaterThan(0);
  });

  it('keeps paid tiers reaching unnamed cheap models', () => {
    // The floor exists so a cheap unnamed model is not stranded above Basic.
    // Removing free from it must not close it for everyone else. The subject is
    // whichever unnamed model Basic can currently reach, not a named one, so
    // this keeps testing the floor after a curation edit rather than a list.
    const reachableOnBasic = UNNAMED.filter((id) => canAccessModelForSubscriptionTier(id, 'basic'));

    expect(reachableOnBasic.length).toBeGreaterThan(0);
    for (const tier of ['basic', 'pro', 'max', 'max_15x']) {
      for (const id of reachableOnBasic) {
        expect(canAccessModelForSubscriptionTier(id, tier)).toBe(true);
      }
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
