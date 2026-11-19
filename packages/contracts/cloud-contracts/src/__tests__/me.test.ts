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

  it('accepts only known subscription management sources', () => {
    for (const subscription_source of ['none', 'stripe', 'apple', 'google', 'manual'] as const) {
      expect(
        MeResponseSchema.safeParse({
          ...golden,
          plan: { ...golden.plan, subscription_source },
        }).success,
      ).toBe(true);
    }
    expect(
      MeResponseSchema.safeParse({
        ...golden,
        plan: { ...golden.plan, subscription_source: 'current-device' },
      }).success,
    ).toBe(false);
  });

  it('accepts only known billing owners and leaves the field optional for older servers', () => {
    for (const billing_owner of ['organization', 'personal'] as const) {
      expect(
        parseMeResponse({ ...golden, plan: { ...golden.plan, billing_owner } }).plan.billing_owner,
      ).toBe(billing_owner);
    }
    expect(parseMeResponse(golden).plan.billing_owner).toBeUndefined();
    expect(
      MeResponseSchema.safeParse({
        ...golden,
        plan: { ...golden.plan, billing_owner: 'workspace' },
      }).success,
    ).toBe(false);
  });

  it('accepts and preserves scheduled cancellation state', () => {
    const parsed = parseMeResponse({
      ...golden,
      plan: { ...golden.plan, cancel_at_period_end: true },
    });
    expect(parsed.plan.cancel_at_period_end).toBe(true);

    expect(
      MeResponseSchema.safeParse({
        ...golden,
        plan: { ...golden.plan, cancel_at_period_end: 'yes' },
      }).success,
    ).toBe(false);
  });

  it('rejects a payload missing plan.tier', () => {
    const { tier: _tier, ...planWithoutTier } = golden.plan;
    const mutated = { ...golden, plan: planWithoutTier };
    expect(MeResponseSchema.safeParse(mutated).success).toBe(false);
  });

  it('rejects the legacy nested user envelope mobile used to assume', () => {
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

describe('MeResponseSchema, attachment_limits and the large file offer', () => {
  const MIB = 1024 * 1024;
  const today = {
    max_file_bytes: 25 * MIB,
    max_image_bytes: 20 * MIB,
    max_message_bytes: 25 * MIB,
    max_files_per_message: 10,
  };

  it('parses a server that predates the offer, with no new field added', () => {
    expect(
      parseMeResponse({ ...golden, attachment_limits: today }).attachment_limits,
    ).toStrictEqual(today);
    expect(parseMeResponse(golden).attachment_limits).toBeUndefined();
  });

  it('keeps the offer, the storage left and the inline budget when the server sends them', () => {
    const offered = {
      ...today,
      max_file_bytes: 500 * MIB,
      max_message_bytes: 2048 * MIB,
      max_files_per_message: 20,
      large_files_available: true,
      storage_remaining_bytes: 9 * 1024 * MIB,
      inline_message_bytes: 25 * MIB,
    };
    expect(
      parseMeResponse({ ...golden, attachment_limits: offered }).attachment_limits,
    ).toStrictEqual(offered);
  });

  it('keeps the rest of the answer when the offer is malformed', () => {
    const parsed = parseMeResponse({
      ...golden,
      attachment_limits: { ...today, large_files_available: true },
    });
    expect(parsed.attachment_limits).toBeUndefined();
    expect(parsed.plan.tier).toBe('pro');
  });
});

describe('MeResponseSchema, capability_handshake (six-app finding A)', () => {
  it('accepts the golden fixture pro-tier capability_handshake document', () => {
    const result = MeResponseSchema.safeParse(golden);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.capability_handshake?.sessionId).toBe(golden.id);
      expect(result.data.capability_handshake?.granted).toContain('canUseWebSearch');
    }
  });

  it('is optional, a pre-handshake payload (no field at all) still parses (backward compat)', () => {
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
