import { describe, it, expect } from 'vitest';
import { asPlanTier, PLAN_DISPLAY_NAMES, type PlanTier } from '../supabase';

describe('asPlanTier', () => {
  it('preserves local-only without coercing to free', () => {
    expect(asPlanTier('local-only')).toBe('local-only');
  });

  it('preserves byok without coercing to free', () => {
    expect(asPlanTier('byok')).toBe('byok');
  });

  it('preserves the legacy tiers', () => {
    expect(asPlanTier('free')).toBe('free');
    expect(asPlanTier('hobby')).toBe('hobby');
    expect(asPlanTier('pro')).toBe('pro');
    expect(asPlanTier('max')).toBe('max');
    expect(asPlanTier('enterprise')).toBe('enterprise');
  });

  it('lowercases mixed-case input before matching', () => {
    expect(asPlanTier('LOCAL-ONLY')).toBe('local-only');
    expect(asPlanTier('Byok')).toBe('byok');
    expect(asPlanTier('Pro')).toBe('pro');
  });

  it('falls back to free for unknown values', () => {
    expect(asPlanTier('unknown')).toBe('free');
    expect(asPlanTier(null)).toBe('free');
    expect(asPlanTier(undefined)).toBe('free');
    expect(asPlanTier('')).toBe('free');
  });
});

describe('PLAN_DISPLAY_NAMES', () => {
  it('has a display name for every PlanTier value', () => {
    const tiers: PlanTier[] = ['local-only', 'byok', 'free', 'hobby', 'pro', 'max', 'enterprise'];
    for (const tier of tiers) {
      expect(PLAN_DISPLAY_NAMES[tier]).toBeTruthy();
    }
  });

  it('uses the canonical display labels for the new tiers', () => {
    expect(PLAN_DISPLAY_NAMES['local-only']).toBe('Local Only');
    expect(PLAN_DISPLAY_NAMES.byok).toBe('BYOK');
  });
});
