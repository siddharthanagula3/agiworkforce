import { describe, expect, it } from 'vitest';

import {
  canAccessModelForSubscriptionTier,
  getMinimumRequiredTier,
  listCanonicalModels,
} from '../model-catalog';

/**
 * The published floor and the enforced gate are two answers to one question, so
 * they have to agree. `getMinimumRequiredTier` is what the picker's lock label,
 * the 403 body and `/api/llm/v1/models` all report; `canAccessModelForSubscriptionTier`
 * is what actually admits or refuses the turn.
 *
 * They did not agree. Every economy model reported `'basic'`, while the gate
 * admits an economy model to Free when it is named `minTier: 'free'`. So each of
 * the three models a free account can actually run told that user "Basic and
 * above" about a model they could run right then.
 *
 * These assert the relationship rather than a list of model ids, so the guard
 * survives catalogue edits instead of being a second copy of the catalogue.
 */
const PLANS = ['free', 'basic', 'pro', 'max', 'max_15x', 'team', 'enterprise'] as const;

const FLOOR_RANK: Readonly<Record<string, number>> = {
  free: 0,
  basic: 1,
  pro: 2,
  max: 3,
  max_15x: 3,
  team: 2,
  enterprise: 4,
};

function lowestAdmittingPlan(modelId: string): (typeof PLANS)[number] | null {
  const admitting = PLANS.filter((plan) => canAccessModelForSubscriptionTier(modelId, plan));
  if (admitting.length === 0) return null;
  return admitting.reduce((lowest, plan) =>
    FLOOR_RANK[plan]! < FLOOR_RANK[lowest]! ? plan : lowest,
  );
}

describe('the published floor is the floor that is enforced', () => {
  const MODELS = listCanonicalModels().map((model) => model.id);

  it('guards the fixture: there are models to check', () => {
    expect(MODELS.length).toBeGreaterThan(10);
  });

  it('never reports a floor above the lowest plan that is actually admitted', () => {
    const lying = MODELS.filter((id) => {
      const floor = getMinimumRequiredTier(id);
      const lowest = lowestAdmittingPlan(id);
      if (!floor || !lowest) return false;
      return FLOOR_RANK[floor]! > FLOOR_RANK[lowest]!;
    });

    expect(lying).toEqual([]);
  });

  it('never reports a floor below what is admitted, which would promise an upgrade nothing delivers', () => {
    const generous = MODELS.filter((id) => {
      const floor = getMinimumRequiredTier(id);
      const lowest = lowestAdmittingPlan(id);
      if (!floor || !lowest) return false;
      return FLOOR_RANK[floor]! < FLOOR_RANK[lowest]!;
    });

    expect(generous).toEqual([]);
  });

  it('reports free for every model a free account can run', () => {
    const freeUsable = MODELS.filter((id) => canAccessModelForSubscriptionTier(id, 'free'));

    expect(freeUsable.length).toBeGreaterThan(0);
    for (const id of freeUsable) expect(getMinimumRequiredTier(id)).toBe('free');
  });

  it('reports free for nothing a free account cannot run', () => {
    for (const id of MODELS) {
      if (getMinimumRequiredTier(id) === 'free') {
        expect(canAccessModelForSubscriptionTier(id, 'free')).toBe(true);
      }
    }
  });

  it('keeps reporting a real floor for a model no plan can run, so it is not mistaken for free', () => {
    const unreachable = MODELS.filter((id) => lowestAdmittingPlan(id) === null);

    for (const id of unreachable) expect(getMinimumRequiredTier(id)).not.toBe('free');
  });
});
