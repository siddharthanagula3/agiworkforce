/**
 * Tests for lib/model-tiers.ts
 *
 * Verifies that model tier enforcement is consistent and correct:
 * - economy tier users (hobby) can only access economy models
 * - pro tier can access pro + economy models
 * - max/enterprise can access all models
 * - free tier is denied access to everything
 * - unknown models are denied by default
 */

import { describe, it, expect } from 'vitest';

// model-tiers.ts uses 'server-only' — already mocked globally in test/setup.ts
import { canAccessModel, ECONOMY_MODELS, MODEL_TIER_REQUIREMENTS } from '@/lib/model-tiers';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: get a sample of models from each tier category
// ─────────────────────────────────────────────────────────────────────────────
const ECONOMY_SAMPLE = [...ECONOMY_MODELS].slice(0, 5);
const PRO_MODELS = Object.entries(MODEL_TIER_REQUIREMENTS)
  .filter(([, tiers]) => tiers.includes('pro'))
  .map(([model]) => model)
  .slice(0, 5);
const MAX_ONLY_MODELS = Object.entries(MODEL_TIER_REQUIREMENTS)
  .filter(([, tiers]) => !tiers.includes('pro'))
  .map(([model]) => model)
  .slice(0, 3);

// ─────────────────────────────────────────────────────────────────────────────
describe('canAccessModel — free tier', () => {
  it('denies all economy models for free users', () => {
    for (const model of ECONOMY_SAMPLE) {
      expect(canAccessModel(model, 'free')).toBe(false);
    }
  });

  it('denies pro-tier models for free users', () => {
    for (const model of PRO_MODELS) {
      expect(canAccessModel(model, 'free')).toBe(false);
    }
  });

  it('denies max-only models for free users', () => {
    for (const model of MAX_ONLY_MODELS) {
      expect(canAccessModel(model, 'free')).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('canAccessModel — hobby tier (economy only)', () => {
  it('allows economy models for hobby users', () => {
    for (const model of ECONOMY_SAMPLE) {
      expect(canAccessModel(model, 'hobby')).toBe(true);
    }
  });

  it('denies pro-tier models for hobby users', () => {
    for (const model of PRO_MODELS) {
      expect(canAccessModel(model, 'hobby')).toBe(false);
    }
  });

  it('denies max-only models for hobby users', () => {
    for (const model of MAX_ONLY_MODELS) {
      expect(canAccessModel(model, 'hobby')).toBe(false);
    }
  });

  it('denies claude-opus-4.5 (max/enterprise model) for hobby users', () => {
    expect(canAccessModel('claude-opus-4.5', 'hobby')).toBe(false);
  });

  it('denies o3 (max/enterprise model) for hobby users', () => {
    expect(canAccessModel('o3', 'hobby')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('canAccessModel — pro tier', () => {
  it('allows economy models for pro users', () => {
    for (const model of ECONOMY_SAMPLE) {
      expect(canAccessModel(model, 'pro')).toBe(true);
    }
  });

  it('allows pro-tier models for pro users', () => {
    for (const model of PRO_MODELS) {
      expect(canAccessModel(model, 'pro')).toBe(true);
    }
  });

  it('denies max-only models for pro users', () => {
    for (const model of MAX_ONLY_MODELS) {
      expect(canAccessModel(model, 'pro')).toBe(false);
    }
  });

  it('allows claude-sonnet-4.6 for pro users', () => {
    expect(canAccessModel('claude-sonnet-4.6', 'pro')).toBe(true);
  });

  it('denies claude-opus-4.6 (max/enterprise only) for pro users', () => {
    expect(canAccessModel('claude-opus-4.6', 'pro')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('canAccessModel — max tier', () => {
  it('allows all economy models for max users', () => {
    for (const model of ECONOMY_SAMPLE) {
      expect(canAccessModel(model, 'max')).toBe(true);
    }
  });

  it('allows all pro-tier models for max users', () => {
    for (const model of PRO_MODELS) {
      expect(canAccessModel(model, 'max')).toBe(true);
    }
  });

  it('allows max-only models for max users', () => {
    for (const model of MAX_ONLY_MODELS) {
      expect(canAccessModel(model, 'max')).toBe(true);
    }
  });

  it('allows claude-opus-4.6 for max users', () => {
    expect(canAccessModel('claude-opus-4.6', 'max')).toBe(true);
  });

  it('allows o3 for max users', () => {
    expect(canAccessModel('o3', 'max')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('canAccessModel — enterprise tier', () => {
  it('allows all economy models for enterprise users', () => {
    for (const model of ECONOMY_SAMPLE) {
      expect(canAccessModel(model, 'enterprise')).toBe(true);
    }
  });

  it('allows pro-tier models for enterprise users', () => {
    for (const model of PRO_MODELS) {
      expect(canAccessModel(model, 'enterprise')).toBe(true);
    }
  });

  it('allows max-only models for enterprise users', () => {
    for (const model of MAX_ONLY_MODELS) {
      expect(canAccessModel(model, 'enterprise')).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('canAccessModel — auto-model placeholders', () => {
  it('allows auto-economy for any paid tier', () => {
    expect(canAccessModel('auto-economy', 'hobby')).toBe(true);
    expect(canAccessModel('auto-economy', 'pro')).toBe(true);
    expect(canAccessModel('auto-economy', 'max')).toBe(true);
  });

  it('allows auto-balanced for any paid tier', () => {
    expect(canAccessModel('auto-balanced', 'hobby')).toBe(true);
    expect(canAccessModel('auto-balanced', 'pro')).toBe(true);
  });

  it('allows auto-premium for any paid tier', () => {
    expect(canAccessModel('auto-premium', 'enterprise')).toBe(true);
  });

  it('denies auto-models for free tier', () => {
    expect(canAccessModel('auto-economy', 'free')).toBe(false);
    expect(canAccessModel('auto-balanced', 'free')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('canAccessModel — unknown models', () => {
  it('denies completely unknown models regardless of tier', () => {
    expect(canAccessModel('nonexistent-model-xyz', 'pro')).toBe(false);
    expect(canAccessModel('nonexistent-model-xyz', 'max')).toBe(false);
    expect(canAccessModel('nonexistent-model-xyz', 'enterprise')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('canAccessModel — case insensitivity', () => {
  it('handles uppercase model names correctly', () => {
    expect(canAccessModel('GPT-5-NANO', 'hobby')).toBe(true);
    expect(canAccessModel('CLAUDE-SONNET-4.6', 'pro')).toBe(true);
  });

  it('handles uppercase tier names correctly', () => {
    expect(canAccessModel('gpt-5.4-nano', 'HOBBY')).toBe(true);
    expect(canAccessModel('claude-sonnet-4.6', 'PRO')).toBe(true);
    expect(canAccessModel('claude-opus-4.6', 'MAX')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('MODEL_TIER_REQUIREMENTS consistency', () => {
  it('every model in MODEL_TIER_REQUIREMENTS has at least one tier', () => {
    for (const [model, tiers] of Object.entries(MODEL_TIER_REQUIREMENTS)) {
      expect(tiers.length, `${model} should have at least one required tier`).toBeGreaterThan(0);
    }
  });

  it('no model appears in both ECONOMY_MODELS and MODEL_TIER_REQUIREMENTS', () => {
    for (const model of Object.keys(MODEL_TIER_REQUIREMENTS)) {
      expect(
        ECONOMY_MODELS.has(model),
        `${model} should not appear in both ECONOMY_MODELS and MODEL_TIER_REQUIREMENTS`,
      ).toBe(false);
    }
  });

  it('all tiers in MODEL_TIER_REQUIREMENTS are valid', () => {
    const validTiers = new Set(['pro', 'max', 'enterprise']);
    for (const [model, tiers] of Object.entries(MODEL_TIER_REQUIREMENTS)) {
      for (const tier of tiers) {
        expect(validTiers.has(tier), `${model} has invalid tier: ${tier}`).toBe(true);
      }
    }
  });
});
