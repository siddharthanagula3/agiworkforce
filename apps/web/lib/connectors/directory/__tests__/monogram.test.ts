import { describe, expect, it } from 'vitest';

import { deriveMonogram, deriveMonogramHue } from '@/lib/connectors/directory/monogram';

describe('deriveMonogram', () => {
  it('takes the first letter of a single-word name', () => {
    expect(deriveMonogram('Notion')).toBe('N');
  });

  it('takes the first letter of the first two words of a multi-word name', () => {
    expect(deriveMonogram('Some Tool')).toBe('ST');
  });

  it('ignores extra words past the first two', () => {
    expect(deriveMonogram('Some Other Tool Entirely')).toBe('SO');
  });

  it('skips leading punctuation and currency marks', () => {
    expect(deriveMonogram('(beta) Tool')).toBe('BT');
    expect(deriveMonogram('$THREE Token')).toBe('TT');
  });

  it('works on non-latin scripts', () => {
    expect(deriveMonogram('나라장터 사전규격')).toBe('나사');
  });

  it('falls back for an empty or whitespace-only name', () => {
    expect(deriveMonogram('')).toBe('?');
    expect(deriveMonogram('   ')).toBe('?');
  });

  it('uppercases the letters it takes', () => {
    expect(deriveMonogram('inference.sh')).toBe('I');
  });
});

describe('deriveMonogramHue', () => {
  it('maps the primary category onto its hue', () => {
    expect(deriveMonogramHue(['Code'])).toBe('code');
    expect(deriveMonogramHue(['Financial services', 'Code'])).toBe('financial-services');
    expect(deriveMonogramHue(['Sales and marketing'])).toBe('sales-and-marketing');
  });

  it('skips categories it does not know and falls back to other', () => {
    expect(deriveMonogramHue(['Nope', 'Design'])).toBe('design');
    expect(deriveMonogramHue([])).toBe('other');
    expect(deriveMonogramHue(['Other'])).toBe('other');
  });
});
