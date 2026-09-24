import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CHAT_TOKENS_PATH,
  FOUNDATION_TOKENS_PATH,
  GLOBALS_PATH,
  MIN_FONT_SIZE_PX,
  REPO_ROOT,
  SETTINGS_STORE_PATH,
  checkUiTypography,
  collectSizes,
  readUnion,
  readingSystemFailures,
  toPixels,
} from './check-ui-typography.mjs';

const roots = [];
const COPIED = [GLOBALS_PATH, FOUNDATION_TOKENS_PATH, CHAT_TOKENS_PATH, SETTINGS_STORE_PATH];

function fixture(edits = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'agi-ui-typography-'));
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

test('rem and em are measured against the same floor as px', () => {
  assert.equal(toPixels(0.6875, 'rem'), 11);
  assert.equal(toPixels(11, 'px'), 11);
  assert.ok(toPixels(0.6875, 'rem') < MIN_FONT_SIZE_PX);
});

test('a size written in rem is collected, which a px-only scan misses', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'agi-ui-typography-units-'));
  roots.push(root);
  mkdirSync(path.join(root, 'apps/web/shared'), { recursive: true });
  writeFileSync(path.join(root, 'apps/web/shared/a.css'), '.x { font-size: 0.68rem; }\n');
  const [size] = collectSizes(root, ['apps/web/shared/a.css']);
  assert.equal(size.px, 10.88);
});

test('the repository declares a reading measure, a distinct mono family and a complete text-size control', () => {
  assert.deepEqual(readingSystemFailures(REPO_ROOT), []);
});

test('dropping the reading measure is reported', () => {
  const root = fixture({
    [GLOBALS_PATH]: (source) =>
      source.replace(/max-width:\s*(?:\d+(?:\.\d+)?ch|var\(--measure-prose\))/g, 'max-width: 100%'),
  });
  assert.ok(readingSystemFailures(root).some((line) => line.includes('measure in ch')));
});

test('a reading-measure token must resolve to a ch value', () => {
  const root = fixture({
    [FOUNDATION_TOKENS_PATH]: (source) =>
      source.replace(/--measure-prose:\s*\d+(?:\.\d+)?ch/, '--measure-prose: 100%'),
  });
  assert.ok(readingSystemFailures(root).some((line) => line.includes('measure in ch')));
});

test('drawing code in the prose family is reported', () => {
  const root = fixture({
    [CHAT_TOKENS_PATH]: (source) =>
      source.replace(/--chat-font-mono:[\s\S]*?;/, '--chat-font-mono: var(--chat-font-sans);'),
  });
  assert.ok(readingSystemFailures(root).some((line) => line.includes('code is not distinct')));
});

test('a text size that moves prose but not code is reported', () => {
  const root = fixture({
    [GLOBALS_PATH]: (source) =>
      source.replace(
        /html\[data-chat-text-size='large'\] \.code-block-body,[\s\S]*?\}/,
        '.code-block-body-large-removed {}',
      ),
  });
  assert.ok(
    readingSystemFailures(root).some(
      (line) => line.includes('large') && line.includes('.code-block-body'),
    ),
  );
});

test('a chat font the settings control offers but nothing applies is reported', () => {
  const root = fixture({
    [SETTINGS_STORE_PATH]: (source) =>
      source.replace(
        /export type ChatFont = [^;]+;/,
        "export type ChatFont = 'default' | 'sans' | 'serif' | 'dyslexic' | 'humanist';",
      ),
  });
  assert.ok(readingSystemFailures(root).some((line) => line.includes('humanist')));
});

test('the union reader enumerates from the store rather than a list', () => {
  assert.deepEqual(
    readUnion(readFileSync(path.join(REPO_ROOT, SETTINGS_STORE_PATH), 'utf8'), 'ChatTextSize'),
    ['small', 'default', 'large'],
  );
});

test('every size the shell draws sits on the declared scale', () => {
  const { scale, found } = checkUiTypography(REPO_ROOT);
  const declared = JSON.parse(
    readFileSync(path.join(REPO_ROOT, 'scripts/config/ui-typography-baseline.json'), 'utf8'),
  ).scale;
  assert.deepEqual(
    scale.filter((step) => !declared.includes(step)),
    [],
  );
  assert.ok(found.every((item) => item.advice.includes('legibility floor')));
});
