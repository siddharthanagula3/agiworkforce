import { describe, expect, it } from 'vitest';

import modelsCatalog from '../models.json' with { type: 'json' };
import {
  canAccessModelForSubscriptionTier,
  getAllowedModelsForTier,
  getModelMetadataById,
  listCanonicalModels,
  normalizeModelId,
} from '../model-catalog';

/**
 * The free plan is priced at zero to the customer, so it has to be priced at
 * zero to the company: the only models it may reach are the ones a provider
 * gives away. Price is the source of truth here rather than a hand-kept list,
 * which is what makes this survive an upstream re-sync. A model that stops
 * being free upstream stops being free-eligible the moment the catalog records
 * its new price, and this fails until the tier tables agree.
 */
const FREE_TIER = 'free';

const freeReachableModelIds = listCanonicalModels()
  .map((model) => model.id)
  .filter((id) => canAccessModelForSubscriptionTier(id, FREE_TIER));

describe('every model a free account can reach', () => {
  it('is a non-empty set, or the free plan serves nothing', () => {
    expect(freeReachableModelIds.length).toBeGreaterThan(0);
  });

  it.each(freeReachableModelIds)('%s costs nothing to serve', (modelId) => {
    const metadata = getModelMetadataById(modelId);
    expect(metadata?.inputCost, `${modelId} bills for input`).toBe(0);
    expect(metadata?.outputCost, `${modelId} bills for output`).toBe(0);
  });

  it('is exactly the economy models the free plan is entitled to', () => {
    expect([...freeReachableModelIds].sort()).toEqual(
      getAllowedModelsForTier('economy')
        .filter((id) => canAccessModelForSubscriptionTier(id, FREE_TIER))
        .sort(),
    );
  });
});

/**
 * A retired id keeps working by pointing at a live model. Pointing a retired
 * FREE id at a priced one turns "this model went away" into "upgrade to reach
 * a model you did not ask for", and on the free plan the redirect is then
 * refused outright, so the account is told to pay for something it never
 * requested.
 */
describe('a retired free model id', () => {
  const freeAliasTargets = Object.values(
    modelsCatalog.providers as Record<string, { canonicalization?: Record<string, string> }>,
  ).flatMap((provider) =>
    Object.entries(provider.canonicalization ?? {}).filter(([alias]) => alias.endsWith(':free')),
  );

  it('has at least one such alias, or this proves nothing', () => {
    expect(freeAliasTargets.length).toBeGreaterThan(0);
  });

  it.each(freeAliasTargets)('%s redirects to a model the free plan can reach', (alias, target) => {
    const canonical = normalizeModelId(target);
    expect(canonical, `${alias} has no canonical target`).not.toBeNull();
    expect(
      canAccessModelForSubscriptionTier(canonical as string, FREE_TIER),
      `${alias} redirects to ${canonical}, which the free plan may not reach`,
    ).toBe(true);
  });
});
