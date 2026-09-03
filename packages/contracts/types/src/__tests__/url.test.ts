import { describe, expect, it } from 'vitest';

import { stripTrailingSlashes } from '../url';
import { getToolDisplayLabel } from '../tool-display';

describe('stripTrailingSlashes', () => {
  it('matches what the nine hand-rolled regexes did', () => {
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
    const pathological = `${'/'.repeat(100_000)}x${'/'.repeat(100_000)}`;
    expect(stripTrailingSlashes(pathological)).toBe(`${'/'.repeat(100_000)}x`);
  });
});

describe('getToolDisplayLabel, mcp name parsing parity', () => {
  const LEGACY = /^mcp__([a-z0-9_-]+)__(.+)$/i;

  it.each([
    'mcp__github__create_issue',
    'mcp__my-server__do_thing',
    'MCP__Upper__Tool_Name',
    'mcp__server__a',
    'mcp__server',
    'mcp__',
    'not_an_mcp_tool',
    'read_file',
  ])('agrees with the expression it replaced: %s', (name) => {
    const legacySource = LEGACY.exec(name)?.[2] ?? name;
    const expected = legacySource
      .replace(/^(mcp__|tool_|action_)/i, '')
      .replace(/[_-]+/g, ' ')
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
    const actual = getToolDisplayLabel(name).displayName;
    expect(actual).toBe(expected || 'Working');
  });

  it('answers immediately on the input that made the old expression quadratic', () => {
    const pathological = `mcp__${'a_'.repeat(50_000)}`;
    expect(() => getToolDisplayLabel(pathological)).not.toThrow();
  });
});
