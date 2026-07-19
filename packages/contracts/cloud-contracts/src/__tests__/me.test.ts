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

  it('accepts the generic web-search deployment capability as a boolean', () => {
    const withSearchBackend = {
      ...golden,
      feature_flags: { ...golden.feature_flags, generic_web_search: true },
    };
    const result = MeResponseSchema.safeParse(withSearchBackend);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.feature_flags.generic_web_search).toBe(true);
    }

    expect(
      MeResponseSchema.safeParse({
        ...withSearchBackend,
        feature_flags: { ...withSearchBackend.feature_flags, generic_web_search: 'yes' },
      }).success,
    ).toBe(false);
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

describe('MeResponseSchema — capability_handshake (six-app finding A)', () => {
  it('accepts the golden fixture pro-tier capability_handshake document', () => {
    const result = MeResponseSchema.safeParse(golden);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.capability_handshake?.sessionId).toBe(golden.id);
      expect(result.data.capability_handshake?.granted).toContain('canUseWebSearch');
    }
  });

  it('is optional — a pre-handshake payload (no field at all) still parses (backward compat)', () => {
    const { capability_handshake: _omit, ...withoutHandshake } = golden;
    expect(MeResponseSchema.safeParse(withoutHandshake).success).toBe(true);
  });

  it('round-trips granted/deniedBy through parseMeResponse without dropping entries', () => {
    const parsed = parseMeResponse(golden);
    expect(parsed.capability_handshake?.granted).toEqual(golden.capability_handshake.granted);
    expect(parsed.capability_handshake?.deniedBy).toEqual(golden.capability_handshake.deniedBy);
  });

  it('rejects a capability_handshake missing a required field (version)', () => {
    const { version: _version, ...handshakeWithoutVersion } = golden.capability_handshake;
    const mutated = { ...golden, capability_handshake: handshakeWithoutVersion };
    expect(MeResponseSchema.safeParse(mutated).success).toBe(false);
  });

  it('rejects an unknown layer name inside deniedBy (the four-layer enum stays closed)', () => {
    const mutated = {
      ...golden,
      capability_handshake: {
        ...golden.capability_handshake,
        deniedBy: { canUseWebSearch: ['not_a_real_layer'] },
      },
    };
    expect(MeResponseSchema.safeParse(mutated).success).toBe(false);
  });

  it('tier-layer honesty at the wire level: a free-tier fixture shows capabilities denied by tier, not granted', () => {
    const freeUserWithHandshake = {
      ...golden,
      plan: { tier: 'free', display_name: 'Free', status: 'none', current_period_end: null },
      capability_handshake: {
        ...golden.capability_handshake,
        sources: { ...golden.capability_handshake.sources, tier: 'tier:free' },
        // A real free-tier document (see apps/web capability-handshake-service
        // tests): search/deep-research/voice/connectors are tier-denied.
        granted: [
          'canChat',
          'canUseImages',
          'canUploadFiles',
          'canUseMarketplace',
          'canUseBilling',
        ],
        deniedBy: {
          canUseWebSearch: ['tier'],
          canUseDeepResearch: ['tier'],
          canUseVoice: ['tier'],
          canUseConnectors: ['tier'],
        },
      },
    };
    const result = MeResponseSchema.safeParse(freeUserWithHandshake);
    expect(result.success).toBe(true);
    if (result.success) {
      const handshake = result.data.capability_handshake;
      expect(handshake?.granted).not.toContain('canUseWebSearch');
      expect(handshake?.granted).not.toContain('canUseDeepResearch');
      expect(handshake?.deniedBy['canUseWebSearch']).toEqual(['tier']);
    }
  });
});
