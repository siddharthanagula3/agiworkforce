import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { withoutQuotedRequestMaterial } from '../quoted-request-material';

const fixtures: { input: string; expected: string }[] = JSON.parse(
  readFileSync(new URL('./fixtures/quoted-request-material.json', import.meta.url), 'utf8'),
);

describe('quoted request material', () => {
  it.each(fixtures)('preserves shared quote semantics: $input', ({ input, expected }) => {
    expect(withoutQuotedRequestMaterial(input)).toBe(expected);
    expect(withoutQuotedRequestMaterial(input, { singleQuotes: true })).toBe(expected);
  });

  it.each([
    ["'search the web'", ''],
    ["''", "''"],
    ["don't change Alice's words", "don't change Alice's words"],
    ["a'quoted'", "a'quoted'"],
    ["'quoted'7", "'quoted'7"],
    ["_'quoted'_", '__'],
    ["𐐀'quoted'", "𐐀'quoted'"],
    ["'quoted'𝟙", "'quoted'𝟙"],
    ["a\n'quoted'", 'a\n'],
    ["'first'word 'second'", "'first'word "],
    ['"a"\'quoted\'', ''],
    ['\'outer "inner" tail\'', ''],
    ['\'unclosed "paired" tail', "'unclosed  tail"],
  ])('preserves single-quote boundaries: %s', (input, expected) => {
    expect(withoutQuotedRequestMaterial(input, { singleQuotes: true })).toBe(expected);
  });

  it('matches the previous expressions on bounded generated input', () => {
    const previous = [
      /"[^"\n]*"|“[^”\n]*”|`[^`\n]*`/gu,
      /"[^"\n]*"|“[^”\n]*”|`[^`\n]*`|(?<![\p{L}\p{N}])'[^'\n]+'(?![\p{L}\p{N}])/gu,
    ];
    const alphabet = ['"', '“', '”', '`', "'", 'a', '7', '_', ' ', '\n', '\r', '𐐀', '𝟙'];
    let state = 0x6d2b79f5;
    for (let sample = 0; sample < 12000; sample++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const length = state % 48;
      let input = '';
      for (let index = 0; index < length; index++) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        input += alphabet[state % alphabet.length];
      }
      for (const singleQuotes of [false, true]) {
        expect(
          withoutQuotedRequestMaterial(input, { singleQuotes }),
          JSON.stringify({ input, singleQuotes }),
        ).toBe(input.replace(previous[Number(singleQuotes)]!, ''));
      }
    }
  });

  it.each([
    '“'.repeat(200000),
    '“\n'.repeat(100000),
    '“\'`"word\n'.repeat(20000),
    '“'.repeat(200000) + ' "paired"',
  ])('bounds delimiter scan work by input length', (input) => {
    const indexOf = String.prototype.indexOf;
    let scanWork = 0;
    const spy = vi.spyOn(String.prototype, 'indexOf').mockImplementation(function (
      this: string,
      needle: string,
      from = 0,
    ) {
      const result = indexOf.call(this, needle, from);
      scanWork += (result < 0 ? this.length : result + needle.length) - from;
      return result;
    });
    let output: string;
    try {
      output = withoutQuotedRequestMaterial(input, { singleQuotes: true });
    } finally {
      spy.mockRestore();
    }
    expect(scanWork).toBeGreaterThanOrEqual(input.length);
    expect(scanWork).toBeLessThanOrEqual(input.length * 5);
    expect(output!.length).toBeLessThanOrEqual(input.length);
    if (input.startsWith('“'.repeat(200000)))
      expect(output!).toBe('“'.repeat(200000) + (input.endsWith('"paired"') ? ' ' : ''));
  });
});
