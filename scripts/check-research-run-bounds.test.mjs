import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CONTRACT_PATH,
  LOOP_PATH,
  REPO_ROOT,
  TERMINAL_STATUSES,
  contractStatuses,
  declaredBounds,
  NETWORK_TOOL_CALLS,
  findings,
  persistedStatuses,
  unsignalledNetworkCalls,
} from './lib/research-run-bounds.mjs';

/** A copy of the real pair, so a synthetic break is the only difference. */
function mirrorRepo(edit = (loop, contract) => [loop, contract]) {
  const root = mkdtempSync(path.join(tmpdir(), 'research-bounds-'));
  const [loop, contract] = edit(
    readFileSync(path.join(REPO_ROOT, LOOP_PATH), 'utf8'),
    readFileSync(path.join(REPO_ROOT, CONTRACT_PATH), 'utf8'),
  );
  for (const [relative, source] of [
    [LOOP_PATH, loop],
    [CONTRACT_PATH, contract],
  ]) {
    const full = path.join(root, relative);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, source);
  }
  return root;
}

function withRepo(edit, assertion) {
  const root = mirrorRepo(edit);
  try {
    assertion(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('reads the contract statuses and the declared bounds', () => {
  assert.ok(contractStatuses().includes('interrupted'));
  assert.deepEqual(declaredBounds(), ['maxIterations', 'maxSearches', 'budgetMs']);
  for (const status of TERMINAL_STATUSES) {
    assert.ok(persistedStatuses().includes(status), `${status} is persisted`);
  }
});

test('the research loop is clean today', () => {
  assert.deepEqual(findings(), []);
});

test('fails when a bound stops coming from configuration', () => {
  withRepo(
    (loop, contract) => [
      loop.replace(
        /const budgetMs =\s*\n\s*options\.budgetMs \?\?\s*\n\s*envInt\([^)]*\);/,
        'const budgetMs = 240000;',
      ),
      contract,
    ],
    (root) => {
      const problems = findings(root);
      assert.equal(problems.length, 1);
      assert.match(problems[0], /budgetMs/);
      assert.match(problems[0], /cannot be configured/);
    },
  );
});

test('fails when a terminal path stops writing a report', () => {
  withRepo(
    (loop, contract) => [
      loop.replaceAll("persistRun('interrupted'", "noPersist('interrupted'"),
      contract,
    ],
    (root) => {
      const problems = findings(root);
      assert.equal(problems.length, 1);
      assert.match(problems[0], /interrupted/);
    },
  );
});

test('fails when the loop persists a status the contract does not declare', () => {
  withRepo(
    (loop, contract) => [loop.replace("persistRun('completed'", "persistRun('finished'"), contract],
    (root) => {
      const problems = findings(root);
      assert.ok(problems.some((problem) => /"finished"/.test(problem)));
      assert.ok(problems.some((problem) => /"completed"/.test(problem)));
    },
  );
});

test('fails when a network tool loses the run cancellation signal', () => {
  withRepo(
    (loop, contract) => [
      loop.replace(
        /\n\s*\.\.\.\(options\.signal \? \{ signal: options\.signal \} : \{\}\),(?=\n\s*\}\);)/,
        '',
      ),
      contract,
    ],
    (root) => {
      const missing = unsignalledNetworkCalls(root);
      assert.equal(missing.length, 1);
      assert.ok(NETWORK_TOOL_CALLS.includes(missing[0].call));
      assert.ok(missing[0].line > 0);
      assert.ok(findings(root).some((problem) => /cancellation signal/.test(problem)));
    },
  );
});

test('fails when a network tool call disappears from the loop', () => {
  withRepo(
    (loop, contract) => [loop.replaceAll('await executeUrlFetch(', 'await fetchPage('), contract],
    (root) => {
      const missing = unsignalledNetworkCalls(root);
      assert.equal(missing.length, 1);
      assert.equal(missing[0].absent, true);
      assert.ok(findings(root).some((problem) => /update this guard/.test(problem)));
    },
  );
});
