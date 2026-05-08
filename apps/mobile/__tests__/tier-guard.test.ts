/**
 * tierGuard — unit tests
 *
 * Verifies `guardProviderSwitch` correctly allows or blocks provider switches
 * based on the current conversation provider, the target provider, and the
 * user's subscription tier.
 */

import { guardProviderSwitch } from '../services/tierGuard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Tier = Parameters<typeof guardProviderSwitch>[2];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('guardProviderSwitch — allow cases', () => {
  it('allows switch when currentProvider is null (new conversation)', () => {
    expect(guardProviderSwitch(null, 'openai', 'free')).toBe('allow');
  });

  it('allows switch when currentProvider is null regardless of tier', () => {
    expect(guardProviderSwitch(null, 'anthropic', 'hobby')).toBe('allow');
    expect(guardProviderSwitch(null, 'google', 'pro')).toBe('allow');
    expect(guardProviderSwitch(null, 'xai', 'pro_plus')).toBe('allow');
  });

  it('allows switch to the same provider', () => {
    expect(guardProviderSwitch('anthropic', 'anthropic', 'free')).toBe('allow');
    expect(guardProviderSwitch('openai', 'openai', 'hobby')).toBe('allow');
  });

  it('allows switch when current provider is an auto-mode id', () => {
    expect(guardProviderSwitch('auto-balanced', 'openai', 'free')).toBe('allow');
    expect(guardProviderSwitch('auto-economy', 'anthropic', 'hobby')).toBe('allow');
  });

  it('allows switch when target provider is an auto-mode id', () => {
    expect(guardProviderSwitch('anthropic', 'auto-premium', 'free')).toBe('allow');
    expect(guardProviderSwitch('openai', 'auto-balanced', 'hobby')).toBe('allow');
  });

  it('allows cross-provider switch for pro_plus tier', () => {
    expect(guardProviderSwitch('anthropic', 'openai', 'pro_plus')).toBe('allow');
  });

  it('allows cross-provider switch for max tier', () => {
    expect(guardProviderSwitch('anthropic', 'google', 'max')).toBe('allow');
  });

  it('allows cross-provider switch for enterprise tier', () => {
    expect(guardProviderSwitch('openai', 'xai', 'enterprise')).toBe('allow');
  });
});

describe('guardProviderSwitch — upgrade-required cases', () => {
  const subProPlusTiers: Tier[] = ['free', 'hobby', 'pro', 'byok', 'local-only'];

  for (const tier of subProPlusTiers) {
    it(`blocks cross-provider switch for tier "${tier}"`, () => {
      expect(guardProviderSwitch('anthropic', 'openai', tier)).toBe('upgrade-required');
    });
  }

  it('blocks switch from anthropic → google at free tier', () => {
    expect(guardProviderSwitch('anthropic', 'google', 'free')).toBe('upgrade-required');
  });

  it('blocks switch from openai → xai at hobby tier', () => {
    expect(guardProviderSwitch('openai', 'xai', 'hobby')).toBe('upgrade-required');
  });

  it('blocks switch from google → anthropic at pro tier', () => {
    expect(guardProviderSwitch('google', 'anthropic', 'pro')).toBe('upgrade-required');
  });
});

describe('guardProviderSwitch — edge cases', () => {
  it('treats unknown tier as free (most restrictive)', () => {
    // An unknown tier string will resolve to index of 'free' internally.
    // Cast needed to bypass TS type constraint for testing resilience.
    expect(guardProviderSwitch('anthropic', 'openai', 'unknown_tier' as Tier)).toBe(
      'upgrade-required',
    );
  });

  it('is case-sensitive for provider ids (auto-* prefix check)', () => {
    // 'Auto-balanced' (capital A) does NOT match 'auto-' prefix
    expect(guardProviderSwitch('Auto-balanced', 'openai', 'free')).toBe('upgrade-required');
  });

  it('allows same auto-mode to auto-mode switch at any tier', () => {
    expect(guardProviderSwitch('auto-balanced', 'auto-premium', 'free')).toBe('allow');
  });
});
