import { describe, expect, it } from 'vitest';

import {
  DESKTOP_RELEASE_CHANNELS,
  desktopChannelCarriesMaturity,
} from '@/lib/releases/github-desktop-releases';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  FEATURE_MATURITIES,
  FlagDefinitionInputSchema,
  MATURITY_DENIAL_REASONS,
  RELEASE_CHANNELS,
  channelCarriesMaturity,
  flagChannel,
  flagDenialReason,
  flagGovernanceGaps,
  flagMaturity,
} from '../flag-definition';
import { RELEASE_CHANNELS as RING_CHANNELS } from '../rollout-rings';

const BASE = { key: 'checkout.new_flow', variants: ['on', 'off'], defaultVariant: 'off' };

describe('feature maturity and release channel registry', () => {
  it('is the one channel vocabulary every surface reads', () => {
    expect([...DESKTOP_RELEASE_CHANNELS]).toEqual([...RELEASE_CHANNELS]);
    expect([...RING_CHANNELS]).toEqual([...RELEASE_CHANNELS]);
  });

  it('labels general availability explicitly rather than implying it', () => {
    expect(FEATURE_MATURITIES).toContain('general_availability');
    expect(MATURITY_DENIAL_REASONS.general_availability).toBeNull();
  });

  it('gives every unfinished maturity a denial reason from the shared taxonomy', () => {
    expect(MATURITY_DENIAL_REASONS.experimental).toBe('feature_experimental');
    expect(MATURITY_DENIAL_REASONS.beta).toBe('feature_closed_beta');
    expect(MATURITY_DENIAL_REASONS.deprecated).toBe('feature_deprecated');
  });

  it('refuses to hand an unfinished feature to a wider channel than it has earned', () => {
    expect(channelCarriesMaturity('nightly', 'experimental')).toBe(true);
    expect(channelCarriesMaturity('stable', 'experimental')).toBe(false);
    expect(channelCarriesMaturity('beta', 'beta')).toBe(true);
    expect(channelCarriesMaturity('stable', 'general_availability')).toBe(true);
    expect(desktopChannelCarriesMaturity('stable', 'beta')).toBe(false);
  });

  it('rejects a flag whose channel is wider than its maturity', () => {
    const parsed = FlagDefinitionInputSchema.safeParse({
      ...BASE,
      maturity: 'experimental',
      channel: 'stable',
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues[0]?.path).toEqual(['channel']);
  });

  it('names an expiring flag that nobody owns, and an undeclared maturity', () => {
    const orphan = FlagDefinitionInputSchema.parse({
      ...BASE,
      expiresAt: '2026-12-01T00:00:00.000Z',
    });
    expect(flagGovernanceGaps(orphan)).toEqual([
      expect.stringContaining('names no owner'),
      expect.stringContaining('declares no maturity'),
    ]);

    const owned = FlagDefinitionInputSchema.parse({
      ...BASE,
      expiresAt: '2026-12-01T00:00:00.000Z',
      owner: 'checkout-team',
      maturity: 'beta',
      channel: 'beta',
    });
    expect(flagGovernanceGaps(owned)).toEqual([]);
  });

  it('carries internal-staff targeting as its own dimension, not as a role', () => {
    const parsed = FlagDefinitionInputSchema.safeParse({
      ...BASE,
      rules: [{ id: 'staff', conditions: { internalStaffOnly: true }, variant: 'on' }],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.rules[0]?.conditions.internalStaffOnly).toBe(true);
  });

  it('defaults an undeclared flag to the narrowest maturity and denies on it', () => {
    const parsed = FlagDefinitionInputSchema.parse(BASE);
    expect(flagMaturity(parsed)).toBe('experimental');
    expect(flagChannel(parsed)).toBe('stable');
    expect(flagDenialReason(parsed)).toBe('feature_experimental');
    expect(flagDenialReason({ maturity: 'general_availability' })).toBeNull();
  });

  it('states the mobile surface maturity and channel in the shared vocabulary', () => {
    const state = JSON.parse(
      readFileSync(
        path.resolve(
          __dirname,
          '../../../../mobile/src/features/release-state/mobileReleaseState.json',
        ),
        'utf8',
      ),
    ) as { maturity: string; channel: string; released: boolean };
    expect(FEATURE_MATURITIES).toContain(state.maturity);
    expect(RELEASE_CHANNELS).toContain(state.channel);
    expect(state.released).toBe(false);
    expect(
      channelCarriesMaturity(
        state.channel as (typeof RELEASE_CHANNELS)[number],
        state.maturity as (typeof FEATURE_MATURITIES)[number],
      ),
    ).toBe(true);
  });
});
