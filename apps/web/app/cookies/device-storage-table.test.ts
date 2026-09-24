import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = resolve(__dirname, '../..');
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'build',
  'out',
  'coverage',
  'e2e',
  'test-results',
  'public',
]);

// Keys the table names outright. The cell is a comma-separated list where one
// row covers several keys of the same kind.
function declaredKeys(): Set<string> {
  const page = readFileSync(join(webRoot, 'app/cookies/page.tsx'), 'utf8');
  const table = page.slice(page.indexOf('const STORAGE'), page.indexOf('function cookieRows'));
  const keys = new Set<string>();
  for (const match of table.matchAll(/^\s{4}key: '([^']+)',$/gm)) {
    const cell = match[1];
    if (!cell) continue;
    for (const key of cell.split(',')) keys.add(key.trim());
  }
  return keys;
}

function sourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue;
      if (/\.test\.tsx?$/.test(entry) || full.includes('__tests__') || full.includes('__mocks__')) {
        continue;
      }
      files.push(full);
    }
  };
  walk(webRoot);
  return files;
}

/** Every `const NAME = 'literal'` in the app, so a key held in one module and
 * written in another still resolves to the string the browser sees. */
function constantValues(files: readonly string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(
      /\b(?:const|readonly)\s+([A-Za-z_$][\w$]*)\s*(?::\s*string\s*)?=\s*'([^'\n]+)'/g,
    )) {
      const [, name, value] = match;
      if (name && value !== undefined) values.set(name, value);
    }
  }
  return values;
}

function writtenKeys(
  files: readonly string[],
  values: ReadonlyMap<string, string>,
): { key: string; file: string }[] {
  const written: { key: string; file: string }[] = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(
      /(?:localStorage|sessionStorage)\s*\.setItem\(\s*([^,\n]+?)\s*,/g,
    )) {
      const argument = match[1];
      if (!argument) continue;
      const literal = /^'([^']+)'$/.exec(argument)?.[1];
      const key = literal ?? values.get(argument);
      if (key) written.push({ key, file: file.slice(webRoot.length + 1) });
    }
  }
  return written;
}

const PREFIXED = /^(agi|agiworkforce)[-_.:]/;

describe('the device-storage table on /cookies', () => {
  const files = sourceFiles();
  const values = constantValues(files);
  const written = writtenKeys(files, values);

  it('finds the keys the app actually writes, rather than proving nothing', () => {
    expect(written.length).toBeGreaterThan(10);
    expect(written.map((entry) => entry.key)).toContain('cookie-consent');
  });

  // The last row of the table accounts for the remainder by the prefix they
  // share, so a key is covered either by name or by that prefix. A key with
  // neither is one the page does not disclose.
  it('names, or covers by prefix, every key the app writes', () => {
    const declared = declaredKeys();
    const undisclosed = written
      .filter((entry) => !declared.has(entry.key) && !PREFIXED.test(entry.key))
      .map((entry) => `${entry.key} (${entry.file})`);

    expect([...new Set(undisclosed)].sort()).toEqual([]);
  });

  it('keeps the prefix claim true, so the sign-out sweep can find them all', () => {
    const declared = declaredKeys();
    for (const entry of written) {
      expect(
        declared.has(entry.key) || PREFIXED.test(entry.key),
        `${entry.key} written by ${entry.file}`,
      ).toBe(true);
    }
  });
});
