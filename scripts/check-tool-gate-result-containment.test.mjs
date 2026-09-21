import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { containmentFailures, messageRoles } from './check-tool-gate-result-containment.mjs';

const LOOP = 'apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function fixture(loopSource) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'result-containment-'));
  const target = path.join(root, LOOP);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, loopSource);
  return root;
}

const CLEAN = `
const capped = capOutput(content);
messages.push({
  role: 'tool',
  content: capped,
  tool_call_id: tc.id,
});
`;

test('reads the role of every message the loop appends', () => {
  assert.deepEqual(messageRoles(CLEAN), [{ line: 3, role: 'tool' }]);
});

test('a tool result appended as a system message fails', () => {
  const root = fixture(CLEAN.replace("role: 'tool'", "role: 'system'"));
  const { failures } = containmentFailures(root);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /appends a tool result as "system"/u);
});

test('a message appended with a computed role fails rather than passing unread', () => {
  const root = fixture(`messages.push({\n  role: resolvedRole,\n  content,\n});\ncapOutput(x);\n`);
  const { failures } = containmentFailures(root);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /no literal role/u);
});

test('dropping the output cap fails', () => {
  const root = fixture(CLEAN.replace('capOutput(content)', 'content'));
  const { failures } = containmentFailures(root);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /no longer bounds tool output/u);
});

test('the repository passes and the walk sees real writes', () => {
  const { failures, writes } = containmentFailures(REPO);
  assert.deepEqual(failures, []);
  assert.ok(writes > 5, 'the loop appends more than a handful of messages');
});
