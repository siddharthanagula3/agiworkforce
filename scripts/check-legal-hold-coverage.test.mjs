import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  BASELINE_PATH,
  CONTRACT_PATH,
  GATE_PATH,
  MIGRATIONS_DIR,
  REPO_ROOT,
  checkLegalHoldCoverage,
  destructiveReach,
  readHoldVocabulary,
  readHoldableResources,
} from './check-legal-hold-coverage.mjs';

const GUARD = path.join(REPO_ROOT, 'scripts', 'check-legal-hold-coverage.mjs');
const SUBJECT = 'apps/web/lib/services/subject-under-test.ts';

const sandboxes = [];
after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

/** The real inputs, so the guard reads a real schema and a real contract. */
function sandbox({ subject = null, baseline = null, contract = null, gate = null } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'legal-hold-coverage-'));
  sandboxes.push(dir);
  for (const relative of [CONTRACT_PATH, GATE_PATH, BASELINE_PATH]) {
    mkdirSync(path.join(dir, path.dirname(relative)), { recursive: true });
    cpSync(path.join(REPO_ROOT, relative), path.join(dir, relative));
  }
  cpSync(path.join(REPO_ROOT, MIGRATIONS_DIR), path.join(dir, MIGRATIONS_DIR), {
    recursive: true,
  });

  const files = [];
  if (subject !== null) {
    mkdirSync(path.join(dir, path.dirname(SUBJECT)), { recursive: true });
    writeFileSync(path.join(dir, SUBJECT), subject, 'utf8');
    files.push(SUBJECT);
  }
  if (baseline !== null) {
    writeFileSync(path.join(dir, BASELINE_PATH), JSON.stringify(baseline), 'utf8');
  }
  if (contract !== null) {
    const source = readFileSync(path.join(REPO_ROOT, CONTRACT_PATH), 'utf8');
    writeFileSync(path.join(dir, CONTRACT_PATH), contract(source), 'utf8');
  }
  if (gate !== null) {
    const source = readFileSync(path.join(REPO_ROOT, GATE_PATH), 'utf8');
    writeFileSync(path.join(dir, GATE_PATH), gate(source), 'utf8');
  }
  return { dir, files };
}

function run(options = {}) {
  const { dir, files } = sandbox(options);
  return checkLegalHoldCoverage(dir, { files });
}

const EMPTY_BASELINE = { unguarded: [] };

test('the real guard passes on the repository as it stands', () => {
  const result = spawnSync(process.execPath, [GUARD], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, `expected a clean repo, got:\n${result.stderr}${result.stdout}`);
});

test('the contract and the database agree on which stores a hold can name', () => {
  const declared = new Set(readHoldableResources(REPO_ROOT).map((entry) => entry.resourceType));
  const vocabulary = readHoldVocabulary(REPO_ROOT);
  assert.ok(vocabulary.size > 0, 'no migration constrains legal_holds.resource_types');
  assert.deepEqual([...vocabulary].sort(), [...declared].sort());
});

test('a new delete on a holdable store with no hold check fails', () => {
  const { errors, unguarded } = run({
    subject: "await db.query('delete from public.web_conversations where id = $1', [id]);",
    baseline: EMPTY_BASELINE,
  });
  assert.deepEqual(errors, []);
  assert.equal(unguarded.length, 1);
  assert.equal(unguarded[0].file, SUBJECT);
  assert.equal(unguarded[0].table, 'web_conversations');
  assert.ok(unguarded[0].held.includes('web_conversations'));
});

