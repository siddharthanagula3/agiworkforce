import { describe, expect, it } from 'vitest';

import {
  canAccessAutoRoutingProfileForTier,
  getAutoRoutingProfiles,
  getDefaultAutoRoutingProfile,
} from '../model-catalog';

/**
 * Auto is an offering with a plan attached, not a neutral wrapper around the
 * catalog, so the registry gives its alias the same `tierPolicy.minTier` a
 * model carries. Every picker reads that one fact instead of each client
 * deciding for itself which plans may see the row, which is how the picker and
 * the router came to disagree about the free plan in the first place.
 */
const AUTO = getDefaultAutoRoutingProfile().id;

describe('the Auto alias tier gate', () => {
  it('refuses the free plan', () => {
    expect(canAccessAutoRoutingProfileForTier(AUTO, 'free')).toBe(false);
  });

  it('admits every managed plan that pays for it', () => {
    for (const tier of ['basic', 'hobby', 'pro', 'team', 'max', 'max_15x', 'enterprise']) {
      expect(canAccessAutoRoutingProfileForTier(AUTO, tier), tier).toBe(true);
    }
  });

  it('does not measure BYOK or local-only against a managed plan floor', () => {
    for (const tier of ['byok', 'local-only']) {
      expect(canAccessAutoRoutingProfileForTier(AUTO, tier), tier).toBe(true);
    }
  });

  it('refuses a tier it cannot place, rather than admitting it', () => {
    expect(canAccessAutoRoutingProfileForTier(AUTO, 'not-a-plan')).toBe(false);
    expect(canAccessAutoRoutingProfileForTier('not-an-alias', 'max')).toBe(false);
  });
});

describe('the profiles a picker is given', () => {
  it('offers no Auto row to a free account', () => {
    expect(getAutoRoutingProfiles('free')).toEqual([]);
  });

  it('offers the same rows as before to every paid plan', () => {
    const catalogWide = getAutoRoutingProfiles();
    expect(catalogWide.length).toBeGreaterThan(0);
    for (const tier of ['basic', 'pro', 'max', 'enterprise', 'byok']) {
      expect(getAutoRoutingProfiles(tier), tier).toEqual(catalogWide);
    }
  });

  it('still describes the whole catalog when no tier is named', () => {
    expect(getAutoRoutingProfiles()).toEqual(getAutoRoutingProfiles(null));
  });
});
