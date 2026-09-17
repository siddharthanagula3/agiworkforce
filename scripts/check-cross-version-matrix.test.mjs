import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';

import { checklistTitles, runChecks } from './check-cross-version-matrix.mjs';

const VERSION_MATRIX = path.join(process.cwd(), '.github/cross-version-matrix.json');
const SURFACE_CHAIN = path.join(process.cwd(), '.github/cross-surface-e2e-chain.json');

function withFile(file, mutate, body) {
  const original = fs.readFileSync(file, 'utf8');
  const parsed = JSON.parse(original);
  mutate(parsed);
  fs.writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`);
  try {
    body();
  } finally {
    fs.writeFileSync(file, original);
  }
}

test('the repository as committed satisfies the guard', () => {
  assert.deepEqual(runChecks(), []);
});

test('checklist titles are read from the checklist, not from the manifest', () => {
  const markdown = fs.readFileSync(
    path.join(process.cwd(), 'docs/work/enterprise-master-build-checklist-2026-09-16.md'),
    'utf8',
  );
  const pairs = checklistTitles(markdown, 109);
  assert.equal(pairs.length, 9);
  assert.ok(pairs.includes('New CLI plus old VS Code'));
  assert.equal(checklistTitles(markdown, 110).length, 18);
});

test('a pair dropped from the manifest is caught', () => {
  withFile(
    VERSION_MATRIX,
    (matrix) => {
      matrix.pairs = matrix.pairs.slice(1);
    },
    () => {
      const errors = runChecks();
      assert.ok(errors.some((error) => error.includes('New web plus old backend')));
    },
  );
});

test('a pair that claims a test file it does not have is caught', () => {
  withFile(
    VERSION_MATRIX,
    (matrix) => {
      const pair = matrix.pairs.find((entry) => entry.id === 'new-cli-old-vscode');
      pair.test = 'crates/agiworkforce-app-server/tests/no_such_file.rs';
    },
    () => {
      assert.ok(runChecks().some((error) => error.includes('which is not there')));
    },
  );
});

test('a blocked pair that quietly becomes covered with no test is caught', () => {
  withFile(
    VERSION_MATRIX,
    (matrix) => {
      const pair = matrix.pairs.find((entry) => entry.id === 'old-mobile-new-backend');
      pair.status = 'covered';
    },
    () => {
      const errors = runChecks();
      assert.ok(errors.some((error) => error.includes('names no command')));
      assert.ok(errors.some((error) => error.includes('covered and blocked at once')));
    },
  );
});

test('a blocked pair that stops saying what would unblock it is caught', () => {
  withFile(
    VERSION_MATRIX,
    (matrix) => {
      delete matrix.pairs.find((entry) => entry.id === 'old-chrome-new-bridge').unblockedBy;
    },
    () => {
      assert.ok(runChecks().some((error) => error.includes('what would unblock it')));
    },
  );
});

test('a chain step cannot claim coverage while the tenant is absent', () => {
  withFile(
    SURFACE_CHAIN,
    (chain) => {
      const step = chain.steps.find((entry) => entry.id === 'start-chat-web');
      step.status = 'covered';
      step.spec = 'apps/web/e2e/chat-layout.spec.ts';
    },
    () => {
      assert.ok(
        runChecks().some((error) =>
          error.includes('while the tenant it runs against does not exist'),
        ),
      );
    },
  );
});

test('a chain step that blames a drivable surface is caught', () => {
  withFile(
    SURFACE_CHAIN,
    (chain) => {
      chain.steps.find((entry) => entry.id === 'library').blockedBy = ['tenant', 'surface'];
    },
    () => {
      assert.ok(runChecks().some((error) => error.includes('which this file says is drivable')));
    },
  );
});

test('a reordered chain is caught, because §110 is an ordered walk', () => {
  withFile(
    SURFACE_CHAIN,
    (chain) => {
      chain.steps = [chain.steps[1], chain.steps[0], ...chain.steps.slice(2)];
    },
    () => {
      assert.ok(runChecks().some((error) => error.includes('numbered 1..n in chain order')));
    },
  );
});
