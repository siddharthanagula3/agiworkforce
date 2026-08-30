import { describe, expect, it } from 'vitest';
import { getAutoRoutingProfiles } from '@agiworkforce/types';
import { getAutoCapabilityEnvelope } from '@agiworkforce/routing';
import { CLOUD_FALLBACK_MODELS } from '../modelStore';

const PROFILE_TIER = {
  economy: 'free',
  balanced: 'pro',
  premium: 'max',
} as const;

describe('unified-chat fallback model registry', () => {
  it('admits only chat fallbacks with provider-published token windows', () => {
    expect(CLOUD_FALLBACK_MODELS.length).toBeGreaterThan(0);
    expect(
      CLOUD_FALLBACK_MODELS.every(
        (model) => Number.isFinite(model.contextWindow) && model.contextWindow > 0,
      ),
    ).toBe(true);
  });

  it('derives every Auto row from the canonical resolver, not a representative model', () => {
    const profiles = getAutoRoutingProfiles();
    const rows = CLOUD_FALLBACK_MODELS.filter((model) => model.id.startsWith('auto'));

    expect(rows.map(({ id, name }) => ({ id, name }))).toEqual(
      profiles.map(({ id, label }) => ({ id, name: label })),
    );

    for (const profile of profiles) {
      const row = rows.find((candidate) => candidate.id === profile.id);
      const envelope = getAutoCapabilityEnvelope({
        selection: profile.id,
        subscriptionTier: PROFILE_TIER[profile.profile],
        trustMode: 'managed_cloud',
        runtimeProfileId: 'web/cloud-chat',
      });

      expect(envelope, `profile ${profile.id} must resolve`).not.toBeNull();
      expect(row?.contextWindow).toBe(envelope!.contextWindow);
      expect(row?.supportsVision).toBe(envelope!.supportsVision);
      expect(row?.supportsTools).toBe(envelope!.supportsTools);
      expect(row?.supportsThinking).toBe(envelope!.supportsThinking);
    }
  });

  it('never advertises more context than the smallest route Auto can pick', () => {
    // Regression guard for the defect this replaced: the row used to carry ONE
    // representative model's context window, which overstated the guarantee
    // whenever Auto could also route to a smaller-context model.
    const profiles = getAutoRoutingProfiles();
    for (const profile of profiles) {
      const row = CLOUD_FALLBACK_MODELS.find((candidate) => candidate.id === profile.id);
      const envelope = getAutoCapabilityEnvelope({
        selection: profile.id,
        subscriptionTier: PROFILE_TIER[profile.profile],
        trustMode: 'managed_cloud',
        runtimeProfileId: 'web/cloud-chat',
      });
      expect(envelope).not.toBeNull();
      // More than one reachable route means this is a genuine intersection.
      expect(envelope!.reachableModelKeys.length).toBeGreaterThan(0);
      expect(row!.contextWindow).toBeLessThanOrEqual(envelope!.contextWindow);
    }
  });
});
