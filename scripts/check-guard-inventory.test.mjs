import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  BASELINE_PATH,
  REPO_ROOT,
  ROOT_CHAIN,
  chainClosure,
  checkGuardInventory,
  guardFiles,
  workflowCommands,
} from './check-guard-inventory.mjs';

const roots = [];

function fixture({ scripts = {}, guards = [], workflow = '', baseline }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-inventory-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'scripts/config'), { recursive: true });
  fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts }));
  for (const guard of guards) {
    fs.writeFileSync(path.join(root, 'scripts', guard.file), '// fixture\n');
    if (guard.selfTest) {
      fs.writeFileSync(
        path.join(root, 'scripts', guard.file.replace(/\.mjs$/, '.test.mjs')),
        '// fixture\n',
      );
    }
  }
  if (workflow.length > 0) {
    fs.writeFileSync(path.join(root, '.github/workflows/ci.yml'), workflow);
  }
  if (baseline !== undefined) {
    fs.writeFileSync(path.join(root, BASELINE_PATH), JSON.stringify(baseline));
  }
  return root;
}

const REASON =
  'Written by the fixture to stand in for a real reason that explains why nothing runs this guard yet.';
const OWED = 'Wire it into the chain and delete this entry.';

test.after(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
});

test('a guard in the chain passes and an unwired one fails', () => {
  const wired = fixture({
    scripts: { [ROOT_CHAIN]: 'pnpm check:one', 'check:one': 'node scripts/check-one.mjs' },
    guards: [{ file: 'check-one.mjs' }],
  });
  assert.deepEqual(checkGuardInventory(wired).failures, []);

  const unwired = fixture({
    scripts: { [ROOT_CHAIN]: 'pnpm check:one', 'check:one': 'node scripts/check-one.mjs' },
    guards: [{ file: 'check-one.mjs' }, { file: 'check-two.mjs' }],
  });
  const { failures } = checkGuardInventory(unwired);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /check-two\.mjs is in neither/);
});

test('reachability follows a sub-chain, not only the one line', () => {
  const root = fixture({
    scripts: {
      [ROOT_CHAIN]: 'pnpm check:group',
      'check:group': 'pnpm check:deep',
      'check:deep': 'node scripts/check-deep.mjs',
    },
    guards: [{ file: 'check-deep.mjs' }],
  });
  assert.deepEqual(checkGuardInventory(root).failures, []);
});

test('a workflow step wires a guard but a paths trigger does not', () => {
  const step = fixture({
    scripts: { [ROOT_CHAIN]: 'true', 'check:one': 'node scripts/check-one.mjs' },
    guards: [{ file: 'check-one.mjs' }],
    workflow: 'jobs:\n  a:\n    steps:\n      - run: pnpm check:one\n',
  });
  assert.deepEqual(checkGuardInventory(step).failures, []);

  const trigger = fixture({
    scripts: { [ROOT_CHAIN]: 'true', 'check:one': 'node scripts/check-one.mjs' },
    guards: [{ file: 'check-one.mjs' }],
    workflow: "on:\n  push:\n    paths:\n      - 'scripts/check-one*'\n",
  });
  const { failures } = checkGuardInventory(trigger);
  assert.equal(failures.length, 1, 'a path filter starts a job, it does not run the guard');
  assert.match(failures[0], /check-one\.mjs is in neither/);
});

test('a declared entry needs a reason and the work that removes it', () => {
  const base = {
    scripts: { [ROOT_CHAIN]: 'true' },
    guards: [{ file: 'check-one.mjs' }],
  };
  const named = fixture({
    ...base,
    baseline: { unwired: [{ guard: 'check-one.mjs', reason: 'legacy', owed: OWED }] },
  });
  assert.match(checkGuardInventory(named).failures.join('\n'), /needs a reason, not a name/);

  const unowed = fixture({
    ...base,
    baseline: { unwired: [{ guard: 'check-one.mjs', reason: REASON, owed: 'later' }] },
  });
  assert.match(checkGuardInventory(unowed).failures.join('\n'), /needs the work that removes it/);

  const complete = fixture({
    ...base,
    baseline: { unwired: [{ guard: 'check-one.mjs', reason: REASON, owed: OWED }] },
  });
  assert.deepEqual(checkGuardInventory(complete).failures, []);
});

test('the list only shrinks: a wired guard and a deleted guard both fail their entry', () => {
  const wired = fixture({
    scripts: { [ROOT_CHAIN]: 'pnpm check:one', 'check:one': 'node scripts/check-one.mjs' },
    guards: [{ file: 'check-one.mjs' }],
    baseline: { unwired: [{ guard: 'check-one.mjs', reason: REASON, owed: OWED }] },
  });
  assert.match(checkGuardInventory(wired).failures.join('\n'), /runs now; drop its entry/);

  const gone = fixture({
    scripts: { [ROOT_CHAIN]: 'true' },
    guards: [],
    baseline: { unwired: [{ guard: 'check-gone.mjs', reason: REASON, owed: OWED }] },
  });
  assert.match(checkGuardInventory(gone).failures.join('\n'), /no longer a guard in the tree/);
});

test('a wired guard whose self-test nothing runs fails', () => {
  const unrun = fixture({
    scripts: { [ROOT_CHAIN]: 'pnpm check:one', 'check:one': 'node scripts/check-one.mjs' },
    guards: [{ file: 'check-one.mjs', selfTest: true }],
  });
  assert.match(checkGuardInventory(unrun).failures.join('\n'), /self-test that nothing runs/);

  const run = fixture({
    scripts: {
      [ROOT_CHAIN]: 'pnpm check:one',
      'check:one': 'node --test scripts/check-one.test.mjs && node scripts/check-one.mjs',
    },
    guards: [{ file: 'check-one.mjs', selfTest: true }],
  });
  assert.deepEqual(checkGuardInventory(run).failures, []);
});

test('the chain closure is taken over script bodies', () => {
  const closure = chainClosure({ a: 'pnpm b && pnpm c', b: 'pnpm d', c: 'x', d: 'y' }, ['a']);
  assert.deepEqual([...closure.names].sort(), ['a', 'b', 'c', 'd']);
});

test('the repository itself passes and every guard is accounted for', () => {
  const { guards, failures } = checkGuardInventory(REPO_ROOT);
  assert.deepEqual(failures, []);
  assert.equal(guards.length, guardFiles(REPO_ROOT).length);
  assert.ok(guards.length > 150, `expected the full guard corpus, found ${guards.length}`);
  assert.ok(workflowCommands(REPO_ROOT).includes('pnpm'), 'workflow run steps should be readable');
});
