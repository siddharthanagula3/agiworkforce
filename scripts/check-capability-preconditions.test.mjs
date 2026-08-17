import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { citedPaths, preconditionClauses } from './check-capability-preconditions.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const GUARD = join(REPO_ROOT, 'scripts', 'check-capability-preconditions.mjs');
const LEDGER = 'docs/current/parity-implementation-matrix.md';

function runOnSandbox(files) {
  const sandbox = mkdtempSync(join(tmpdir(), 'docs04-'));
  try {
    for (const [rel, contents] of Object.entries(files)) {
      const abs = join(sandbox, rel);
      mkdirSync(join(abs, '..'), { recursive: true });
      writeFileSync(abs, contents, 'utf8');
    }
    return spawnSync(process.execPath, [GUARD], { cwd: sandbox, encoding: 'utf8' });
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

const BARE_FINDING_ID = `# ledger

- **Creation-four approvals (founder, 2026-08-05):** AI-powered artifacts
  (CAP-052 — approved despite security sensitivity; a security design review
  proving WEB-13 stays closed is a hard precondition).
- **Next bullet:** unrelated.
`;

const CITES_REVIEW = `# ledger

- **Creation-four approvals (founder, 2026-08-05):** AI-powered artifacts
  (CAP-052 — approved despite security sensitivity;
  \`docs/design/review.md\` is that review and is a hard precondition).
- **Next bullet:** unrelated.
`;

test('the real guard passes on the repository as it stands', () => {
  const result = spawnSync(process.execPath, [GUARD], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});

test('a precondition naming only a finding id is rejected', () => {
  const result = runOnSandbox({ [LEDGER]: BARE_FINDING_ID });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /without citing a file a reader can open/);
  assert.match(result.stderr, new RegExp(`${LEDGER}:5`));
});

test('a precondition citing a document that exists is accepted', () => {
  const result = runOnSandbox({
    [LEDGER]: CITES_REVIEW,
    'docs/design/review.md': '# review\n',
  });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});

test('a precondition citing a document that is missing is rejected', () => {
  const result = runOnSandbox({ [LEDGER]: CITES_REVIEW });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /citing docs\/design\/review\.md, none of which exist/);
});

test('the clause stops at its own parentheses instead of borrowing a sibling citation', () => {
  const text = `- **Approvals:** publishing (see \`docs/design/publishing.md\`);
  AI artifacts (CAP-052 — a review proving WEB-13 stays closed is a hard
  precondition).
`;
  const [clause] = preconditionClauses(text);
  assert.deepEqual(citedPaths(clause.text), []);
});
