import { describe, expect, it } from 'vitest';

import { sanitizeSlackDisplayName } from './slack-display-name';

describe('sanitizeSlackDisplayName', () => {
  it('turns a long hostile name into one short line', () => {
    const hostile = `Ada\n\t\u200b\u202eLovelace ${'x'.repeat(500)} https://evil.example/login\r\n`;
    const cleaned = sanitizeSlackDisplayName(hostile);
    expect(cleaned).not.toMatch(/[\n\r\t\u200b\u202e]/);
    expect(Array.from(cleaned).length).toBeLessThanOrEqual(64);
    expect(cleaned.endsWith('…')).toBe(true);
    expect(cleaned.startsWith('Ada Lovelace ')).toBe(true);
  });

  it('keeps an ordinary name unchanged', () => {
    expect(sanitizeSlackDisplayName('  Ada   Lovelace ')).toBe('Ada Lovelace');
  });

  it('returns an empty string for a name made only of invisible characters', () => {
    expect(sanitizeSlackDisplayName('\u200b\u202e \n')).toBe('');
  });

  it('keeps emoji joined with zero-width joiners', () => {
    const family = '👨\u200d👩\u200d👧\u200d👦';
    const heart = '❤️\u200d🔥';
    const wave = '👋🏽';
    expect(sanitizeSlackDisplayName(`Ada ${family} ${heart} ${wave}`)).toBe(
      `Ada ${family} ${heart} ${wave}`,
    );
  });

  it('removes direction overrides, isolates and invisible spoofing characters', () => {
    expect(
      sanitizeSlackDisplayName('Ada\u202Egnp.exe\u202C\u2066x\u2069\u200Ey\u2060z\uFEFF'),
    ).toBe('Ada gnp.exe x y z');
  });

  it('removes a joiner that is not part of an emoji sequence', () => {
    expect(sanitizeSlackDisplayName('Ad\u200Da')).toBe('Ada');
    expect(sanitizeSlackDisplayName('\u200D👨\u200D')).toBe('👨');
  });

  it('removes hidden tag characters', () => {
    expect(sanitizeSlackDisplayName('Ada\u{E0069}\u{E0067}\u{E006E}')).toBe('Ada');
  });

  it('keeps joiners that shape Persian and Indic names', () => {
    const persian = 'می\u200Cخواهم';
    const hindi = 'क्\u200Dष';
    expect(sanitizeSlackDisplayName(persian)).toBe(persian);
    expect(sanitizeSlackDisplayName(hindi)).toBe(hindi);
  });

  it('removes a non-joining joiner next to Latin letters or at the edges', () => {
    expect(sanitizeSlackDisplayName('Ad\u200Ca')).toBe('Ada');
    expect(sanitizeSlackDisplayName('\u200Cمی\u200C')).toBe('می');
  });
});
