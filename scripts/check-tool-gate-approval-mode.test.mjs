import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  approvalModeArgument,
  approvalModeFailures,
  AUTO_MODE_BASELINE,
  unsafeCalls,
} from './check-tool-gate-approval-mode.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'approval-mode-'));
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
  return root;
}

const DERIVED = `
const loopInputs = classifyToolLoopInputs(mcpTools, tools, policy);
const loop = runToolLoop(processed, {
  approvalMode: loopInputs.approvalMode,
  userId,
});
`;

const PINNED_AUTO = `
const loop = runToolLoop(processed, {
  approvalMode: 'auto',
  unattended: true,
});
`;

test('reads the approval mode argument out of a call', () => {
  assert.equal(approvalModeArgument(`{ approvalMode: 'auto', userId }`), "'auto'");
  assert.equal(
    approvalModeArgument(`{ approvalMode: loopInputs.approvalMode }`),
    'loopInputs.approvalMode',
  );
  assert.equal(approvalModeArgument(`{ userId }`), null);
});

test('a mode derived from the account policy passes, a pinned auto does not', () => {
  assert.deepEqual(unsafeCalls('a.ts', DERIVED), []);
  const problems = unsafeCalls('b.ts', PINNED_AUTO);
  assert.equal(problems.length, 1);
  assert.match(problems[0].message, /pins approvalMode: 'auto'/u);
});

test('a manual pin passes, because it can only add an ask', () => {
  assert.deepEqual(unsafeCalls('c.ts', `runToolLoop(processed, { approvalMode: 'manual' });`), []);
});

test('a call that passes no approval mode at all fails', () => {
  const problems = unsafeCalls('d.ts', `runToolLoop(processed, { userId, unattended: true });`);
  assert.equal(problems.length, 1);
  assert.match(problems[0].message, /passes no approvalMode/u);
});

test('the module that declares an entry point is not read as a caller', () => {
  assert.deepEqual(
    unsafeCalls('tool-loop.ts', `export async function* runToolLoop(processed, options) {}`),
    [],
  );
});

test('a new caller pinning auto fails even while another one is baselined', () => {
  const root = fixture({
    'apps/web/lib/services/scheduled-agent-executor.ts': PINNED_AUTO,
    'apps/web/lib/services/new-executor.ts': PINNED_AUTO,
  });
  const { failures } = approvalModeFailures(root, AUTO_MODE_BASELINE);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /new-executor\.ts/u);
});

test('a baseline entry that has been fixed must be removed', () => {
  const root = fixture({ 'apps/web/lib/services/scheduled-agent-executor.ts': DERIVED });
  const { failures } = approvalModeFailures(root, AUTO_MODE_BASELINE);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /remove it from the baseline/u);
});

test('the repository passes, and every baseline entry carries a reason', () => {
  const { failures, callCount } = approvalModeFailures(REPO);
  assert.deepEqual(failures, []);
  assert.ok(callCount > 0, 'the walk must find tool-loop entry points');
  for (const [where, reason] of AUTO_MODE_BASELINE) {
    assert.ok(typeof reason === 'string' && reason.length > 40, `${where} has no reason`);
    assert.ok(fs.existsSync(path.join(REPO, where)), `${where} does not exist`);
  }
});
