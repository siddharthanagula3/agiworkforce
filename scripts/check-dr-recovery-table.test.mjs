import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DOCUMENT,
  NO_DRILL,
  REGISTRY,
  declaredDependencyIds,
  runRecoveryTableCheck,
  tableRows,
} from './check-dr-recovery-table.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const REGISTRY_SOURCE = `export const PRODUCTION_DEPENDENCIES: readonly ProductionDependency[] = [
  {
    id: 'database',
    label: 'Neon Postgres',
  },
  {
    id: 'key_value',
    label: 'Upstash Redis',
  },
];
`;

function documentWith(rows) {
  return [
    '# Business continuity',
    '',
    'Status: Current',
    '',
    '## Recovery by dependency',
    '',
    '| id | What is lost | What the code does | Recovery step | Who | Rehearsed |',
    '| -- | ------------ | ------------------ | ------------- | --- | --------- |',
    ...rows,
    '',
    '## Known gaps',
    '',
    'None.',
    '',
  ].join('\n');
}

const GOOD_ROWS = [
  `| \`database\` | Everything | Readiness fails closed | Point-in-time restore | Platform lead | ${NO_DRILL} |`,
  `| \`key_value\` | Rate limits | Fails closed | Re-provision | Platform lead | ${NO_DRILL} |`,
];

function scratchRoot(document, registry = REGISTRY_SOURCE) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dr-recovery-'));
  fs.mkdirSync(path.join(root, path.dirname(DOCUMENT)), { recursive: true });
  fs.mkdirSync(path.join(root, path.dirname(REGISTRY)), { recursive: true });
  fs.writeFileSync(path.join(root, DOCUMENT), document);
  fs.writeFileSync(path.join(root, REGISTRY), registry);
  return root;
}

test('declaredDependencyIds reads the ids in declaration order', () => {
  assert.deepEqual(declaredDependencyIds(REGISTRY_SOURCE), ['database', 'key_value']);
});

test('tableRows drops the separator and splits the cells', () => {
  const rows = tableRows('| a | b |\n| - | - |\n| c | d |\n');
  assert.deepEqual(rows, [
    ['a', 'b'],
    ['c', 'd'],
  ]);
});

test('a complete table passes', () => {
  assert.deepEqual(runRecoveryTableCheck(scratchRoot(documentWith(GOOD_ROWS))), []);
});

test('a dependency with no row fails', () => {
  const failures = runRecoveryTableCheck(scratchRoot(documentWith([GOOD_ROWS[0]])));
  assert.equal(failures.length, 1);
  assert.match(failures[0], /declares "key_value" and the recovery table has no row/);
});

test('a row naming a dependency the code does not declare fails', () => {
  const rows = [
    ...GOOD_ROWS,
    `| \`mailroom\` | Post | Refuses | Restore | Platform lead | ${NO_DRILL} |`,
  ];
  const failures = runRecoveryTableCheck(scratchRoot(documentWith(rows)));
  assert.equal(failures.length, 1);
  assert.match(failures[0], /"mailroom" is not a dependency/);
});

test('a blank cell fails', () => {
  const rows = [
    `| \`database\` | Everything | Readiness fails closed |  | Platform lead | ${NO_DRILL} |`,
    GOOD_ROWS[1],
  ];
  const failures = runRecoveryTableCheck(scratchRoot(documentWith(rows)));
  assert.equal(failures.length, 1);
  assert.match(failures[0], /leaves column 4 blank/);
});

test('a rehearsal claim with no cited file fails', () => {
  const rows = [
    '| `database` | Everything | Readiness fails closed | Restore | Platform lead | rehearsed quarterly |',
    GOOD_ROWS[1],
  ];
  const failures = runRecoveryTableCheck(scratchRoot(documentWith(rows)));
  assert.equal(failures.length, 1);
  assert.match(failures[0], /claims a rehearsal but cites no file/);
});

test('a rehearsal citing a file that does not exist fails', () => {
  const rows = [
    '| `database` | Everything | Readiness fails closed | Restore | Platform lead | `scripts/never-written.mjs` |',
    GOOD_ROWS[1],
  ];
  const failures = runRecoveryTableCheck(scratchRoot(documentWith(rows)));
  assert.equal(failures.length, 1);
  assert.match(failures[0], /cites "scripts\/never-written\.mjs" as its rehearsal/);
});

test('a behaviour cell citing a file that does not exist fails', () => {
  const rows = [
    `| \`database\` | Everything | Fails closed in \`apps/web/lib/gone.ts\` | Restore | Platform lead | ${NO_DRILL} |`,
    GOOD_ROWS[1],
  ];
  const failures = runRecoveryTableCheck(scratchRoot(documentWith(rows)));
  assert.equal(failures.length, 1);
  assert.match(failures[0], /cites "apps\/web\/lib\/gone\.ts", which does not exist/);
});

test('the same dependency twice fails', () => {
  const failures = runRecoveryTableCheck(scratchRoot(documentWith([...GOOD_ROWS, GOOD_ROWS[0]])));
  assert.equal(failures.length, 1);
  assert.match(failures[0], /"database" has more than one row/);
});

test('a missing section fails rather than passing vacuously', () => {
  const root = scratchRoot('# Business continuity\n\nNothing here.\n');
  const failures = runRecoveryTableCheck(root);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /has no "## Recovery by dependency" section/);
});

test('an unreadable registry fails rather than passing vacuously', () => {
  const root = scratchRoot(documentWith(GOOD_ROWS), 'export const SOMETHING_ELSE = [];\n');
  const failures = runRecoveryTableCheck(root);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /PRODUCTION_DEPENDENCIES could not be read/);
});

test('the real repository passes, and the registry it reads is not empty', () => {
  const declared = declaredDependencyIds(fs.readFileSync(path.join(repoRoot, REGISTRY), 'utf8'));
  assert.ok(
    declared.length >= 10,
    `expected the registry to declare dependencies, got ${declared.length}`,
  );
  assert.deepEqual(runRecoveryTableCheck(repoRoot), []);
});
