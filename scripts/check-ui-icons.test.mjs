import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ICON_SOURCES,
  REPO_ROOT,
  checkUiIcons,
  findEmojiIcons,
  findForeignIconSources,
  findUnnamedIconControls,
  iconImports,
} from './check-ui-icons.mjs';

const roots = [];

function fixture(body, name = 'a.tsx') {
  const root = mkdtempSync(path.join(tmpdir(), 'agi-ui-icons-'));
  roots.push(root);
  mkdirSync(path.join(root, 'apps/web/shared'), { recursive: true });
  writeFileSync(path.join(root, 'apps/web/shared', name), body);
  return { root, file: `apps/web/shared/${name}` };
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('the icon vocabulary is read from the imports', () => {
  const icons = iconImports(
    `import { Search, X as Close } from 'lucide-react';\nimport { useState } from 'react';\n`,
  );
  assert.deepEqual([...icons.keys()], ['Search', 'Close']);
});

test('a second icon library is reported', () => {
  const { root, file } = fixture(`import { FiSearch } from 'react-icons/fi';\n`);
  const found = findForeignIconSources(root, [file]);
  assert.equal(found.length, 1);
  assert.match(found[0].key, /react-icons\/fi$/);
});

test('the two declared sources are not reported', () => {
  const { root, file } = fixture(
    ICON_SOURCES.map((source) => `import { Search } from '${source}';`).join('\n'),
  );
  assert.deepEqual(findForeignIconSources(root, [file]), []);
});

test('an icon-only control with no accessible name is reported', () => {
  const { root, file } = fixture(
    `import { X } from 'lucide-react';\nexport const C = () => (<button onClick={close}><X /></button>);\n`,
  );
  const found = findUnnamedIconControls(root, [file]);
  assert.equal(found.length, 1);
  assert.match(found[0].key, /:2:button$/);
});

test('the same control with a label is not reported', () => {
  const { root, file } = fixture(
    `import { X } from 'lucide-react';\nexport const C = () => (<button aria-label="Close" onClick={close}><X /></button>);\n`,
  );
  assert.deepEqual(findUnnamedIconControls(root, [file]), []);
});

test('an icon beside its own text is not reported', () => {
  const { root, file } = fixture(
    `import { X } from 'lucide-react';\nexport const C = () => (<button onClick={close}><X />Close</button>);\n`,
  );
  assert.deepEqual(findUnnamedIconControls(root, [file]), []);
});

test('an emoji standing in for an icon is reported', () => {
  const { root, file } = fixture(`const CATEGORIES = [{ id: 'apps', icon: '\u{1F310}' }];\n`);
  assert.equal(findEmojiIcons(root, [file]).length, 1);
});

test('a glyph its own element hides from assistive technology is not reported', () => {
  const { root, file } = fixture(
    `export const C = () => (\n  <span aria-hidden>\n    ✓\n  </span>\n);\n`,
  );
  assert.deepEqual(findEmojiIcons(root, [file]), []);
});

test('the repository draws from one icon vocabulary and names every icon-only control', () => {
  const { found } = checkUiIcons(REPO_ROOT);
  assert.deepEqual(
    found.filter((item) => item.advice.includes('icon vocabulary')),
    [],
  );
  assert.deepEqual(
    found.filter((item) => item.advice.includes('drawn only as an icon')),
    [],
  );
});
