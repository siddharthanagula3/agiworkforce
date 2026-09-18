import { describe, expect, it } from 'vitest';

import {
  RESPONSE_LANGUAGE_AUTO,
  normalizeResponseStylePreference,
  responseStyleLines,
} from '../response-style-preferences';

describe('normalizing a stored namespace', () => {
  it('falls back to the neutral value for anything it does not recognise', () => {
    expect(
      normalizeResponseStylePreference({
        style: 'shouty',
        technicalLevel: 42,
        preferredFormatting: null,
        responseLanguage: 'not a language tag',
      }),
    ).toEqual({
      style: 'default',
      technicalLevel: 'unspecified',
      preferredFormatting: 'unspecified',
      responseLanguage: RESPONSE_LANGUAGE_AUTO,
      traits: {},
    });
  });

  it('keeps a well-formed language tag, including a region', () => {
    expect(normalizeResponseStylePreference({ responseLanguage: 'pt-BR' }).responseLanguage).toBe(
      'pt-BR',
    );
  });

  it('clamps a trait to the slider range and ignores a non-number', () => {
    expect(
      normalizeResponseStylePreference({ warmth: 140, enthusiasm: -5, emoji: 'lots' }).traits,
    ).toEqual({ warmth: 100, enthusiasm: 0 });
  });
});

describe('the lines a preference set produces', () => {
  it('says nothing at all when nothing was chosen', () => {
    expect(responseStyleLines(normalizeResponseStylePreference({}))).toEqual([]);
  });

  it('names the language first, because the rest is moot in the wrong one', () => {
    const lines = responseStyleLines(
      normalizeResponseStylePreference({ responseLanguage: 'de', style: 'concise' }),
    );

    expect(lines[0]).toMatch(/^Respond in German/u);
    expect(lines).toHaveLength(2);
  });

  it('states the technical level and the formatting as separate instructions', () => {
    const lines = responseStyleLines(
      normalizeResponseStylePreference({
        technicalLevel: 'beginner',
        preferredFormatting: 'prose',
      }),
    );

    expect(lines).toEqual([
      'The user is new to this subject. Define terms before using them and prefer plain language over jargon.',
      'Answer in flowing prose. Avoid headers and bullet lists.',
    ]);
  });

  it('ignores a trait that sits near neutral', () => {
    expect(responseStyleLines(normalizeResponseStylePreference({ warmth: 55 }))).toEqual([]);
    expect(responseStyleLines(normalizeResponseStylePreference({ warmth: 80 }))).toEqual([
      'Be warm and personable.',
    ]);
  });
});
