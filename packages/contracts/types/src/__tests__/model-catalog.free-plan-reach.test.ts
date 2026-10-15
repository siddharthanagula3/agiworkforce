import { modelRegistry } from '@agiworkforce/model-registry';
import { describe, expect, it } from 'vitest';

import modelsCatalog from '../models.json' with { type: 'json' };
import {
  canAccessModelForSubscriptionTier,
  getAllowedModelsForTier,
  getDefaultModelFor,
  getRoutingSlotModel,
  listCanonicalModels,
  normalizeModelId,
  type RoutingSlot,
} from '../model-catalog';

/**
 * The free plan is priced at zero to the customer and paid for by the company
 * out of the Free usage windows, so what it may reach is decided in one place:
 * the Free routing slots. A model that is merely marked free in the tier tables
 * without a slot serving it would be selectable and never routed, and a slot
 * serving a model the tables refuse would route to a 403.
 */
const FREE_TIER = 'free';

const freeReachableModelIds = listCanonicalModels()
  .map((model) => model.id)
  .filter((id) => canAccessModelForSubscriptionTier(id, FREE_TIER));

const freeSlotModelIds = [
  ...new Set(
    modelRegistry.policies.auto.tierAllowedSlots.free.map((slot) =>
      getRoutingSlotModel(slot as RoutingSlot),
    ),
  ),
];

describe('every model a free account can reach', () => {
  it('is a non-empty set, or the free plan serves nothing', () => {
    expect(freeReachableModelIds.length).toBeGreaterThan(0);
  });

  it('is exactly what the free routing slots serve', () => {
    expect([...freeReachableModelIds].sort()).toEqual([...freeSlotModelIds].sort());
  });

  it('includes the model a free chat opens on', () => {
    expect(freeReachableModelIds).toContain(getDefaultModelFor(FREE_TIER, 'chat'));
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
