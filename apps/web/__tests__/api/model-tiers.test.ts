import { describe, expect, it } from 'vitest';
import { getAllowedModelsForTier } from '@agiworkforce/types';

// model-tiers.ts uses 'server-only' — mocked globally in test/setup.ts.
import { canAccessModel } from '@/lib/model-tiers';
import { FREE_TRIAL_MODELS } from '@/lib/free-trial-config';

const ECONOMY_MODELS = getAllowedModelsForTier('economy');
const PRO_MODELS = getAllowedModelsForTier('pro_additions');
const MAX_MODELS = getAllowedModelsForTier('flagship_additions');

describe('shared subscription model gate', () => {
  it('grants Free exactly the FREE_TRIAL_MODELS roster and nothing above it', () => {
    // Free is not denied every model — it is denied every model ABOVE Economy.
    // Deriving the expectation from FREE_TRIAL_MODELS rather than restating a
    // model list is deliberate: a hand-written list here is what let apps/web
    // and services/api-gateway ship different Free rosters.
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
    // Trust boundary. These all normalize to 'free' via the default case of
    // normalizeSubscriptionAccessTier, so the gate must reject them on the raw
    // value — otherwise a Local or BYOK session silently receives a managed
    // roster, and a corrupted plan string grants managed access.
    for (const tier of ['local-only', 'byok', 'unknown-tier', '']) {
      for (const model of [...ECONOMY_MODELS, ...PRO_MODELS, ...MAX_MODELS]) {
        expect(canAccessModel(model, tier)).toBe(false);
      }
    }
  });

  it('still recognizes Free through case and whitespace normalization', () => {
    // The raw-value check above must not be so strict that a legitimately
    // cased/padded plan string locks a paying-nothing-but-entitled user out.
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

    expect(canAccessModel('gpt-5.6-luna', 'basic')).toBe(true);
    expect(canAccessModel('gpt-5.6-terra', 'basic')).toBe(false);
    // Was Haiku 4.5 (economy) until it was retired; this line exists to show
    // an economy model IS open to Basic, so it needs an economy model.
    expect(canAccessModel('gemini-3.5-flash-lite', 'basic')).toBe(true);
    expect(canAccessModel('claude-sonnet-5', 'basic')).toBe(false);
    expect(canAccessModel('deepseek-v4-flash', 'basic')).toBe(false);
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
