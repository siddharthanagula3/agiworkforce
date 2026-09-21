import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  APPEARANCE_PATH,
  REPO_ROOT,
  THEME_SCRIPT_PATH,
  TOKEN_SHEETS,
  appearanceAttributes,
  checkUiThemeTokens,
  findDarkOnlyTokens,
  findUndefinedReferences,
  readThemeBlocks,
  themeSystemFailures,
} from './check-ui-theme-tokens.mjs';

const roots = [];
const COPIED = [...TOKEN_SHEETS, APPEARANCE_PATH, THEME_SCRIPT_PATH];

function fixture(edits = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'agi-ui-theme-tokens-'));
  roots.push(root);
  for (const relative of COPIED) {
    mkdirSync(path.join(root, path.dirname(relative)), { recursive: true });
    const original = readFileSync(path.join(REPO_ROOT, relative), 'utf8');
    writeFileSync(
      path.join(root, relative),
      edits[relative] ? edits[relative](original) : original,
    );
  }
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('theme blocks are read from the selectors, light and dark apart', () => {
  const { light, dark } = readThemeBlocks(
    ':root { --a: #fff; --b: 1px; .nested { --c: red; } }\n.dark { --a: #000; }\n',
  );
  assert.deepEqual([...light.keys()], ['--a', '--b']);
  assert.deepEqual([...dark.keys()], ['--a']);
});

test('every token the dark theme redefines has a light value', () => {
  assert.deepEqual(findDarkOnlyTokens(REPO_ROOT), []);
});

test('a token the dark block alone defines is reported', () => {
  const root = fixture({
    [TOKEN_SHEETS[0]]: (source) =>
      source.replace(/\n(\s*)\.dark \{/, '\n$1.dark {\n$1  --night-only: #123456;'),
  });
  const found = findDarkOnlyTokens(root);
  assert.equal(found.length, 1);
  assert.match(found[0].key, /--night-only$/);
});

test('a var() with no fallback and no definition is reported, a fallback clears it', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'agi-ui-theme-refs-'));
  roots.push(root);
  mkdirSync(path.join(root, 'apps/web/app'), { recursive: true });
  const file = 'apps/web/app/a.css';
  writeFileSync(path.join(root, file), '.x { color: var(--nowhere); }\n');
  assert.equal(findUndefinedReferences(root, [file]).length, 1);

  writeFileSync(path.join(root, file), '.x { color: var(--nowhere, red); }\n');
  assert.deepEqual(findUndefinedReferences(root, [file]), []);
});

test('the appearance attributes are enumerated from the component that stamps them', () => {
  const attributes = appearanceAttributes(
    readFileSync(path.join(REPO_ROOT, APPEARANCE_PATH), 'utf8'),
  );
  assert.ok(attributes.includes('data-contrast'));
  assert.ok(attributes.includes('data-motion'));
  assert.ok(attributes.length >= 5);
});

test('the theme system holds today', () => {
  assert.deepEqual(themeSystemFailures(REPO_ROOT), []);
});

test('a preference the settings control stamps that no rule reads is reported', () => {
  const root = fixture({
    [APPEARANCE_PATH]: (source) =>
      source.replace(
        "root.removeAttribute('data-motion')",
        "root.setAttribute('data-calm', 'on'); root.removeAttribute('data-motion')",
      ),
  });
  assert.ok(themeSystemFailures(root).some((line) => line.includes('[data-calm')));
});

test('a pre-paint script that cannot resolve the system preference is reported', () => {
  const root = fixture({
    [THEME_SCRIPT_PATH]: (source) => source.replace(/prefers-color-scheme/g, 'color-gamut'),
  });
  assert.ok(themeSystemFailures(root).some((line) => line.includes('flashes')));
});

test('a pre-paint script that leaves data-theme unset is reported', () => {
  const root = fixture({
    [THEME_SCRIPT_PATH]: (source) => source.replace(/data-theme/g, 'data-colour'),
  });
  assert.ok(themeSystemFailures(root).some((line) => line.includes('data-theme')));
});

test('every custom property the shell reads without a fallback resolves', () => {
  const { found } = checkUiThemeTokens(REPO_ROOT);
  const baseline = JSON.parse(
    readFileSync(path.join(REPO_ROOT, 'scripts/config/ui-theme-tokens-baseline.json'), 'utf8'),
  );
  const known = new Set(baseline.entries.map((entry) => entry.key));
  assert.deepEqual(
    found.filter((item) => !known.has(item.key)),
    [],
  );
  assert.ok(baseline.entries.every((entry) => entry.reason.length > 0));
});
