import { modelRegistry } from '@agiworkforce/model-registry';
import { describe, expect, it } from 'vitest';

import {
  demoteLowConfidencePremiumSelection,
  PREMIUM_PROFILE_CONFIDENCE_FLOOR,
} from './route-selection';

interface AliasView {
  profile: string;
  computeProfile?: boolean;
}

const aliases = modelRegistry.policies.auto.aliases as unknown as Record<string, AliasView>;
const profileByTask = modelRegistry.policies.auto.autoProfileByTask as unknown as Record<
  string,
  string
>;
const computedAlias = Object.entries(aliases).find(([, alias]) => alias.computeProfile)![0];
const premiumTask = Object.entries(profileByTask).find(([, profile]) => profile === 'premium')![0];
const economyTask = Object.entries(profileByTask).find(([, profile]) => profile === 'economy')![0];
const staticAlias = Object.entries(aliases).find(([, alias]) => !alias.computeProfile)![0];
const weak = PREMIUM_PROFILE_CONFIDENCE_FLOOR - 0.1;
const strong = PREMIUM_PROFILE_CONFIDENCE_FLOOR;

describe('demoteLowConfidencePremiumSelection', () => {
  it('drops a weakly classified premium task to the balanced alias', () => {
    const result = demoteLowConfidencePremiumSelection(computedAlias, premiumTask as never, weak);
    expect(result).not.toBe(computedAlias);
    expect(aliases[result]?.profile).toBe('balanced');
    expect(aliases[result]?.computeProfile).toBeFalsy();
  });

  it('keeps the computed alias at or above the floor', () => {
    expect(demoteLowConfidencePremiumSelection(computedAlias, premiumTask as never, strong)).toBe(
      computedAlias,
    );
  });

  it('never touches a task the policy does not route at the premium profile', () => {
    expect(demoteLowConfidencePremiumSelection(computedAlias, economyTask as never, weak)).toBe(
      computedAlias,
    );
  });

  it('never touches a static alias or an explicit model', () => {
    expect(demoteLowConfidencePremiumSelection(staticAlias, premiumTask as never, weak)).toBe(
      staticAlias,
    );
    const explicit = Object.keys(modelRegistry.models)[0]!;
    expect(demoteLowConfidencePremiumSelection(explicit, premiumTask as never, weak)).toBe(
      explicit,
    );
  });
});
