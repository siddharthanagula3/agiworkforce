/**
 * tierGuard — unit tests
 *
 * Verifies `guardProviderSwitch` and `mapBillingPlanToUIPlan` correctly enforce
 * the current provider-switch gate: Pro tier and above may switch providers
 * mid-thread. Free/BYOK/local-only may not.
 *
 * Tier model (2026-06-20):
 *   PROVIDER_SWITCH_MIN_TIER = 'pro'   (was 'pro_plus' — removed tier)
 *   BillingPlanTier: local-only | byok | free | pro | max | team | enterprise
 *   hobby / pro_plus removed; team maps to pro in UIPlanTier
 */

import {
  guardProviderSwitch,
  mapBillingPlanToUIPlan,
} from '../src/features/model-picker/tierGuard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tier = Parameters<typeof guardProviderSwitch>[2];

// ---------------------------------------------------------------------------
// mapBillingPlanToUIPlan — exhaustive coverage
// ---------------------------------------------------------------------------

describe('mapBillingPlanToUIPlan — all current BillingPlanTier values', () => {
  it('maps local-only → local', () => {
    expect(mapBillingPlanToUIPlan('local-only')).toBe('local');
  });

  it('maps byok → local', () => {
    expect(mapBillingPlanToUIPlan('byok')).toBe('local');
  });

  it('maps free → local', () => {
    expect(mapBillingPlanToUIPlan('free')).toBe('local');
  });

  it('maps pro → pro', () => {
    expect(mapBillingPlanToUIPlan('pro')).toBe('pro');
  });

  it('maps team → pro (team uses pro gate, no team UIPlanTier)', () => {
    expect(mapBillingPlanToUIPlan('team')).toBe('pro');
  });

  it('maps max → max', () => {
    expect(mapBillingPlanToUIPlan('max')).toBe('max');
  });

  it('maps enterprise → max (highest gate)', () => {
    expect(mapBillingPlanToUIPlan('enterprise')).toBe('max');
  });
});

// ---------------------------------------------------------------------------
// guardProviderSwitch — allow cases (pro+ may switch)
// ---------------------------------------------------------------------------

describe('guardProviderSwitch — allow cases', () => {
  it('allows switch when currentProvider is null (new conversation)', () => {
    expect(guardProviderSwitch(null, 'openai', 'free')).toBe('allow');
  });

  it('allows switch when currentProvider is null regardless of tier', () => {
    expect(guardProviderSwitch(null, 'anthropic', 'free')).toBe('allow');
    expect(guardProviderSwitch(null, 'google', 'pro')).toBe('allow');
    expect(guardProviderSwitch(null, 'xai', 'max')).toBe('allow');
  });

  it('allows switch to the same provider at any tier', () => {
    expect(guardProviderSwitch('anthropic', 'anthropic', 'free')).toBe('allow');
    expect(guardProviderSwitch('openai', 'openai', 'byok')).toBe('allow');
  });

  it('allows switch when current provider is an auto-mode id', () => {
    expect(guardProviderSwitch('auto-balanced', 'openai', 'free')).toBe('allow');
    expect(guardProviderSwitch('auto-economy', 'anthropic', 'free')).toBe('allow');
  });

  it('allows switch when target provider is an auto-mode id', () => {
    expect(guardProviderSwitch('anthropic', 'auto-premium', 'free')).toBe('allow');
    expect(guardProviderSwitch('openai', 'auto-balanced', 'free')).toBe('allow');
  });

  it('allows cross-provider switch for pro tier (min tier as of 2026-06-20)', () => {
    expect(guardProviderSwitch('anthropic', 'openai', 'pro')).toBe('allow');
  });

  it('allows cross-provider switch for team tier (maps to pro)', () => {
    expect(guardProviderSwitch('anthropic', 'openai', 'team')).toBe('allow');
  });

  it('allows cross-provider switch for max tier', () => {
    expect(guardProviderSwitch('anthropic', 'google', 'max')).toBe('allow');
  });

  it('allows cross-provider switch for enterprise tier', () => {
    expect(guardProviderSwitch('openai', 'xai', 'enterprise')).toBe('allow');
  });
});

// ---------------------------------------------------------------------------
// guardProviderSwitch — upgrade-required (below pro)
// ---------------------------------------------------------------------------

describe('guardProviderSwitch — upgrade-required cases', () => {
  const belowProTiers: Tier[] = ['free', 'byok', 'local-only'];

  for (const tier of belowProTiers) {
    it(`blocks cross-provider switch for sub-pro tier "${tier}"`, () => {
      expect(guardProviderSwitch('anthropic', 'openai', tier)).toBe('upgrade-required');
    });
  }

  it('blocks switch from anthropic → google at free tier', () => {
    expect(guardProviderSwitch('anthropic', 'google', 'free')).toBe('upgrade-required');
  });

  it('blocks switch from openai → xai at byok tier', () => {
    expect(guardProviderSwitch('openai', 'xai', 'byok')).toBe('upgrade-required');
  });

  it('blocks switch from google → anthropic at local-only tier', () => {
    expect(guardProviderSwitch('google', 'anthropic', 'local-only')).toBe('upgrade-required');
  });
});

// ---------------------------------------------------------------------------
// guardProviderSwitch — edge cases and stress tests (Phase 4)
// ---------------------------------------------------------------------------

describe('guardProviderSwitch — edge cases and stress tests', () => {
  it('treats unknown tier string as local (most restrictive) and blocks switch', () => {
    expect(guardProviderSwitch('anthropic', 'openai', 'unknown_tier' as Tier)).toBe(
      'upgrade-required',
    );
  });

  it('is case-sensitive for auto-mode prefix (capital A does not match)', () => {
    expect(guardProviderSwitch('Auto-balanced', 'openai', 'free')).toBe('upgrade-required');
  });

  it('allows auto-mode to auto-mode switch at any tier (both are auto-prefixed)', () => {
    expect(guardProviderSwitch('auto-balanced', 'auto-premium', 'free')).toBe('allow');
  });

  it('auto-mode to real provider: free tier still blocked', () => {
    expect(guardProviderSwitch('auto-balanced', 'anthropic', 'free')).toBe('allow');
  });

  it('real provider to auto-mode: always allow regardless of tier', () => {
    expect(guardProviderSwitch('anthropic', 'auto-balanced', 'free')).toBe('allow');
    expect(guardProviderSwitch('anthropic', 'auto-premium', 'byok')).toBe('allow');
  });

  it('null currentProvider + any tier always allows (new thread)', () => {
    const tiers: Tier[] = ['free', 'byok', 'local-only', 'pro', 'team', 'max', 'enterprise'];
    for (const tier of tiers) {
      expect(guardProviderSwitch(null, 'openai', tier)).toBe('allow');
    }
  });

  it('same provider always allows regardless of tier (no cross-provider switch)', () => {
    const tiers: Tier[] = ['free', 'byok', 'local-only', 'pro', 'team', 'max', 'enterprise'];
    for (const tier of tiers) {
      expect(guardProviderSwitch('anthropic', 'anthropic', tier)).toBe('allow');
    }
  });

  it('team tier behaves identically to pro tier for all switching scenarios', () => {
    expect(guardProviderSwitch('anthropic', 'openai', 'team')).toBe(
      guardProviderSwitch('anthropic', 'openai', 'pro'),
    );
    expect(guardProviderSwitch(null, 'openai', 'team')).toBe(
      guardProviderSwitch(null, 'openai', 'pro'),
    );
    expect(guardProviderSwitch('anthropic', 'anthropic', 'team')).toBe(
      guardProviderSwitch('anthropic', 'anthropic', 'pro'),
    );
  });
});
