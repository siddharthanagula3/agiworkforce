import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  BASELINE_PATH,
  MIGRATIONS_DIR,
  REPO_ROOT,
  checkMembershipUnattendedWork,
  withModuleConstants,
  workspaceOwnedTables,
} from './check-membership-unattended-work.mjs';

const GUARD = path.join(REPO_ROOT, 'scripts', 'check-membership-unattended-work.mjs');
const PROBE = 'apps/web/lib/services/probe-worker.ts';

const sandboxes = [];
after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

/** The real schema, so the table inventory is the one that exists. */
function sandbox(probe) {
  const dir = mkdtempSync(path.join(tmpdir(), 'unattended-work-'));
  sandboxes.push(dir);
  cpSync(path.join(REPO_ROOT, MIGRATIONS_DIR), path.join(dir, MIGRATIONS_DIR), {
    recursive: true,
  });
  mkdirSync(path.join(dir, path.dirname(PROBE)), { recursive: true });
  writeFileSync(path.join(dir, PROBE), probe, 'utf8');
  return dir;
}

function run(probe, baseline = { ungated: [] }) {
  return checkMembershipUnattendedWork(sandbox(probe), {
    roots: ['apps/web/lib'],
    baseline,
  });
}

function mentions(failures, needle) {
  return failures.some((failure) => failure.includes(needle));
}

const CLAIM = `
export async function claim(db) {
  return db.query(\`select task.id
       from scheduled_tasks task
      where task.is_enabled = true
        and task.next_execution_at <= now()
      for update skip locked\`, []);
}
`;

const GATED = CLAIM.replace(
  'and task.next_execution_at <= now()',
  `and task.next_execution_at <= now()
        and \${ownerMayRunUnattendedSql('task.user_id', 1)}
        and exists (select 1 from public.organization_members member
                     where member.organization_id = task.organization_id)`,
);

test('the real guard passes on the repository as it stands', () => {
  const result = spawnSync(process.execPath, [GUARD], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('work picked up with neither gate fails', () => {
  const { failures } = run(CLAIM);
  assert.ok(mentions(failures, PROBE), failures.join('\n'));
  assert.ok(
    mentions(failures, 'the membership predicate and the account gate'),
    failures.join('\n'),
  );
});

test('the same claim passes once it asks both questions', () => {
  const { failures } = run(GATED);
  assert.deepEqual(failures, []);
});

test('one gate is not both, and the missing one is named', () => {
  const { failures } = run(
    CLAIM.replace(
      'and task.next_execution_at <= now()',
      `and task.next_execution_at <= now()
        and \${ownerMayRunUnattendedSql('task.user_id', 1)}`,
    ),
  );
  assert.ok(mentions(failures, 'the membership predicate'), failures.join('\n'));
  assert.ok(!mentions(failures, 'and the account gate'), failures.join('\n'));
});

test('a statement that names its caller is a request, not unattended work', () => {
  const { failures } = run(
    CLAIM.replace(
      'where task.is_enabled = true',
      'where task.is_enabled = true and task.user_id = $1',
    ),
  );
  assert.deepEqual(failures, []);
});

test('a statement acting on one row somebody named is not a sweep', () => {
  const { failures } = run(
    CLAIM.replace('where task.is_enabled = true', 'where task.is_enabled = true and task.id = $1'),
  );
  assert.deepEqual(failures, []);
});

test('ending work that is already running is not picking work up', () => {
  const { failures } = run(
    CLAIM.replace(
      'where task.is_enabled = true',
      "where task.status = 'running' and task.is_enabled = true",
    ),
  );
  assert.deepEqual(failures, []);
});

test('a gate held in a module constant counts as the statement asking', () => {
  const { failures } = run(
    `const OWNER_GATE = ownerMayRunUnattendedSql('task.user_id', 1);
const MEMBER_GATE = ownerIsActiveWorkspaceMemberSql('task.user_id', 'task.organization_id', 2);
${CLAIM.replace('and task.next_execution_at <= now()', 'and task.next_execution_at <= now()\n        and ${OWNER_GATE}\n        and ${MEMBER_GATE}')}`,
  );
  assert.deepEqual(failures, []);
});

test('a gate handed in as a parameter is not this statement asking', () => {
  const { failures } = run(
    `function statement(ownerGate) {
  return \`select task.id from scheduled_tasks task where task.is_enabled = true and \${ownerGate} for update skip locked\`;
}
export const q = statement;`,
  );
  assert.ok(mentions(failures, PROBE), failures.join('\n'));
});

test('a recorded statement is silenced and a stale record fails', () => {
  const baseline = {
    ungated: [
      {
        file: PROBE,
        table: 'scheduled_tasks',
        owner: PROBE,
        reason: 'the probe explains at length why this one cannot be gated from here today',
        sql: 'and the predicate would go here',
      },
    ],
  };
  assert.deepEqual(run(CLAIM, baseline).failures, []);
  assert.ok(
    mentions(run(GATED, baseline).failures, 'matches no statement any more'),
    'a record that stops matching has to fail',
  );
});

test('a record without the SQL and the owner is not a record', () => {
  const { failures } = run(CLAIM, {
    ungated: [{ file: PROBE, table: 'scheduled_tasks', reason: 'too short' }],
  });
  assert.ok(mentions(failures, 'needs the exact SQL'), failures.join('\n'));
});

test('the table inventory is the schema, after drops', () => {
  const tables = workspaceOwnedTables(REPO_ROOT);
  assert.ok(tables.has('scheduled_tasks'), 'scheduled_tasks carries both columns');
  assert.ok(tables.has('event_triggers'), 'event_triggers carries both columns');
  assert.ok(!tables.has('team_members'), 'a dropped table is not a subject');
});

test('only an upper-case module constant is expanded, and only one level', () => {
  const source = "const A_GATE = ownerMayRunUnattendedSql('x', 1);\n";
  assert.match(withModuleConstants('select ${A_GATE}', source), /ownerMayRunUnattendedSql/);
  assert.equal(withModuleConstants('select ${ownerGate}', source), 'select ${ownerGate}');
});

test('the baseline path the guard reads is the one it tells people to edit', () => {
  assert.equal(BASELINE_PATH, 'scripts/config/membership-unattended-work-baseline.json');
});
