import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { isExempt, namingViolations, stemOf } from './check-file-naming.mjs';

const guard = fileURLToPath(new URL('./check-file-naming.mjs', import.meta.url));

test('the stem is the part before the first dot', () => {
  assert.equal(stemOf('apps/web/components/Foo.test.tsx'), 'Foo');
  assert.equal(stemOf('Foo.tsx'), 'Foo');
});

test('PascalCase components and their companions pass', () => {
  assert.deepEqual(
    namingViolations([
      'apps/web/components/ChatInput.tsx',
      'apps/web/components/ChatInput.test.tsx',
      'apps/web/components/AGIChat2.tsx',
    ]),
    [],
  );
});

test('kebab-case, camelCase and snake_case stems fail', () => {
  assert.deepEqual(
    namingViolations([
      'a/about-service-status.test.tsx',
      'a/createIcon.tsx',
      'a/chat_input.tsx',
      'a/Foo-bar.tsx',
    ]),
    ['a/Foo-bar.tsx', 'a/about-service-status.test.tsx', 'a/chat_input.tsx', 'a/createIcon.tsx'],
  );
});

test('only .tsx files are checked', () => {
  assert.deepEqual(namingViolations(['a/camelCase.ts', 'a/kebab-case.md', 'a/snake_case.rs']), []);
});

test('hooks keep use plus PascalCase, other use-prefixed stems fail', () => {
  assert.deepEqual(namingViolations(['a/useStepUp.tsx', 'a/useCopyAction.test.tsx']), []);
  assert.deepEqual(namingViolations(['a/use-step-up.tsx', 'a/user.tsx', 'a/usestepup.tsx']), [
    'a/use-step-up.tsx',
    'a/user.tsx',
    'a/usestepup.tsx',
  ]);
});

test('framework special files and their tests are exempt', () => {
  const stems = [
    'index',
    'page',
    'layout',
    'route',
    'loading',
    'error',
    'not-found',
    'template',
    'default',
    'global-error',
    'opengraph-image',
    'twitter-image',
    'icon',
    'apple-icon',
    'sitemap',
    'robots',
    'manifest',
    '_layout',
    '+html',
    '+not-found',
  ];
  for (const stem of stems) {
    assert.equal(isExempt(`apps/web/x/${stem}.tsx`), true, stem);
    assert.equal(isExempt(`apps/web/x/${stem}.test.tsx`), true, `${stem}.test`);
  }
});

test('exempt locations are skipped whatever the file is called', () => {
  assert.equal(isExempt('apps/mobile/app/settings/profile-details.tsx'), true);
  assert.equal(isExempt('apps/web/app/(app)/chat-view.tsx'), true);
  assert.equal(isExempt('apps/web/app/c/[id]/chat-view.tsx'), true);
  assert.equal(isExempt('audit/evidence/some-screen.tsx'), true);
  assert.equal(isExempt('.agents/skills/design/example-card.tsx'), true);
  assert.equal(isExempt('apps/web/__fixtures__/sample-card.tsx'), true);
  assert.equal(isExempt('apps/mobile/src/components/sample-card.tsx'), false);
});

test('the command exits non-zero on a tracked kebab-case .tsx file and zero once renamed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-naming-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    fs.mkdirSync(path.join(dir, 'scripts'));
    fs.copyFileSync(guard, path.join(dir, 'scripts', 'check-file-naming.mjs'));
    fs.writeFileSync(path.join(dir, 'about-us.tsx'), 'export {};\n');
    const failing = spawnSync('node', ['scripts/check-file-naming.mjs'], {
      cwd: dir,
      encoding: 'utf8',
    });
    assert.equal(failing.status, 1);
    assert.match(failing.stderr, /about-us\.tsx/);
    fs.renameSync(path.join(dir, 'about-us.tsx'), path.join(dir, 'AboutUs.tsx'));
    const passing = spawnSync('node', ['scripts/check-file-naming.mjs'], {
      cwd: dir,
      encoding: 'utf8',
    });
    assert.equal(passing.status, 0, passing.stderr);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
