import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BACKUP_SECTION,
  DOCUMENT,
  NO_DRILL,
  REGISTRY,
  SYNC_REGISTRY,
  declaredDependencyIds,
  declaredSyncSemantics,
  runBackupBehaviourCheck,
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

const SYNC_SOURCE = `export const SYNC_OBJECT_SEMANTICS: Readonly<Record<SyncObjectType, SyncObjectSemantics>> = {
  conversation: {
    type: 'conversation',
    conflict: 'server-version-cas',
    deletion: 'tombstone',
    payload: 'cloud',
    clientMayWrite: true,
    surfaces: ALL_SURFACES,
  },
  skill: {
    type: 'skill',
    conflict: 'server-authoritative',
    deletion: 'tombstone',
    payload: 'cloud-or-device',
    clientMayWrite: false,
    surfaces: ALL_SURFACES,
  },
};
`;

function backupDocumentWith(rows) {
  return [
    '# Business continuity',
    '',
    BACKUP_SECTION,
    '',
    '| type | Bytes | Deletion | What a restore cannot reach | A later deletion |',
    '| ---- | ----- | -------- | --------------------------- | ---------------- |',
    ...rows,
    '',
    '## Known gaps',
    '',
  ].join('\n');
}

const GOOD_BACKUP_ROWS = [
  '| `conversation` | `cloud` | `tombstone` | Nothing beyond the database | Comes back live |',
  '| `skill` | `cloud-or-device` | `tombstone` | A copy held only on a device | Comes back live |',
];

function backupRoot(document, registry = SYNC_SOURCE) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dr-backup-'));
  fs.mkdirSync(path.join(root, path.dirname(DOCUMENT)), { recursive: true });
  fs.mkdirSync(path.join(root, path.dirname(SYNC_REGISTRY)), { recursive: true });
  fs.writeFileSync(path.join(root, DOCUMENT), document);
  fs.writeFileSync(path.join(root, SYNC_REGISTRY), registry);
  return root;
}

test('declaredSyncSemantics reads each type with its payload and deletion', () => {
  assert.deepEqual(
    [...declaredSyncSemantics(SYNC_SOURCE).entries()],
    [
      ['conversation', { deletion: 'tombstone', payload: 'cloud' }],
      ['skill', { deletion: 'tombstone', payload: 'cloud-or-device' }],
    ],
  );
});

test('a backup table with one faithful row per synced type passes', () => {
  assert.deepEqual(runBackupBehaviourCheck(backupRoot(backupDocumentWith(GOOD_BACKUP_ROWS))), []);
});

test('a synced type with no backup row fails', () => {
  const failures = runBackupBehaviourCheck(
    backupRoot(backupDocumentWith(GOOD_BACKUP_ROWS.slice(0, 1))),
  );
  assert.equal(failures.length, 1);
  assert.match(failures[0], /declares "skill" and the backup table has no row/);
});

test('a backup row that disagrees with where the registry keeps the bytes fails', () => {
  const failures = runBackupBehaviourCheck(
    backupRoot(
      backupDocumentWith([
        GOOD_BACKUP_ROWS[0],
        '| `skill` | `cloud` | `tombstone` | Nothing beyond the database | Comes back live |',
      ]),
    ),
  );
  assert.equal(failures.length, 1);
  assert.match(
    failures[0],
    /"skill" says its bytes are "cloud" and the registry says "cloud-or-device"/,
  );
});

test('a backup row that disagrees with how the registry deletes fails', () => {
  const failures = runBackupBehaviourCheck(
    backupRoot(
      backupDocumentWith([
        '| `conversation` | `cloud` | `hard-delete` | Nothing beyond the database | Gone |',
        GOOD_BACKUP_ROWS[1],
      ]),
    ),
  );
  assert.equal(failures.length, 1);
  assert.match(failures[0], /deletion is "hard-delete" and the registry says "tombstone"/);
});

test('a backup row for a type the registry does not declare fails', () => {
  const failures = runBackupBehaviourCheck(
    backupRoot(
      backupDocumentWith([...GOOD_BACKUP_ROWS, '| `widget` | `cloud` | `tombstone` | x | y |']),
    ),
  );
  assert.equal(failures.length, 1);
  assert.match(failures[0], /"widget" is not a type/);
});

test('a blank backup cell fails', () => {
  const failures = runBackupBehaviourCheck(
    backupRoot(
      backupDocumentWith([
        GOOD_BACKUP_ROWS[0],
        '| `skill` | `cloud-or-device` | `tombstone` |  | y |',
      ]),
    ),
  );
  assert.equal(failures.length, 1);
  assert.match(failures[0], /leaves column 4 blank/);
});

test('an unreadable sync registry fails rather than passing vacuously', () => {
  const failures = runBackupBehaviourCheck(
    backupRoot(backupDocumentWith(GOOD_BACKUP_ROWS), 'export const NOTHING = {};\n'),
  );
  assert.equal(failures.length, 1);
  assert.match(failures[0], /SYNC_OBJECT_SEMANTICS could not be read/);
});

test('the real backup table covers every synced type the registry declares', () => {
  const declared = declaredSyncSemantics(
    fs.readFileSync(path.join(repoRoot, SYNC_REGISTRY), 'utf8'),
  );
  assert.ok(declared.size >= 10, `expected the registry to declare types, got ${declared.size}`);
  assert.deepEqual(runBackupBehaviourCheck(repoRoot), []);
});
