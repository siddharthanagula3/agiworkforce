
import {
  guardProviderSwitch,
  mapBillingPlanToUIPlan,
} from '../src/features/model-picker/tierGuard';
import { requireAutoMode } from '../test-utils/modelFixtures';

type Tier = Parameters<typeof guardProviderSwitch>[2];
const AUTO_MODEL_ID = requireAutoMode().id;

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
    expect(guardProviderSwitch(AUTO_MODEL_ID, 'openai', 'free')).toBe('allow');
  });

  it('allows switch when target provider is an auto-mode id', () => {
    expect(guardProviderSwitch('anthropic', AUTO_MODEL_ID, 'free')).toBe('allow');
  });

  it('allows cross-provider switch for max tier', () => {
    expect(guardProviderSwitch('anthropic', 'google', 'max')).toBe('allow');
  });

  it('allows cross-provider switch for enterprise tier', () => {
    expect(guardProviderSwitch('openai', 'xai', 'enterprise')).toBe('allow');
  });
});

describe('guardProviderSwitch — upgrade-required cases', () => {
  const belowMaxTiers: Tier[] = ['free', 'byok', 'local-only', 'pro', 'team'];

  for (const tier of belowMaxTiers) {
    it(`blocks cross-provider switch for sub-max tier "${tier}"`, () => {
      expect(guardProviderSwitch('anthropic', 'openai', tier)).toBe('upgrade-required');
    });
  }

  it('blocks switch from anthropic → google at free tier', () => {
    expect(guardProviderSwitch('anthropic', 'google', 'free')).toBe('upgrade-required');
  });

  it('blocks cross-provider switch at pro tier (below canonical max gate)', () => {
    expect(guardProviderSwitch('anthropic', 'openai', 'pro')).toBe('upgrade-required');
  });

  it('blocks cross-provider switch at team tier (maps to pro, below max gate)', () => {
    expect(guardProviderSwitch('anthropic', 'openai', 'team')).toBe('upgrade-required');
  });

  it('blocks switch from openai → xai at byok tier', () => {
    expect(guardProviderSwitch('openai', 'xai', 'byok')).toBe('upgrade-required');
  });

  it('blocks switch from google → anthropic at local-only tier', () => {
    expect(guardProviderSwitch('google', 'anthropic', 'local-only')).toBe('upgrade-required');
  });
});

describe('guardProviderSwitch — edge cases and stress tests', () => {
  it('treats unknown tier string as local (most restrictive) and blocks switch', () => {
    expect(guardProviderSwitch('anthropic', 'openai', 'unknown_tier' as Tier)).toBe(
      'upgrade-required',
    );
  });

  it('rejects a case-mutated Auto id instead of treating prefixes as admission', () => {
    expect(guardProviderSwitch(AUTO_MODEL_ID.toUpperCase(), 'openai', 'free')).toBe(
      'upgrade-required',
    );
  });

  it('allows the canonical auto-mode to remain selected at any tier', () => {
    expect(guardProviderSwitch(AUTO_MODEL_ID, AUTO_MODEL_ID, 'free')).toBe('allow');
  });

  it('auto-mode to real provider: free tier still blocked', () => {
    expect(guardProviderSwitch(AUTO_MODEL_ID, 'anthropic', 'free')).toBe('allow');
  });

  it('real provider to auto-mode: always allow regardless of tier', () => {
    expect(guardProviderSwitch('anthropic', AUTO_MODEL_ID, 'free')).toBe('allow');
    expect(guardProviderSwitch('anthropic', AUTO_MODEL_ID, 'byok')).toBe('allow');
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
