import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  ALLOWLIST_PATH,
  MIGRATIONS_DIR,
  REPO_ROOT,
  SCAN_ROOT,
  findMigrationDependencyReferences,
  loadAllowlist,
  loadDraftMigrations,
  parseDraftMigration,
} from './check-migration-dependencies.mjs';

const GUARD = path.join(REPO_ROOT, 'scripts', 'check-migration-dependencies.mjs');

const sandboxes = [];
function makeSandbox(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'migration-dep-'));
  sandboxes.push(dir);
  for (const [rel, contents] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, typeof contents === 'string' ? contents : JSON.stringify(contents), 'utf8');
  }
  return dir;
}
after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

test('the real guard passes on the repository as it stands', () => {
  const result = spawnSync(process.execPath, [GUARD], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, `expected clean repo, got:\n${result.stderr}${result.stdout}`);
});

test('the real allowlist is valid and every entry names a migration this repo still has as a draft', () => {
  const allowlist = loadAllowlist();
  assert.ok(allowlist.length > 0, 'expected the seeded allowlist to carry entries');
  const migrations = loadDraftMigrations();
  const draftNumbers = new Set(migrations.map((m) => m.number));
  for (const entry of allowlist) {
    assert.ok(
      draftNumbers.has(entry.migration),
      `${entry.file} allowlists migration ${entry.migration}, which is not a currently-draft migration`,
    );
  }
});

test('parseDraftMigration ignores a migration with no NOT YET APPLIED marker', () => {
  const text =
    '-- 0001 applied\n\nbegin;\ncreate table if not exists public.widgets (id uuid);\ncommit;\n';
  assert.equal(parseDraftMigration('0001_widgets.sql', text), null);
});

test('parseDraftMigration extracts a new table', () => {
  const text =
    '-- 0200 widgets\n-- NOT YET APPLIED, draft only.\nbegin;\ncreate table if not exists public.widgets (id uuid);\ncommit;\n';
  const parsed = parseDraftMigration('0200_widgets.sql', text);
  assert.equal(parsed.number, 200);
  assert.deepEqual(parsed.tables, ['widgets']);
  assert.deepEqual(parsed.columnsByTable, {});
});

test('parseDraftMigration extracts every column from a multi-column alter statement', () => {
  const text = [
    '-- 0201 widget columns',
    '-- NOT YET APPLIED, draft only.',
    'begin;',
    'alter table public.widgets',
    '  add column if not exists color text,',
    '  add column if not exists weight integer;',
    'commit;',
  ].join('\n');
  const parsed = parseDraftMigration('0201_widget_columns.sql', text);
  assert.deepEqual(parsed.columnsByTable, { widgets: ['color', 'weight'] });
});

test('parseDraftMigration keeps columns scoped to their own alter statement', () => {
  const text = [
    '-- 0202 two tables',
    '-- NOT YET APPLIED, draft only.',
    'begin;',
    'alter table public.widgets add column if not exists color text;',
    'alter table public.gadgets add column if not exists weight integer;',
    'commit;',
  ].join('\n');
  const parsed = parseDraftMigration('0202_two_tables.sql', text);
  assert.deepEqual(parsed.columnsByTable, { widgets: ['color'], gadgets: ['weight'] });
});

const DRAFT_MIGRATION = {
  number: 200,
  fileName: '0200_widgets.sql',
  tables: ['widgets'],
  columnsByTable: { gadgets: ['weight'] },
};

test('findMigrationDependencyReferences flags a file that names a new table', () => {
  const sandbox = makeSandbox({
    'apps/web/lib/example.ts': "export const table = 'widgets';\n",
  });
  const refs = findMigrationDependencyReferences({
    migrations: [DRAFT_MIGRATION],
    filePaths: [path.join(sandbox, 'apps/web/lib/example.ts')],
    repoRoot: sandbox,
  });
  assert.equal(refs.length, 1);
  assert.deepEqual(refs[0].identifiers, ['widgets']);
});

test('findMigrationDependencyReferences ignores prose, comments and ui labels naming a table', () => {
  const sandbox = makeSandbox({
    'apps/web/lib/prose.ts':
      "// widgets are counted here\nexport const label = 'Provisioned widgets (Enterprise)';\n",
    'apps/web/lib/key.ts': 'export const notes = { widgets: "cascades" };\n',
  });
  const refs = findMigrationDependencyReferences({
    migrations: [DRAFT_MIGRATION],
    filePaths: [
      path.join(sandbox, 'apps/web/lib/prose.ts'),
      path.join(sandbox, 'apps/web/lib/key.ts'),
    ],
    repoRoot: sandbox,
  });
  assert.deepEqual(
    refs.map((ref) => ref.file),
    ['apps/web/lib/key.ts'],
  );
});

test('findMigrationDependencyReferences flags a column only alongside its owning table', () => {
  const sandbox = makeSandbox({
    'apps/web/lib/both.ts': "export const q = 'select weight from gadgets';\n",
    'apps/web/lib/column-only.ts': 'export const w = someRow.weight;\n',
  });
  const refs = findMigrationDependencyReferences({
    migrations: [DRAFT_MIGRATION],
    filePaths: [
      path.join(sandbox, 'apps/web/lib/both.ts'),
      path.join(sandbox, 'apps/web/lib/column-only.ts'),
    ],
    repoRoot: sandbox,
  });
  assert.equal(refs.length, 1);
  assert.equal(refs[0].file, 'apps/web/lib/both.ts');
  assert.deepEqual(refs[0].identifiers, ['gadgets.weight']);
});

test('findMigrationDependencyReferences ignores test files and files outside apps/web', () => {
  const sandbox = makeSandbox({
    'apps/web/lib/widgets.test.ts': "export const table = 'widgets';\n",
    'apps/desktop/src/lib/widgets.ts': "export const table = 'widgets';\n",
  });
  const refs = findMigrationDependencyReferences({
    migrations: [DRAFT_MIGRATION],
    filePaths: [
      path.join(sandbox, 'apps/web/lib/widgets.test.ts'),
      path.join(sandbox, 'apps/desktop/src/lib/widgets.ts'),
    ],
    repoRoot: sandbox,
  });
  assert.equal(refs.length, 0);
});

test('loadAllowlist rejects an entry with no reason', () => {
  const sandbox = makeSandbox({
    [ALLOWLIST_PATH]: {
      schemaVersion: 1,
      entries: [{ file: 'apps/web/lib/x.ts', migration: 200, reason: '' }],
    },
  });
  assert.throws(() => loadAllowlist({ repoRoot: sandbox }), /non-empty reason/);
});

test('constants point at the expected repo paths', () => {
  assert.equal(MIGRATIONS_DIR, 'apps/web/db/neon');
  assert.equal(SCAN_ROOT, 'apps/web');
  assert.equal(ALLOWLIST_PATH, 'scripts/config/migration-dependency-allowlist.json');
});
