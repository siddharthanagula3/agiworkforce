import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SPEC_PATH = join(__dirname, '..', 'wdio', 'specs', 'sidebar-navigation.spec.ts');

const source = readFileSync(SPEC_PATH, 'utf8');

function testBodies(): { title: string; body: string }[] {
  const opener = /^ {2}it\(\s*(['"])([\s\S]*?)\1\s*,/gm;
  const starts: { title: string; index: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = opener.exec(source)) !== null) {
    starts.push({ title: match[2] as string, index: match.index });
  }
  return starts.map((start, i) => ({
    title: start.title,
    body: source.slice(start.index, starts[i + 1]?.index ?? source.length),
  }));
}

describe('DESK-27 sidebar wdio spec', () => {
  it('parses into the tests it declares', () => {
    expect(testBodies().length).toBeGreaterThanOrEqual(8);
  });

  it('never reports an observation through console.log alone', () => {
    const logging = testBodies().filter((t) => t.body.includes('console.log'));
    expect(logging.map((t) => t.title)).toEqual([]);
  });

  it('asserts in every test instead of only capturing state', () => {
    const silent = testBodies().filter((t) => !t.body.includes('expect('));
    expect(silent.map((t) => t.title)).toEqual([]);
  });
});
