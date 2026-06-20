/**
 * L1 Security — Auth & Authorization
 *
 * Mobile's authorization surface for chat is the tier gate that governs
 * mid-thread provider switching (features/model-picker/tierGuard). It maps the
 * persisted BillingPlanTier to the canonical UIPlanTier and enforces a
 * Pro+ minimum for cross-provider switches. These tests exercise the REAL
 * guard so an authz regression (e.g. a free user gaining cross-provider
 * switching) fails the build.
 */
import { guardProviderSwitch, mapBillingPlanToUIPlan } from '@/src/features/model-picker/tierGuard';

describe('L1 Security - Auth & Authorization', () => {
  test('SECURITY: free/local tier cannot switch providers mid-thread', () => {
    expect(guardProviderSwitch('openai', 'anthropic', 'free')).toBe('upgrade-required');
    expect(guardProviderSwitch('openai', 'anthropic', 'local-only')).toBe('upgrade-required');
    expect(guardProviderSwitch('openai', 'anthropic', 'hobby')).toBe('upgrade-required');
  });

  test('SECURITY: Pro+ and above are authorized for cross-provider switch', () => {
    expect(guardProviderSwitch('openai', 'anthropic', 'pro_plus')).toBe('allow');
    expect(guardProviderSwitch('openai', 'anthropic', 'max')).toBe('allow');
    expect(guardProviderSwitch('openai', 'anthropic', 'enterprise')).toBe('allow');
  });

  test('SECURITY: pro tier is still below the cross-provider gate', () => {
    // Pro maps to pro, which is below pro_plus minimum.
    expect(guardProviderSwitch('openai', 'anthropic', 'pro')).toBe('upgrade-required');
  });

  test('SECURITY: legacy byok tier is treated as local for authz (no privilege escalation)', () => {
    expect(mapBillingPlanToUIPlan('byok')).toBe('local');
    expect(guardProviderSwitch('openai', 'anthropic', 'byok')).toBe('upgrade-required');
  });

  test('SECURITY: same-provider and new-thread switches need no privilege', () => {
    expect(guardProviderSwitch(null, 'anthropic', 'free')).toBe('allow');
    expect(guardProviderSwitch('openai', 'openai', 'free')).toBe('allow');
    expect(guardProviderSwitch('auto-best', 'anthropic', 'free')).toBe('allow');
  });
});
