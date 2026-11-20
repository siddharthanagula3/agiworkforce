import { describe, expect, it } from 'vitest';
import { MAX_JSON_NESTING_DEPTH, withinJsonBounds } from '../bounded-json';

const deepArrays = (depth: number) =>
  JSON.parse(`${'['.repeat(depth)}${']'.repeat(depth)}`) as unknown;

describe('withinJsonBounds', () => {
  it('matches the serialized length of ordinary JSON at the boundary', () => {
    const value = { a: [1, 'two', null, { b: true }], 'k"q': 'x'.repeat(40) };
    const size = JSON.stringify(value).length;
    expect(withinJsonBounds(value, size, MAX_JSON_NESTING_DEPTH)).toBe(true);
    expect(withinJsonBounds(value, size - 1, MAX_JSON_NESTING_DEPTH)).toBe(false);
  });

  it('measures a 32,000-deep array without throwing where stringify does', () => {
    const deep = deepArrays(32_000);
    expect(() => JSON.stringify(deep)).toThrow(RangeError);
    expect(withinJsonBounds(deep, 4096, MAX_JSON_NESTING_DEPTH)).toBe(false);
  });

  it('accepts nesting up to the cap and refuses one level more', () => {
    expect(withinJsonBounds(deepArrays(MAX_JSON_NESTING_DEPTH), 4096, MAX_JSON_NESTING_DEPTH)).toBe(
      true,
    );
    expect(
      withinJsonBounds(deepArrays(MAX_JSON_NESTING_DEPTH + 1), 4096, MAX_JSON_NESTING_DEPTH),
    ).toBe(false);
  });

  it('refuses values JSON cannot carry', () => {
    expect(withinJsonBounds({ n: 10n }, 4096, 32)).toBe(false);
    expect(withinJsonBounds({ u: undefined }, 4096, 32)).toBe(false);
  });
});
