import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  collectReachable,
  createResolver,
  isTestPath,
  listSourceFiles,
  parseSpecifiers,
  resetModuleGraphCache,
  stripComments,
} from './lib/module-graph.mjs';

function makeTree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'module-graph-'));
  for (const [relativePath, contents] of Object.entries(files)) {
    const full = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
  }
  resetModuleGraphCache();
  return root;
}

test('stripComments removes comments without eating string, template or regex literals', () => {
  const stripped = stripComments(
    [
      "// import './line-comment';",
      "/* import './block-comment'; */",
      "const keep = 'http://example.com/not-a-comment';",
      'const re = /\\/\\/still-a-regex/;',
      'const tpl = `a ${b} // not a comment inside the expression slot`;',
      "import real from './real';",
    ].join('\n'),
  );

  assert.ok(stripped.includes("'http://example.com/not-a-comment'"));
  assert.ok(stripped.includes('/\\/\\/still-a-regex/'));
  assert.ok(!stripped.includes('line-comment'));
  assert.ok(!stripped.includes('block-comment'));
  assert.ok(stripped.includes("import real from './real'"));
});

test('parseSpecifiers finds every import form and ignores commented-out ones', () => {
  const specifiers = parseSpecifiers(
    [
      "// import './commented';",
      "import a from './static';",
      "import type { T } from './types';",
      "export * from './star';",
      "export { x } from './named';",
      "import './side-effect';",
      "const lazy = () => import('./dynamic');",
      "const legacy = require('./required');",
      "new Worker(new URL('./worker', import.meta.url));",
    ].join('\n'),
  );

  assert.deepEqual([...specifiers].sort(), [
    './dynamic',
    './named',
    './required',
    './side-effect',
    './star',
    './static',
    './types',
    './worker',
  ]);
  assert.ok(!specifiers.has('./commented'));
});

test('a lexical sweep and a reachability walk disagree, and the walk is the correct one', () => {
  const root = makeTree({
    'src/main.tsx': "import './used';\n",
    'src/used.ts': "export const used = 'yes';\n",
    'src/orphan.ts': "import './only-reachable-from-orphan';\nexport const orphan = 1;\n",
    'src/only-reachable-from-orphan.ts': 'export const deep = 1;\n',
  });

  try {
    const resolve = createResolver({});
    const reachable = collectReachable([path.join(root, 'src/main.tsx')], resolve);
    const reachableRelative = new Set([...reachable].map((file) => path.relative(root, file)));

    assert.deepEqual([...reachableRelative].sort(), ['src/main.tsx', 'src/used.ts']);

    const everySourceFile = listSourceFiles(path.join(root, 'src')).map((file) =>
      path.relative(root, file),
    );
    const unreachable = everySourceFile.filter((file) => !reachableRelative.has(file)).sort();
    assert.deepEqual(unreachable, ['src/only-reachable-from-orphan.ts', 'src/orphan.ts']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('resolver honours prefix aliases, package aliases, directory indexes and .js->.ts rewrites', () => {
  const root = makeTree({
    'src/entry.ts': [
      "import '@/aliased';",
      "import '@scope/pkg';",
      "import './folder';",
      "import './nodenext.js';",
    ].join('\n'),
    'src/aliased.ts': 'export const a = 1;\n',
    'src/folder/index.tsx': 'export const b = 2;\n',
    'src/nodenext.ts': 'export const c = 3;\n',
    'pkg/src/index.ts': 'export const d = 4;\n',
  });

  try {
    const resolve = createResolver({
      '@/*': path.join(root, 'src'),
      '@scope/pkg': path.join(root, 'pkg/src'),
    });
    const reachable = collectReachable([path.join(root, 'src/entry.ts')], resolve);
    assert.deepEqual([...reachable].map((file) => path.relative(root, file)).sort(), [
      'pkg/src/index.ts',
      'src/aliased.ts',
      'src/entry.ts',
      'src/folder/index.tsx',
      'src/nodenext.ts',
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('isTestPath separates test scaffolding from product modules', () => {
  assert.equal(isTestPath('apps/web/features/chat/ChatPage.tsx'), false);
  assert.equal(isTestPath('apps/web/features/chat/__tests__/ChatPage.test.tsx'), true);
  assert.equal(isTestPath('apps/web/features/chat/ChatPage.test.tsx'), true);
  assert.equal(isTestPath('apps/desktop/src/archive/Old.tsx'), true);
  assert.equal(isTestPath('apps/mobile/e2e/flow.ts'), true);
});
