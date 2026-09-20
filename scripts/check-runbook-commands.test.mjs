import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  readRunbookReferences,
  resolveCommandTarget,
  runRunbookCommandsCheck,
} from './check-runbook-commands.mjs';

const RUNBOOK = `# Restore drill

Status: Current
Owner: Platform lead
Last updated: 2026-09-20

The drill runs \`scripts/db-restore-drill.mjs\` and reads
\`AGI_RESTORE_DRILL_SOURCE_URL\` from the environment.

\`\`\`bash
node scripts/db-restore-drill.mjs
pnpm check:restore
gh workflow run db-restore-drill.yml
\`\`\`

The workflow lives at \`.github/workflows/db-restore-drill.yml\`.
`;

function makeRoot(mutate = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runbook-commands-'));
  const write = (relative, contents) => {
    fs.mkdirSync(path.join(root, path.dirname(relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), contents);
  };
  const state = { runbook: RUNBOOK, keepSources: true };
  mutate(state, write);
  write('docs/runbooks/database-restore-drill.md', state.runbook);
  if (state.keepSources) {
    write('scripts/db-restore-drill.mjs', 'export default 1;\n');
    write('.github/workflows/db-restore-drill.yml', 'name: drill\n');
    write(
      'apps/web/lib/restore.ts',
      "export const url = process.env['AGI_RESTORE_DRILL_SOURCE_URL'];\n",
    );
    write(
      'package.json',
      JSON.stringify({ name: 'root', scripts: { 'check:restore': 'node scripts/x.mjs' } }),
    );
  }
  return root;
}

function failuresFor(mutate) {
  return runRunbookCommandsCheck(makeRoot(mutate));
}

test('a runbook whose commands, paths and settings all exist passes', () => {
  assert.deepEqual(
    failuresFor(() => {}),
    [],
  );
});

test('the reader separates fenced commands from backticked prose tokens', () => {
  const { commands, tokens } = readRunbookReferences(RUNBOOK);
  assert.deepEqual(commands, [
    'node scripts/db-restore-drill.mjs',
    'pnpm check:restore',
    'gh workflow run db-restore-drill.yml',
  ]);
  assert.ok(tokens.includes('scripts/db-restore-drill.mjs'));
  assert.ok(tokens.includes('AGI_RESTORE_DRILL_SOURCE_URL'));
});

test('the reader joins a command continued across a backslash', () => {
  const { commands } = readRunbookReferences(
    '```bash\nnode scripts/x.mjs \\\n  --flag value\n```\n',
  );
  assert.deepEqual(commands, ['node scripts/x.mjs --flag value']);
});

test('a command resolves to the file, script or workflow it runs', () => {
  assert.deepEqual(resolveCommandTarget('node scripts/x.mjs'), {
    kind: 'file',
    value: 'scripts/x.mjs',
  });
  assert.deepEqual(resolveCommandTarget('pnpm --filter @agiworkforce/web test'), {
    kind: 'script',
    value: 'test',
    filter: '@agiworkforce/web',
  });
  assert.deepEqual(resolveCommandTarget('gh workflow run drill.yml'), {
    kind: 'workflow',
    value: 'drill.yml',
  });
  assert.equal(resolveCommandTarget('psql "$AGI_DATABASE_URL"'), null);
  assert.equal(resolveCommandTarget('node scripts/<name>.mjs'), null);
});

test('a script a runbook tells an operator to run but that no longer exists fails', () => {
  const failures = failuresFor((state) => {
    state.runbook = state.runbook.replace(
      'node scripts/db-restore-drill.mjs',
      'node scripts/db-restore-drill-renamed.mjs',
    );
  });
  assert.ok(
    failures.some((failure) =>
      failure.includes('scripts/db-restore-drill-renamed.mjs does not exist'),
    ),
    failures.join('\n'),
  );
});

test('a package script a runbook names but the manifest does not define fails', () => {
  const failures = failuresFor((state) => {
    state.runbook = state.runbook.replace('pnpm check:restore', 'pnpm check:nothing');
  });
  assert.ok(
    failures.some((failure) => failure.includes('names script "check:nothing"')),
    failures.join('\n'),
  );
});

test('a workflow a runbook names but .github/workflows does not hold fails', () => {
  const failures = failuresFor((state) => {
    state.runbook = state.runbook.replace(
      'gh workflow run db-restore-drill.yml',
      'gh workflow run gone.yml',
    );
  });
  assert.ok(
    failures.some((failure) => failure.includes('names workflow "gone.yml"')),
    failures.join('\n'),
  );
});

test('a backticked path in the prose that does not exist fails', () => {
  const failures = failuresFor((state) => {
    state.runbook = state.runbook.replace(
      '`.github/workflows/db-restore-drill.yml`',
      '`.github/workflows/never-written.yml`',
    );
  });
  assert.ok(
    failures.some((failure) =>
      failure.includes('points at .github/workflows/never-written.yml, which does not exist'),
    ),
    failures.join('\n'),
  );
});

test('a setting a runbook names but nothing in the tree reads fails', () => {
  const failures = failuresFor((state) => {
    state.runbook = state.runbook.replace(
      'AGI_RESTORE_DRILL_SOURCE_URL',
      'AGI_RESTORE_DRILL_RENAMED_URL',
    );
  });
  assert.ok(
    failures.some((failure) => failure.includes('name setting AGI_RESTORE_DRILL_RENAMED_URL')),
    failures.join('\n'),
  );
});

test('a runbook missing one of its three headers fails', () => {
  for (const header of ['Status: Current', 'Owner: Platform lead', 'Last updated: 2026-09-20']) {
    const failures = failuresFor((state) => {
      state.runbook = state.runbook.replace(`${header}\n`, '');
    });
    assert.ok(
      failures.some((failure) => failure.includes('header')),
      `${header}: ${failures.join('\n')}`,
    );
  }
});

test('a path with a line range is checked without the range', () => {
  const failures = failuresFor((state) => {
    state.runbook = state.runbook.replace(
      '`scripts/db-restore-drill.mjs`',
      '`scripts/db-restore-drill.mjs:12-18`',
    );
  });
  assert.deepEqual(failures, []);
});

test('the repository runbooks pass the real check', () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  assert.deepEqual(runRunbookCommandsCheck(root), []);
});
