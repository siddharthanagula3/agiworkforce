import { describe, expect, it } from 'vitest';
import { isBillingPolicyReady } from './billing-policy';

describe('isBillingPolicyReady', () => {
  it('does not enforce free-tier fallbacks while account billing is unresolved', () => {
    expect(isBillingPolicyReady({ initialized: false, subscription: null })).toBe(false);
  });

  it('accepts a preloaded subscription before the broader auth store settles', () => {
    expect(
      isBillingPolicyReady({
        initialized: false,
        subscription: { tier: 'max_15x' },
      }),
    ).toBe(true);
  });

  it('allows signed-out and failed-load states to resolve to their explicit fallback', () => {
    expect(isBillingPolicyReady({ initialized: true, subscription: null })).toBe(true);
  });
});
