import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import {
  MARKETING_EMAIL_ATTEMPT_STORAGE_KEY,
  MARKETING_EMAIL_CHOICE_STORAGE_KEY,
  TERMS_GATE_STORAGE_KEY,
} from '@/app/signup/signupAttemptMarkers';

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

type StorageArea = 'Local storage' | 'Session storage';

const STORE_OF_API: Readonly<Record<string, StorageArea>> = {
  localStorage: 'Local storage',
  sessionStorage: 'Session storage',
};

// Keys the table names outright, with the store each row says they live in.
// The key cell is a comma-separated list where one row covers several keys of
// the same kind.
function declaredStores(): Map<string, string> {
  const page = readFileSync(join(webRoot, 'app/cookies/page.tsx'), 'utf8');
  const table = page.slice(page.indexOf('const STORAGE'), page.indexOf('function cookieRows'));
  const stores = new Map<string, string>();
  for (const match of table.matchAll(/^\s{4}key: '([^']+)',\n\s{4}store: '([^']+)',$/gm)) {
    const [, cell, store] = match;
    if (!cell || !store) continue;
    for (const key of cell.split(',')) stores.set(key.trim(), store);
  }
  return stores;
}

function declaredKeys(): Set<string> {
  return new Set(declaredStores().keys());
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

/** Every module-level `const NAME = 'literal'` in the app, so a key held in one
 * module and written in another still resolves to the string the browser sees.
 * Class members and indented locals are skipped: a field such as an error's
 * `name` would otherwise shadow a storage-adapter parameter of the same name. */
function constantValues(files: readonly string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(
      /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::\s*string\s*)?=\s*'([^'\n]+)'/gm,
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
): { key: string; file: string; store: StorageArea }[] {
  const written: { key: string; file: string; store: StorageArea }[] = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(
      /(localStorage|sessionStorage)\s*\.setItem\(\s*([^,\n]+?)\s*,/g,
    )) {
      const [, api, argument] = match;
      const store = api ? STORE_OF_API[api] : undefined;
      if (!argument || !store) continue;
      const literal = /^'([^']+)'$/.exec(argument)?.[1];
      const key = literal ?? values.get(argument);
      if (key) written.push({ key, file: file.slice(webRoot.length + 1), store });
    }
  }
  return written;
}

const PREFIXED = /^(agi|agiworkforce)[-_.:]/;

function storageEntries(): Map<string, string>[] {
  const source = readFileSync(join(webRoot, 'app/cookies/page.tsx'), 'utf8');
  const parsed = ts.createSourceFile(
    'page.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const declarations = parsed.statements.flatMap((statement) =>
    ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : [],
  );
  const table = declarations.find((declaration) => declaration.name.getText(parsed) === 'STORAGE');
  if (!table?.initializer || !ts.isArrayLiteralExpression(table.initializer)) {
    throw new Error('The rendered device-storage table is unavailable');
  }
  expect(source).toContain('rows={storageRows(STORAGE)}');
  return table.initializer.elements.map((row) => {
    if (!ts.isObjectLiteralExpression(row)) throw new Error('Unmeasured storage row');
    return new Map(
      row.properties.map((property) => {
        if (!ts.isPropertyAssignment(property)) throw new Error('Unmeasured storage field');
        return [property.name.getText(parsed), property.initializer.getText(parsed)] as const;
      }),
    );
  });
}

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

  it('names the store a named key is actually written to', () => {
    const declared = declaredStores();
    const misfiled = written
      .filter((entry) => declared.has(entry.key) && declared.get(entry.key) !== entry.store)
      .map(
        (entry) =>
          `${entry.key}: table says ${declared.get(entry.key)}, ${entry.file} writes ${entry.store}`,
      );

    expect([...new Set(misfiled)].sort()).toEqual([]);
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

  it('discloses the canonical signup markers in local storage instead of treating tab closure as cleanup', () => {
    const entries = storageEntries();
    const local = entries.filter(
      (entry) =>
        entry.get('key')?.includes('TERMS_GATE_STORAGE_KEY') ||
        entry.get('key') === `'${TERMS_GATE_STORAGE_KEY}'`,
    );
    expect(local).toHaveLength(1);
    expect(local[0]?.get('store')).toBe("'Local storage'");
    expect(local[0]?.get('key')).toContain('MARKETING_EMAIL_CHOICE_STORAGE_KEY');
    expect(local[0]?.get('key')).toContain('MARKETING_EMAIL_ATTEMPT_STORAGE_KEY');
    expect(local[0]?.get('clearedBy')).not.toMatch(/closing the tab/i);

    const markers = readFileSync(join(webRoot, 'app/signup/signupAttemptMarkers.ts'), 'utf8');
    for (const name of [
      'TERMS_GATE_STORAGE_KEY',
      'MARKETING_EMAIL_CHOICE_STORAGE_KEY',
      'MARKETING_EMAIL_ATTEMPT_STORAGE_KEY',
    ]) {
      expect(markers).toContain(`window.localStorage.setItem(${name},`);
    }
    for (const key of [
      TERMS_GATE_STORAGE_KEY,
      MARKETING_EMAIL_CHOICE_STORAGE_KEY,
      MARKETING_EMAIL_ATTEMPT_STORAGE_KEY,
    ]) {
      expect(PREFIXED.test(key)).toBe(true);
    }
  });

  it('separately discloses the canonical per-tab marketing attempt identifier', () => {
    const entries = storageEntries();
    const session = entries.filter(
      (entry) => entry.get('key') === 'MARKETING_EMAIL_ATTEMPT_STORAGE_KEY',
    );
    expect(session).toHaveLength(1);
    expect(session[0]?.get('store')).toBe("'Session storage'");
    expect(session[0]?.get('holds')).toMatch(/this tab only/i);
    expect(session[0]?.get('holds')).toMatch(/another tab removed is asked again/i);
    const markers = readFileSync(join(webRoot, 'app/signup/signupAttemptMarkers.ts'), 'utf8');
    expect(markers).toContain(
      'window.sessionStorage.setItem(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY, attemptId)',
    );
  });
});
