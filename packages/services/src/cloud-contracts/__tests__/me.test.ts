/**
 * Schema-correctness tests for the `/api/me` cloud contract.
 *
 * The golden fixture is the cross-surface handshake: the web route contract
 * test asserts the live server output matches `MeResponseSchema`, and client
 * suites (mobile tier store) parse this same fixture. If the schema and the
 * fixture ever disagree, this test fails before any client does.
 */

import { describe, it, expect } from 'vitest';
import { MeResponseSchema, parseMeResponse } from '../me';
import golden from '../__fixtures__/me-response.golden.json';

describe('MeResponseSchema', () => {
  it('accepts the golden fixture', () => {
    const result = MeResponseSchema.safeParse(golden);
    expect(result.success).toBe(true);
  });

  it('accepts a free-tier user with null email and no active period', () => {
    const freeUser = {
      ...golden,
      email: null,
      credits: null,
      plan: { tier: 'free', display_name: 'Free', status: 'none', current_period_end: null },
      routing_preferences: {},
    };
    expect(MeResponseSchema.safeParse(freeUser).success).toBe(true);
  });

  it('tolerates unknown feature flags (forward compat)', () => {
    const withNewFlag = {
      ...golden,
      feature_flags: { ...golden.feature_flags, some_future_flag: 'gradual' },
    };
    expect(MeResponseSchema.safeParse(withNewFlag).success).toBe(true);
  });

  it('rejects a payload missing plan.tier', () => {
    const { tier: _tier, ...planWithoutTier } = golden.plan;
    const mutated = { ...golden, plan: planWithoutTier };
    expect(MeResponseSchema.safeParse(mutated).success).toBe(false);
  });

  it('rejects the legacy nested user envelope mobile used to assume', () => {
    // Regression guard: mobile's old private interface expected
    // `{ user: { id, email } }`, which the server never returned.
    const nested = {
      ...golden,
      id: undefined,
      user: { id: golden.id, email: golden.email },
    };
    expect(MeResponseSchema.safeParse(nested).success).toBe(false);
  });

  it('parseMeResponse throws on contract mismatch', () => {
    expect(() => parseMeResponse({})).toThrow();
    expect(parseMeResponse(golden).plan.tier).toBe('pro');
  });
});
