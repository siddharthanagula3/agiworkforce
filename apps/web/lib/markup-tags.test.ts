import { describe, expect, it } from 'vitest';

import { markupTagRanges, replaceMarkupTags, stripMarkupTags } from '@/lib/markup-tags';

const HOSTILE_BUDGET_MS = 2000;
const HOSTILE_TEST_TIMEOUT_MS = 30_000;

describe('stripMarkupTags', () => {
  it.each([
    ['<p>Does <b>things</b> well.</p>', 'Does things well.'],
    ['Use List<> in Java', 'Use List<> in Java'],
    ['a <> <i>b</i> <>', 'a <> b <>'],
    ['a < b', 'a < b'],
    ['1 <', '1 <'],
    ['x <a href="y">link</a> and a < b', 'x link and a < b'],
    ['<<b>bold>', 'bold>'],
    ['line\n<br\n/>break', 'line\nbreak'],
  ])('strips the tags in %j', (input, expected) => {
    expect(stripMarkupTags(input)).toBe(expected);
  });

  it(
    'strips in linear time when no opener ever closes',
    () => {
      const input = '<a'.repeat(200_000);
      const started = performance.now();
      expect(stripMarkupTags(input)).toBe(input);
      expect(performance.now() - started).toBeLessThan(HOSTILE_BUDGET_MS);
    },
    HOSTILE_TEST_TIMEOUT_MS,
  );
});

describe('markupTagRanges', () => {
  it('ends each tag at the first greater-than sign after its opener', () => {
    const html = '<link rel="icon"><p><LINK href="x">';
    expect(markupTagRanges(html, /<link\b/giu)).toEqual([
      { start: 0, end: 17 },
      { start: 20, end: 35 },
    ]);
  });

  it('skips openers that sit inside a tag already found', () => {
    expect(markupTagRanges('<meta <meta x>y', /<meta/gi)).toEqual([{ start: 0, end: 14 }]);
  });

  it('replaces each tag with the replacement', () => {
    expect(replaceMarkupTags('a<b>c</b>d', /<\/?[a-z]/g, ' ')).toBe('a c d');
  });
});
