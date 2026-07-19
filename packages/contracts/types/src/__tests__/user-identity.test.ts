import { describe, expect, it } from 'vitest';
import {
  PLAN_LABEL,
  canSwitchProviderInThread,
  isFreePlan,
  normalizeUIPlanTier,
  tierAtLeast,
} from '../design-system/user-identity';

describe('UI plan identity', () => {
  it('preserves every current managed plan instead of falling back to BYOK', () => {
    expect(normalizeUIPlanTier('free', 'free')).toBe('free');
    expect(normalizeUIPlanTier('basic', 'free')).toBe('basic');
    expect(normalizeUIPlanTier('pro', 'free')).toBe('pro');
    expect(normalizeUIPlanTier('max', 'free')).toBe('max');
    expect(normalizeUIPlanTier('max_15x', 'free')).toBe('max_15x');
    expect(normalizeUIPlanTier('team', 'free')).toBe('team');
    expect(normalizeUIPlanTier('enterprise', 'free')).toBe('enterprise');
  });

  it('normalizes host and legacy aliases without crossing trust boundaries', () => {
    expect(normalizeUIPlanTier('local-only')).toBe('local');
    expect(normalizeUIPlanTier('hobby', 'free')).toBe('basic');
    expect(normalizeUIPlanTier('unknown-managed-tier', 'free')).toBe('free');
    expect(normalizeUIPlanTier(undefined)).toBe('byok');
  });

  it('uses the canonical public plan labels', () => {
    expect(PLAN_LABEL.free).toBe('Free');
    expect(PLAN_LABEL.max).toBe('Max 5x');
    expect(PLAN_LABEL.max_15x).toBe('Max 15x');
    expect(PLAN_LABEL.team).toBe('Team');
  });

  it('treats Managed Free as free-priced but not as BYOK', () => {
    expect(isFreePlan('free')).toBe(true);
    expect(isFreePlan('byok')).toBe(true);
    expect(isFreePlan('basic')).toBe(false);
  });

  it('retains Max cross-provider switching for both Max plans and Enterprise', () => {
    expect(canSwitchProviderInThread('pro')).toBe(false);
    expect(canSwitchProviderInThread('team')).toBe(false);
    expect(canSwitchProviderInThread('max')).toBe(true);
    expect(canSwitchProviderInThread('max_15x')).toBe(true);
    expect(canSwitchProviderInThread('enterprise')).toBe(true);
  });

  it('treats Team as Pro-level and orders the two Max plans separately', () => {
    expect(tierAtLeast('team', 'pro')).toBe(true);
    expect(tierAtLeast('team', 'max')).toBe(false);
    expect(tierAtLeast('max_15x', 'max')).toBe(true);
    expect(tierAtLeast('enterprise', 'max_15x')).toBe(true);
  });
});
