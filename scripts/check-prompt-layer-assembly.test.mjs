import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assemblesSystemMessage,
  assemblySites,
  auditAssembly,
  resolvesLayers,
  sourceFiles,
} from './lib/prompt-layer-assembly.mjs';

const RESOLVED = `
import { orderInstructionBlocks } from '@/lib/prompts/instruction-precedence';

export function build(blocks) {
  const ordered = orderInstructionBlocks(blocks);
  return [{ role: 'system', content: ordered.map((b) => b.text).join('\\n') }];
}
`;

const UNRESOLVED = `
export function build(text) {
  return [{ role: 'system', content: text }];
}
`;

const ROLE_UNION = `
export interface Message {
  role: 'system' | 'user' | 'assistant';
  body: string;
}
`;

function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-layer-assembly-'));
  for (const [rel, source] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, source);
  }
  return root;
}

test('a role union in a type declaration is not an assembly site', () => {
  assert.equal(assemblesSystemMessage(ROLE_UNION), false);
  assert.equal(assemblesSystemMessage(UNRESOLVED), true);
});

test('a system role with no content beside it is not an assembly site', () => {
  assert.equal(assemblesSystemMessage(`const role = { role: 'system' };`), false);
});

test('resolving needs both the import and a symbol from it', () => {
  assert.equal(resolvesLayers(RESOLVED), true);
  assert.equal(resolvesLayers(UNRESOLVED), false);
  assert.equal(
    resolvesLayers(`import { PROMPT_IDS } from '@agiworkforce/context';\nPROMPT_IDS;`),
    false,
  );
});

test('the sites come from the tree, tests and generated code excluded', () => {
  const root = tree({
    'apps/web/lib/a.ts': UNRESOLVED,
    'apps/web/lib/a.test.ts': UNRESOLVED,
    'apps/web/lib/__tests__/b.ts': UNRESOLVED,
    'apps/web/lib/generated/c.ts': UNRESOLVED,
    'apps/web/node_modules/d.ts': UNRESOLVED,
    'packages/one/src/e.ts': RESOLVED,
  });

  assert.deepEqual(assemblySites(root), [
    { file: 'apps/web/lib/a.ts', resolved: false },
    { file: 'packages/one/src/e.ts', resolved: true },
  ]);
  assert.deepEqual(sourceFiles(path.join(root, 'apps/web/missing')), []);
});

test('a new unresolved site fails', () => {
  const verdict = auditAssembly([{ file: 'apps/web/lib/new.ts', resolved: false }], {
    unresolved: {},
  });

  assert.equal(verdict.passed, false);
  assert.match(verdict.problems.join('\n'), /apps\/web\/lib\/new\.ts assembles a system message/u);
});

test('an unresolved site passes only with a reason', () => {
  const sites = [{ file: 'apps/web/lib/new.ts', resolved: false }];

  assert.equal(
    auditAssembly(sites, { unresolved: { 'apps/web/lib/new.ts': 'a reason' } }).passed,
    true,
  );
  const blank = auditAssembly(sites, { unresolved: { 'apps/web/lib/new.ts': '  ' } });
  assert.equal(blank.passed, false);
  assert.match(blank.problems.join('\n'), /baselined with no reason/u);
});

test('the baseline only shrinks', () => {
  const nowResolved = auditAssembly([{ file: 'apps/web/lib/a.ts', resolved: true }], {
    unresolved: { 'apps/web/lib/a.ts': 'a reason' },
  });
  assert.equal(nowResolved.passed, false);
  assert.match(nowResolved.problems.join('\n'), /no longer needs a baseline entry/u);

  const gone = auditAssembly([], { unresolved: { 'apps/web/lib/gone.ts': 'a reason' } });
  assert.equal(gone.passed, false);
  assert.match(gone.problems.join('\n'), /assembles no system message/u);
});

test('the repository passes its own baseline', () => {
  const repoRoot = path.resolve(import.meta.dirname, '..');
  const sites = assemblySites(repoRoot);
  const baseline = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'scripts/lib/prompt-layer-assembly-baseline.json'), 'utf8'),
  );

  assert.ok(sites.length > 0);
  assert.deepEqual(auditAssembly(sites, baseline).problems, []);
});
