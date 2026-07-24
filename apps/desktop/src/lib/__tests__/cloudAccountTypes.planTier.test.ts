import { describe, it, expect } from 'vitest';
import { asPlanTier, PLAN_DISPLAY_NAMES, type PlanTier } from '../cloudAccountTypes';

describe('asPlanTier', () => {
  it('preserves local-only without coercing to free', () => {
    expect(asPlanTier('local-only')).toBe('local-only');
  });

  it('preserves byok without coercing to free', () => {
    expect(asPlanTier('byok')).toBe('byok');
  });

  it('preserves every managed cloud tier', () => {
    expect(asPlanTier('free')).toBe('free');
    expect(asPlanTier('basic')).toBe('basic');
    expect(asPlanTier('pro')).toBe('pro');
    expect(asPlanTier('max')).toBe('max');
    expect(asPlanTier('max_15x')).toBe('max_15x');
    expect(asPlanTier('team')).toBe('team');
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
    const tiers: PlanTier[] = [
      'local-only',
      'byok',
      'free',
      'basic',
      'pro',
      'max',
      'max_15x',
      'team',
      'enterprise',
    ];
    for (const tier of tiers) {
      expect(PLAN_DISPLAY_NAMES[tier]).toBeTruthy();
    }
  });

  it('uses the canonical display labels for the new tiers', () => {
    expect(PLAN_DISPLAY_NAMES['local-only']).toBe('Local Mode');
    expect(PLAN_DISPLAY_NAMES.byok).toBe('Local Mode + BYOK');
    expect(PLAN_DISPLAY_NAMES.max_15x).toBe('Max 15x');
    expect(PLAN_DISPLAY_NAMES.team).toBe('Team');
  });
});
