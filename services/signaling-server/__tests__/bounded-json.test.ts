import { describe, expect, it } from 'vitest';
import { boundedJsonLength, exceedsJsonDepth, withinJsonBounds } from '../src/bounded-json.js';

const NO_LIMIT = Number.POSITIVE_INFINITY;

function nestedArrays(depth: number): unknown {
  return JSON.parse(`${'['.repeat(depth)}${']'.repeat(depth)}`);
}

describe('bounded JSON measurement', () => {
  it.each([
    null,
    true,
    0,
    -1.5e21,
    'plain',
    'quote " and \\ and \n and \u0001 and é and 😀',
    [],
    {},
    [1, 'a', null, [true, {}], { k: [] }],
    { 'key with "quotes"': { a: [1, 2, 3], b: 'x'.repeat(500) }, '': null },
    { action: 'heartbeat', data: { n: 1, nested: { deeper: ['a', { b: 'c' }] } } },
  ])('reports the exact serialized length of %j', (value) => {
    expect(boundedJsonLength(value, NO_LIMIT, 32)).toBe(JSON.stringify(value).length);
  });

  it('measures a 32,000-deep array without throwing where stringify does', () => {
    const deep = nestedArrays(32_000);
    expect(() => JSON.stringify(deep)).toThrow(RangeError);
    expect(() => boundedJsonLength(deep, 4096, 32)).not.toThrow();
    expect(boundedJsonLength(deep, 4096, 32)).toBeNull();
    expect(exceedsJsonDepth(deep, 32)).toBe(true);
  });

  it('accepts nesting up to the cap and refuses one level more', () => {
    expect(exceedsJsonDepth(nestedArrays(32), 32)).toBe(false);
    expect(exceedsJsonDepth(nestedArrays(33), 32)).toBe(true);
    expect(exceedsJsonDepth({ a: { b: { c: 1 } } }, 3)).toBe(false);
    expect(exceedsJsonDepth({ a: { b: { c: {} } } }, 3)).toBe(true);
  });

  it('refuses a value one character over the size limit', () => {
    const value = { pad: 'x'.repeat(100) };
    const size = JSON.stringify(value).length;
    expect(withinJsonBounds(value, size, 32)).toBe(true);
    expect(withinJsonBounds(value, size - 1, 32)).toBe(false);
  });

  it('refuses values JSON cannot carry', () => {
    expect(withinJsonBounds({ n: 10n }, NO_LIMIT, 32)).toBe(false);
    expect(withinJsonBounds({ f: () => 1 }, NO_LIMIT, 32)).toBe(false);
    expect(withinJsonBounds({ u: undefined }, NO_LIMIT, 32)).toBe(false);
    expect(withinJsonBounds(Symbol('s'), NO_LIMIT, 32)).toBe(false);
  });
});
