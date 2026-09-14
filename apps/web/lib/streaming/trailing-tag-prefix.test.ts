import { describe, expect, it } from 'vitest';
import { longestTrailingTagPrefix } from './trailing-tag-prefix';

const TAG = '<thinking>';

describe('longestTrailingTagPrefix', () => {
  it('holds nothing back when the text cannot be the start of the tag', () => {
    expect(longestTrailingTagPrefix('Hi there!', TAG)).toBe(0);
    expect(longestTrailingTagPrefix('', TAG)).toBe(0);
  });

  it('holds back exactly the suffix that could still become the tag', () => {
    expect(longestTrailingTagPrefix('Sure, <', TAG)).toBe(1);
    expect(longestTrailingTagPrefix('Sure, <thin', TAG)).toBe(5);
    expect(longestTrailingTagPrefix('a < b', TAG)).toBe(0);
  });

  it('never holds back a complete tag', () => {
    expect(longestTrailingTagPrefix('<thinking>', TAG)).toBe(0);
    expect(longestTrailingTagPrefix('</thinking>', '</thinking>')).toBe(0);
  });
});
