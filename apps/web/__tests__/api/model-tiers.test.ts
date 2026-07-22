import { describe, expect, it } from 'vitest';
import { getAllowedModelsForTier } from '@agiworkforce/types';

// model-tiers.ts uses 'server-only' — mocked globally in test/setup.ts.
import { canAccessModel } from '@/lib/model-tiers';

const ECONOMY_MODELS = getAllowedModelsForTier('economy');
const PRO_MODELS = getAllowedModelsForTier('pro_additions');
const MAX_MODELS = getAllowedModelsForTier('flagship_additions');

describe('shared subscription model gate', () => {
  it('denies direct model selection for free and unknown tiers', () => {
    for (const model of [...ECONOMY_MODELS, ...PRO_MODELS, ...MAX_MODELS]) {
      expect(canAccessModel(model, 'free')).toBe(false);
      expect(canAccessModel(model, 'unknown-tier')).toBe(false);
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
    expect(canAccessModel('claude-haiku-4.5', 'basic')).toBe(true);
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
