import { describe, expect, it } from 'vitest';
import { getAllowedModelsForTier } from '@agiworkforce/types';

import { canAccessModel } from '@/lib/model-tiers';
import { FREE_TRIAL_MODELS } from '@/lib/free-trial-config';

const ECONOMY_MODELS = getAllowedModelsForTier('economy');
const PRO_MODELS = getAllowedModelsForTier('pro_additions');
const MAX_MODELS = getAllowedModelsForTier('flagship_additions');

describe('shared subscription model gate', () => {
  it('grants Free exactly the FREE_TRIAL_MODELS roster and nothing above it', () => {
    expect(FREE_TRIAL_MODELS.length).toBeGreaterThan(0);

    const freeRoster = new Set(FREE_TRIAL_MODELS);
    for (const model of FREE_TRIAL_MODELS) {
      expect(canAccessModel(model, 'free')).toBe(true);
    }
    for (const model of [...ECONOMY_MODELS, ...PRO_MODELS, ...MAX_MODELS]) {
      if (freeRoster.has(model)) continue;
      expect(canAccessModel(model, 'free')).toBe(false);
    }
  });

  it('fails closed for local-only, BYOK, and unrecognized tiers', () => {
    for (const tier of ['local-only', 'byok', 'unknown-tier', '']) {
      for (const model of [...ECONOMY_MODELS, ...PRO_MODELS, ...MAX_MODELS]) {
        expect(canAccessModel(model, tier)).toBe(false);
      }
    }
  });

  it('still recognizes Free through case and whitespace normalization', () => {
    for (const tier of ['FREE', ' free ', 'Free']) {
      expect(canAccessModel(FREE_TRIAL_MODELS[0]!, tier)).toBe(true);
    }
  });

  it('keeps Basic on the economy roster only', () => {
    for (const model of ECONOMY_MODELS) {
      expect(canAccessModel(model, 'basic')).toBe(true);
      expect(canAccessModel(model, 'hobby')).toBe(true);
    }
    for (const model of [...PRO_MODELS, ...MAX_MODELS]) {
      expect(canAccessModel(model, 'basic')).toBe(false);
    }
  });

  it('gives Pro the inherited economy and Pro rosters, but not Max', () => {
    for (const model of [...ECONOMY_MODELS, ...PRO_MODELS]) {
      expect(canAccessModel(model, 'pro')).toBe(true);
    }
    for (const model of MAX_MODELS) {
      expect(canAccessModel(model, 'pro')).toBe(false);
    }
  });

  it('gives Max, Max+, and Enterprise the same full model roster', () => {
    for (const model of [...ECONOMY_MODELS, ...PRO_MODELS, ...MAX_MODELS]) {
      expect(canAccessModel(model, 'max')).toBe(true);
      expect(canAccessModel(model, 'max_plus')).toBe(true);
      expect(canAccessModel(model, 'enterprise')).toBe(true);
    }
  });

  it('accepts Auto routing only for paid tiers', () => {
    expect(canAccessModel('auto-economy', 'basic')).toBe(true);
    expect(canAccessModel('auto-balanced', 'pro')).toBe(true);
    expect(canAccessModel('auto-premium', 'max')).toBe(true);
    expect(canAccessModel('auto-economy', 'free')).toBe(false);
  });

  it('normalizes case and denies unknown model IDs', () => {
    const economyModel = ECONOMY_MODELS[0]!;
    expect(canAccessModel(economyModel.toUpperCase(), 'BASIC')).toBe(true);
    expect(canAccessModel('nonexistent-model-xyz', 'max')).toBe(false);
  });
});

/**
 * The plan strings above are not all of them. `team` and `max_15x` are real
 * plans a customer can buy and are what the billing tables actually store, and
 * neither had ever been asserted here: the suite covered `max_plus` but not
 * `max_15x`, and never named `team` at all.
 *
 * That matters because the gate reaches them by folding, `team` onto Pro and
 * `max_15x` onto Max, and a fold is exactly the kind of thing that is correct
 * until someone edits the normalizer. These assert the plans as the strings
 * they are stored as, so a change to the fold has to be deliberate.
 */
describe('every plan a customer can actually buy', () => {
  const PAID_ROSTER: Readonly<Record<string, readonly string[]>> = {
    basic: ECONOMY_MODELS,
    pro: [...ECONOMY_MODELS, ...PRO_MODELS],
    team: [...ECONOMY_MODELS, ...PRO_MODELS],
    max: [...ECONOMY_MODELS, ...PRO_MODELS, ...MAX_MODELS],
    max_15x: [...ECONOMY_MODELS, ...PRO_MODELS, ...MAX_MODELS],
    enterprise: [...ECONOMY_MODELS, ...PRO_MODELS, ...MAX_MODELS],
  };
  const EVERY_MODEL = [...ECONOMY_MODELS, ...PRO_MODELS, ...MAX_MODELS];

  it.each(Object.keys(PAID_ROSTER))('gives %s exactly its roster', (plan) => {
    const allowed = new Set(PAID_ROSTER[plan]!);
    for (const model of EVERY_MODEL) {
      expect({ plan, model, allowed: canAccessModel(model, plan) }).toEqual({
        plan,
        model,
        allowed: allowed.has(model),
      });
    }
  });

  it('gives Team what Pro has, and no flagship model', () => {
    expect(PRO_MODELS.length).toBeGreaterThan(0);
    expect(MAX_MODELS.length).toBeGreaterThan(0);
    for (const model of PRO_MODELS) expect(canAccessModel(model, 'team')).toBe(true);
    for (const model of MAX_MODELS) expect(canAccessModel(model, 'team')).toBe(false);
  });

  it('gives Max 15x everything Max has, under the name billing stores', () => {
    for (const model of EVERY_MODEL) {
      expect(canAccessModel(model, 'max_15x')).toBe(canAccessModel(model, 'max'));
    }
  });

  it('never grants a paid plan a model Free cannot reach without naming it', () => {
    // Absence from the tables must not be broader than presence in them, the
    // inversion that once made unnamed models selectable on Free.
    for (const model of FREE_TRIAL_MODELS) {
      expect(canAccessModel(model, 'basic')).toBe(true);
    }
  });
});
