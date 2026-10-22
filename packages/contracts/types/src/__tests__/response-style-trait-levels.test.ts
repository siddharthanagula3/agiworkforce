import { describe, expect, it } from 'vitest';

import {
  RESPONSE_STYLE_PREFERENCE_DEFAULTS,
  RESPONSE_STYLE_TRAITS,
  RESPONSE_STYLE_TRAIT_KEYS,
  RESPONSE_STYLE_TRAIT_LEVELS,
  RESPONSE_STYLE_TRAIT_NEUTRAL,
  responseStyleLines,
  responseStyleTraitLevel,
  responseStyleTraitScore,
} from '../response-style-preferences';

describe('response style trait levels', () => {
  it('names a level for every trait the prompt builder reads, and no other', () => {
    expect(RESPONSE_STYLE_TRAITS.map((trait) => trait.key).sort()).toEqual(
      [...RESPONSE_STYLE_TRAIT_KEYS].sort(),
    );
  });

  it('offers Less, Default and More in that order', () => {
    expect(RESPONSE_STYLE_TRAIT_LEVELS.map((level) => level.label)).toEqual([
      'Less',
      'Default',
      'More',
    ]);
  });

  it('round-trips every level through its score', () => {
    for (const level of RESPONSE_STYLE_TRAIT_LEVELS) {
      expect(responseStyleTraitLevel(responseStyleTraitScore(level.value))).toBe(level.value);
    }
    expect(responseStyleTraitScore('default')).toBe(RESPONSE_STYLE_TRAIT_NEUTRAL);
  });

  it('shows a level only where the prompt builder acts on the score', () => {
    for (let score = 0; score <= 100; score += 1) {
      const lines = responseStyleLines({
        ...RESPONSE_STYLE_PREFERENCE_DEFAULTS,
        traits: { warmth: score },
      });
      expect(lines.length > 0).toBe(responseStyleTraitLevel(score) !== 'default');
    }
  });

  it('puts the boundaries at the prompt builder band', () => {
    expect(responseStyleTraitLevel(30)).toBe('less');
    expect(responseStyleTraitLevel(31)).toBe('default');
    expect(responseStyleTraitLevel(69)).toBe('default');
    expect(responseStyleTraitLevel(70)).toBe('more');
  });
});
