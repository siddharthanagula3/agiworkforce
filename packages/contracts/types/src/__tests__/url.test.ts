import { describe, expect, it } from 'vitest';

import { stripTrailingSlashes } from '../url';

describe('stripTrailingSlashes', () => {
  it('matches what the nine hand-rolled regexes did', () => {
    // Behavioural parity is the whole point: nine call sites changed, and none
    // of them may change meaning.
    const cases: Array<[string, string]> = [
      ['https://api.example.com/', 'https://api.example.com'],
      ['https://api.example.com///', 'https://api.example.com'],
      ['https://api.example.com', 'https://api.example.com'],
      ['https://api.example.com/v1/', 'https://api.example.com/v1'],
      ['', ''],
      ['/', ''],
      ['///', ''],
      ['  https://x.test/  ', '  https://x.test/  '], // no trim; callers trim
    ];
    for (const [input, expected] of cases) {
      expect(stripTrailingSlashes(input), input).toBe(expected);
    }
  });

  it('does not touch slashes that are not trailing', () => {
    expect(stripTrailingSlashes('https://a//b//c')).toBe('https://a//b//c');
  });

  it('returns the original reference when there is nothing to strip', () => {
    const input = 'https://api.example.com';
    expect(stripTrailingSlashes(input)).toBe(input);
  });

  it('stays linear on the input that made the regex quadratic', () => {
    // `/\/+$/` backtracks quadratically on a long run of slashes that never
    // reaches an anchor. 100k characters through the old expression is
    // measured in seconds; a single backward scan is immediate. The assertion
    // is on correctness and completion — a wall-clock threshold would be a
    // flaky test on shared CI runners.
    const pathological = `${'/'.repeat(100_000)}x${'/'.repeat(100_000)}`;
    expect(stripTrailingSlashes(pathological)).toBe(`${'/'.repeat(100_000)}x`);
  });
});
