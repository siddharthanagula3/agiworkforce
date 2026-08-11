/**
 * L1 Security — Auth & Authorization
 *
 * Mobile's authorization surface for chat is the tier gate that governs
 * mid-thread provider switching (features/model-picker/tierGuard). It maps the
 * persisted BillingPlanTier to the canonical UIPlanTier and enforces a
 * Pro minimum for cross-provider switches (gate lowered from pro_plus when
 * pro_plus tier was removed, 2026-06-20). These tests exercise the REAL
 * guard so an authz regression (e.g. a free user gaining cross-provider
 * switching) fails the build.
 */
import { guardProviderSwitch, mapBillingPlanToUIPlan } from '@/src/features/model-picker/tierGuard';
import { getDefaultAutoRoutingProfile } from '@agiworkforce/types';

describe('L1 Security - Auth & Authorization', () => {
  test('SECURITY: free/local/byok tiers cannot switch providers mid-thread', () => {
    expect(guardProviderSwitch('openai', 'anthropic', 'free')).toBe('upgrade-required');
    expect(guardProviderSwitch('openai', 'anthropic', 'local-only')).toBe('upgrade-required');
    expect(guardProviderSwitch('openai', 'anthropic', 'byok')).toBe('upgrade-required');
  });

  test('SECURITY: Max and above are authorized for cross-provider switch', () => {
    expect(guardProviderSwitch('openai', 'anthropic', 'max')).toBe('allow');
    expect(guardProviderSwitch('openai', 'anthropic', 'max_15x')).toBe('allow');
    expect(guardProviderSwitch('openai', 'anthropic', 'enterprise')).toBe('allow');
  });

  test('SECURITY: Pro and Team do NOT reach the cross-provider switch gate', () => {
    // The gate was raised from pro to max on 2026-08-05
    // (MOBILE-PROVIDER-SWITCH-GATE-DIVERGENCE-01) so Mobile matches the
    // canonical canSwitchProviderInThread() already used by web, desktop, and
    // the VS Code guard. Pro/Team passing here would be a privilege regression.
    expect(guardProviderSwitch('openai', 'anthropic', 'pro')).toBe('upgrade-required');
    expect(guardProviderSwitch('openai', 'anthropic', 'team')).toBe('upgrade-required');
  });

  test('SECURITY: no privilege escalation from removed tiers (hobby/pro_plus map to local)', () => {
    // Stale persisted values from old installs must not grant elevated access.
    // mapBillingPlanToUIPlan falls through to default → local for unknown values.
    const staleTiers = ['hobby', 'pro_plus'] as Parameters<typeof guardProviderSwitch>[2][];
    for (const t of staleTiers) {
      expect(guardProviderSwitch('openai', 'anthropic', t)).toBe('upgrade-required');
    }
  });

  test('SECURITY: legacy byok tier is treated as local for authz (no privilege escalation)', () => {
    expect(mapBillingPlanToUIPlan('byok')).toBe('local');
    expect(guardProviderSwitch('openai', 'anthropic', 'byok')).toBe('upgrade-required');
  });

  test('SECURITY: same-provider and new-thread switches need no privilege', () => {
    const autoSelection = getDefaultAutoRoutingProfile().id;

    expect(guardProviderSwitch(null, 'anthropic', 'free')).toBe('allow');
    expect(guardProviderSwitch('openai', 'openai', 'free')).toBe('allow');
    expect(guardProviderSwitch(autoSelection, 'anthropic', 'free')).toBe('allow');
  });
});