test('the same delete passes once the predicate is inside the statement', () => {
  const { errors, unguarded } = run({
    subject:
      "const exclusion = legalHoldExclusion('conversation', { alias: 't', nextParamIndex: 2 });\n" +
      'await db.query(`delete from public.web_conversations t where t.id = $1 and ${exclusion.sql}`, [id]);',
    baseline: EMPTY_BASELINE,
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(unguarded, []);
});

test('importing the gate and deriving a list of held people first does not count', () => {
  const { unguarded } = run({
    subject:
      "const held = heldUserIdsFor(await listLegalHolds(db, org), 'conversation');\n" +
      'await db.query(`delete from public.web_conversations where not (user_id = any($1::text[]))`, [held]);',
    baseline: EMPTY_BASELINE,
  });
  assert.equal(unguarded.length, 1, 'a read-then-delete must still be reported');
  assert.equal(unguarded[0].table, 'web_conversations');
});

test('a predicate elsewhere in the file cannot vouch for an ungated statement', () => {
  const { unguarded } = run({
    subject:
      "const exclusion = legalHoldExclusion('message', { alias: 'm', nextParamIndex: 1 });\n" +
      'await db.query(`select 1 where ${exclusion.sql}`, exclusion.params);\n' +
      'await db.query(`delete from public.web_conversations where id = $1`, [id]);',
    baseline: EMPTY_BASELINE,
  });
  assert.equal(unguarded.length, 1);
  assert.equal(unguarded[0].table, 'web_conversations');
});

test('a delete on a table that cascades into a holdable store fails', () => {
  const { unguarded } = run({
    subject: "await db.query('delete from public.organizations where id = $1', [id]);",
    baseline: EMPTY_BASELINE,
  });
  assert.equal(unguarded.length, 1);
  assert.equal(unguarded[0].table, 'organizations');
  assert.ok(
    unguarded[0].held.length > 0,
    'deleting a workspace must be reported as reaching a holdable store by cascade',
  );
});

test('a delete whose table is computed from a registry of holdable tables fails', () => {
  const { unguarded } = run({
    subject: `const tables = ['web_artifacts', 'user_projects'];
      await db.query(\`delete from public.\${table} where id = $1\`, [id]);`,
    baseline: EMPTY_BASELINE,
  });
  assert.equal(unguarded.length, 1);
  assert.equal(unguarded[0].table, '<computed>');
});

test('a delete on a store no hold can name is not the guard’s business', () => {
  const { errors, unguarded } = run({
    subject: "await db.query('delete from public.usage_events where id = $1', [id]);",
    baseline: EMPTY_BASELINE,
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(unguarded, []);
});

test('a recorded gap silences the failure and only while it is real', () => {
  const entry = {
    file: SUBJECT,
    table: 'web_conversations',
    why: 'a reason',
    fix: 'a fix',
  };
  const present = run({
    subject: "await db.query('delete from public.web_conversations where id = $1', [id]);",
    baseline: { unguarded: [entry] },
  });
  assert.deepEqual(present.errors, []);
  assert.deepEqual(present.unguarded, []);
  assert.deepEqual(present.known, [entry]);

  const gone = run({ subject: 'export const nothing = 1;', baseline: { unguarded: [entry] } });
  assert.equal(gone.errors.length, 1);
  assert.match(gone.errors[0], /no longer destroys a held store/);
});

test('a recorded gap without a reason or a fix fails', () => {
  const { errors } = run({
    subject: "await db.query('delete from public.web_conversations where id = $1', [id]);",
    baseline: { unguarded: [{ file: SUBJECT, table: 'web_conversations', why: '', fix: '  ' }] },
  });
  assert.equal(errors.length, 2);
  assert.match(errors[0], /carries no reason/);
  assert.match(errors[1], /does not say what would close it/);
});

test('a store the database lets a hold name and the contract does not declare fails', () => {
  const { errors } = run({
    baseline: EMPTY_BASELINE,
    contract: (source) => source.replace(/\n\s*\{\s*resourceType: 'work_run',[\s\S]*?\n\s*\},/, ''),
  });
  assert.ok(
    errors.some((error) => /a hold may name "work_run"/.test(error)),
    `expected the undeclared store to be reported, got ${JSON.stringify(errors)}`,
  );
});

test('a predicate that stops reading a hold scope fails', () => {
  const { errors } = run({
    baseline: EMPTY_BASELINE,
    gate: (source) => source.replace(/or \(h\.scope = 'custodian'[^\n]*\n/, ''),
  });
  assert.ok(
    errors.some((error) => /never names the "custodian" scope/.test(error)),
    `expected the dropped scope to be reported, got ${JSON.stringify(errors)}`,
  );
});

test('a predicate that stops reading the custodian table fails', () => {
  const { errors } = run({
    baseline: EMPTY_BASELINE,
    gate: (source) => source.replace(/legal_hold_custodians/g, 'legal_holds'),
  });
  assert.ok(
    errors.some((error) => /never reads legal_hold_custodians/.test(error)),
    `expected the dropped table to be reported, got ${JSON.stringify(errors)}`,
  );
});

test('a predicate that stops restricting itself to active holds fails', () => {
  const { errors } = run({
    baseline: EMPTY_BASELINE,
    gate: (source) => source.replace(/h\.released_at is null/g, 'true'),
  });
  assert.ok(
    errors.some((error) => /does not restrict itself to active holds/.test(error)),
    `expected the dropped release check to be reported, got ${JSON.stringify(errors)}`,
  );
});

test('an empty contract fails rather than passing everything by default', () => {
  const { errors } = run({
    baseline: EMPTY_BASELINE,
    contract: (source) =>
      source.replace(
        /HOLDABLE_RESOURCES: readonly HoldableResource\[\] = \[[\s\S]*?\n\];/,
        'HOLDABLE_RESOURCES: readonly HoldableResource[] = [\n];',
      ),
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /enumerates nothing/);
});

test('the reach of a delete is computed from the schema, not from a list', () => {
  const resources = readHoldableResources(REPO_ROOT);
  const reach = destructiveReach({
    holdableTables: resources.map((entry) => entry.table),
    foreignKeys: [
      { child: 'web_conversations', parent: 'workspaces', action: 'cascade' },
      { child: 'workspaces', parent: 'tenants', action: 'restrict' },
    ],
  });
  assert.deepEqual([...(reach.get('workspaces') ?? [])], ['web_conversations']);
  assert.equal(reach.get('tenants'), undefined, 'a restricting key does not propagate a delete');
});
