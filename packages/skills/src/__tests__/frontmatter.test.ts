/**
 * Frontmatter parser regression tests.
 *
 * The mini-YAML parser in frontmatter.ts is hand-rolled (no `yaml` runtime
 * dep) so it needs explicit coverage for prototype-pollution avoidance and
 * the schema OpenClaw skills actually use.
 */

import { describe, expect, it } from 'vitest';

import { parseFrontmatter } from '../frontmatter';

describe('parseFrontmatter — basic shape', () => {
  it('parses string scalars', () => {
    const { data, body } = parseFrontmatter(
      ['---', 'name: diffs', 'description: Use the diffs tool.', '---', '', 'body text'].join('\n'),
    );
    expect(data['name']).toBe('diffs');
    expect(data['description']).toBe('Use the diffs tool.');
    expect(body).toBe('body text');
  });

  it('parses booleans, ints, floats, null', () => {
    const { data } = parseFrontmatter(
      ['---', 'always: true', 'count: 12', 'ratio: 0.5', 'note: null', '---'].join('\n'),
    );
    expect(data['always']).toBe(true);
    expect(data['count']).toBe(12);
    expect(data['ratio']).toBe(0.5);
    expect(data['note']).toBeNull();
  });

  it('parses inline arrays', () => {
    const { data } = parseFrontmatter(['---', "os: ['darwin', 'linux']", '---'].join('\n'));
    expect(data['os']).toEqual(['darwin', 'linux']);
  });

  it('parses block list arrays', () => {
    const { data } = parseFrontmatter(['---', 'os:', '  - darwin', '  - linux', '---'].join('\n'));
    expect(data['os']).toEqual(['darwin', 'linux']);
  });

  it('parses nested objects (one level deep — matches `requires:`)', () => {
    const { data } = parseFrontmatter(
      ['---', 'requires:', '  bins:', '    - git', '    - rg', '---'].join('\n'),
    );
    expect((data['requires'] as Record<string, unknown>)?.['bins']).toEqual(['git', 'rg']);
  });

  it('preserves the body verbatim after the closing fence', () => {
    const md = ['---', 'name: x', '---', '', '# Heading', '', 'body line.'].join('\n');
    const { body } = parseFrontmatter(md);
    expect(body).toContain('# Heading');
    expect(body).toContain('body line.');
  });

  it('returns empty data for files without frontmatter', () => {
    const { data, body } = parseFrontmatter('no frontmatter here\nstill no');
    expect(data).toEqual({});
    expect(body).toBe('no frontmatter here\nstill no');
  });
});

describe('parseFrontmatter — security: prototype pollution avoidance', () => {
  it('does NOT pollute Object.prototype via __proto__ key', () => {
    const before = ({} as Record<string, unknown>)['polluted'];
    const { data } = parseFrontmatter(['---', '__proto__: {polluted: true}', '---'].join('\n'));
    // Whatever the parser stored under `__proto__` MUST NOT have leaked into
    // Object.prototype. The most important assertion is that
    // `({}).polluted` is still undefined after parse.
    const after = ({} as Record<string, unknown>)['polluted'];
    expect(after).toBeUndefined();
    expect(after).toBe(before);
    // We also check the parser didn't return a "polluted" entry on the
    // OWN data object's proto chain (`hasOwnProperty` to avoid the polluted
    // case false-passing).
    expect(Object.prototype.hasOwnProperty.call(data, '__proto__')).toBe(false);
  });

  it('does NOT pollute via constructor.prototype', () => {
    parseFrontmatter(['---', 'constructor: {prototype: {polluted: true}}', '---'].join('\n'));
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('does NOT honor a __proto__ list-form payload', () => {
    parseFrontmatter(['---', '__proto__:', '  - polluted', '---'].join('\n'));
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });
});

describe('parseFrontmatter — comments and blank lines', () => {
  it('ignores `#`-prefixed comment lines', () => {
    const { data } = parseFrontmatter(
      ['---', '# this is a comment', 'name: x', '# also a comment', '---'].join('\n'),
    );
    expect(data['name']).toBe('x');
    expect(Object.keys(data)).toEqual(['name']);
  });
});
