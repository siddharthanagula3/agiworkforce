import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  BLANKET_PROPERTIES,
  GLOBALS_PATH,
  REPO_ROOT,
  blanketCoverage,
  checkUiMotion,
  findOverridingDeclarations,
  findUnreferencedKeyframes,
} from './check-ui-motion.mjs';

const roots = [];

function fixture(edit) {
  const root = mkdtempSync(path.join(tmpdir(), 'agi-ui-motion-'));
  roots.push(root);
  for (const dir of ['apps/web/app', 'packages/ui/design-tokens/src']) {
    mkdirSync(path.join(root, dir), { recursive: true });
  }
  const globals = readFileSync(path.join(REPO_ROOT, GLOBALS_PATH), 'utf8');
  writeFileSync(path.join(root, GLOBALS_PATH), edit ? edit(globals) : globals);
  cpSync(
    path.join(REPO_ROOT, 'packages/ui/design-tokens/src'),
    path.join(root, 'packages/ui/design-tokens/src'),
    { recursive: true },
  );
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('the repository satisfies both blanket reduced-motion rules', () => {
  assert.deepEqual(checkUiMotion(REPO_ROOT).failures, []);
});

test('dropping a property from the OS blanket rule fails', () => {
  for (const property of BLANKET_PROPERTIES) {
    const root = fixture((source) =>
      source.replace(
        new RegExp(`^(\\s*)${property}:.*!important;$`, 'm'),
        `$1/* ${property} removed */`,
      ),
    );
    const { failures } = checkUiMotion(root);
    assert.ok(
      failures.some((line) => line.includes(property)),
      `removing ${property} was not reported`,
    );
  }
});

test('an animation that only answers the OS preference leaves the in-app control unanswered', () => {
  const coverage = blanketCoverage(`
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    }
  `);
  assert.equal(coverage.os.size, 4);
  assert.equal(coverage.inApp.size, 0);
});

test('an !important motion declaration outside a reduced-motion answer is reported', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'agi-ui-motion-important-'));
  roots.push(root);
  mkdirSync(path.join(root, 'apps/web/app'), { recursive: true });
  writeFileSync(
    path.join(root, 'apps/web/app/x.css'),
    '.banner { animation: spin 1s linear infinite !important; }\n',
  );
  const found = findOverridingDeclarations(root, ['apps/web/app/x.css']);
  assert.equal(found.length, 1);
  assert.match(found[0].key, /apps\/web\/app\/x\.css:1:animation$/);
});

test('the same declaration inside the reduced-motion answer is not reported', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'agi-ui-motion-answer-'));
  roots.push(root);
  mkdirSync(path.join(root, 'apps/web/app'), { recursive: true });
  writeFileSync(
    path.join(root, 'apps/web/app/x.css'),
    '@media (prefers-reduced-motion: reduce) { .banner { animation: none !important; } }\n',
  );
  assert.deepEqual(findOverridingDeclarations(root, ['apps/web/app/x.css']), []);
});

test('a keyframe nothing plays is reported, and playing it clears the report', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'agi-ui-motion-keyframes-'));
  roots.push(root);
  mkdirSync(path.join(root, 'apps/web/app'), { recursive: true });
  const sheet = 'apps/web/app/x.css';
  writeFileSync(path.join(root, sheet), '@keyframes drift { to { opacity: 1; } }\n');
  assert.equal(findUnreferencedKeyframes(root, [sheet], []).length, 1);

  const consumer = 'apps/web/app/x.tsx';
  writeFileSync(path.join(root, consumer), "const s = { animation: 'drift 1s linear' };\n");
  assert.deepEqual(findUnreferencedKeyframes(root, [sheet], [consumer]), []);
});
