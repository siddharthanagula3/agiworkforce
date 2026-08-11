import { describe, expect, it } from 'vitest';
import { isBillingPolicyReady } from './billing-policy';

describe('isBillingPolicyReady', () => {
  it('does not enforce free-tier fallbacks while account billing is unresolved', () => {
    expect(
      isBillingPolicyReady({
        initialized: false,
        isLoading: true,
        error: null,
        subscription: null,
      }),
    ).toBe(false);
  });

  it('accepts a preloaded subscription before the broader auth store settles', () => {
    expect(
      isBillingPolicyReady({
        initialized: false,
        isLoading: true,
        error: null,
        subscription: { tier: 'max_15x' },
      }),
    ).toBe(true);
  });

  it('allows a successfully resolved signed-out state to use the Free fallback', () => {
    expect(
      isBillingPolicyReady({
        initialized: true,
        isLoading: false,
        error: null,
        subscription: null,
      }),
    ).toBe(true);
  });

  it('does not turn an account-load failure into a false Free-tier upgrade gate', () => {
    expect(
      isBillingPolicyReady({
        initialized: true,
        isLoading: false,
        error: '/api/me returned 500',
        subscription: null,
      }),
    ).toBe(false);
  });

  it('keeps a null account policy unresolved during an explicit refresh', () => {
    expect(
      isBillingPolicyReady({
        initialized: true,
        isLoading: true,
        error: null,
        subscription: null,
      }),
    ).toBe(false);
  });
});
