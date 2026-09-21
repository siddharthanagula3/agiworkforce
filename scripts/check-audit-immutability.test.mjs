import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  MIGRATIONS_DIR,
  REPO_ROOT,
  checkAuditImmutability,
  refusingTriggers,
  readMigrations,
  tamperEvidentTables,
} from './check-audit-immutability.mjs';

const GUARD = path.join(REPO_ROOT, 'scripts', 'check-audit-immutability.mjs');
const EXTRA = '9997_subject_under_test.sql';

const sandboxes = [];
after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

/** The real schema, so a pass here is a pass against the tables that exist. */
function sandbox({ add = null, edit = null } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'audit-immutability-'));
  sandboxes.push(dir);
  cpSync(path.join(REPO_ROOT, MIGRATIONS_DIR), path.join(dir, MIGRATIONS_DIR), {
    recursive: true,
  });
  if (add !== null) writeFileSync(path.join(dir, MIGRATIONS_DIR, EXTRA), add, 'utf8');
  if (edit !== null) {
    const target = path.join(dir, MIGRATIONS_DIR, edit.file);
    const source = readFileSync(target, 'utf8');
    if (edit.drop === true) unlinkSync(target);
    else writeFileSync(target, edit.rewrite(source), 'utf8');
  }
  return dir;
}

function mentions(failures, needle) {
  return failures.some((failure) => failure.includes(needle));
}

const TRIGGER_FUNCTION = `
create or replace function public.probe_forbid_rewrite()
returns trigger language plpgsql as $$
begin
  raise exception 'no';
end;
$$;
`;

test('the real guard passes on the repository as it stands', () => {
  const result = spawnSync(process.execPath, [GUARD], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('a narrow revoke with no trigger behind it fails', () => {
  const { failures } = checkAuditImmutability(
    sandbox({
      add: `create table public.probe_trail (id uuid primary key);
revoke update, delete on public.probe_trail from app_rls;`,
    }),
  );
  assert.ok(mentions(failures, 'public.probe_trail'), failures.join('\n'));
  assert.ok(mentions(failures, 'nothing enforces it'), failures.join('\n'));
});

test('the same revoke passes once a refusing row trigger holds it', () => {
  const { failures } = checkAuditImmutability(
    sandbox({
      add: `create table public.probe_trail (id uuid primary key);
revoke update, delete on public.probe_trail from app_rls;
${TRIGGER_FUNCTION}
create trigger probe_trail_owner_writes_only
  before update or delete on public.probe_trail
  for each row execute function public.probe_forbid_rewrite();`,
    }),
  );
  assert.deepEqual(failures, []);
});

test('a statement trigger is not a row trigger and is reported as one', () => {
  const { failures } = checkAuditImmutability(
    sandbox({
      add: `create table public.probe_trail (id uuid primary key);
revoke update, delete on public.probe_trail from app_rls;
${TRIGGER_FUNCTION}
create trigger probe_trail_owner_writes_only
  before update or delete on public.probe_trail
  execute function public.probe_forbid_rewrite();`,
    }),
  );
  assert.ok(mentions(failures, 'statement trigger'), failures.join('\n'));
});

test('a trigger whose function raises nothing permits the write it watched', () => {
  const { failures } = checkAuditImmutability(
    sandbox({
      add: `create table public.probe_trail (id uuid primary key);
revoke update, delete on public.probe_trail from app_rls;
create or replace function public.probe_quiet() returns trigger language plpgsql as $$
begin
  return new;
end;
$$;
create trigger probe_trail_owner_writes_only
  before update or delete on public.probe_trail
  for each row execute function public.probe_quiet();`,
    }),
  );
  assert.ok(mentions(failures, 'raises nothing'), failures.join('\n'));
});

test('a trigger that fires only before update leaves the delete open', () => {
  const { failures } = checkAuditImmutability(
    sandbox({
      add: `create table public.probe_trail (id uuid primary key);
revoke update, delete on public.probe_trail from app_rls;
${TRIGGER_FUNCTION}
create trigger probe_trail_owner_writes_only
  before update on public.probe_trail
  for each row execute function public.probe_forbid_rewrite();`,
    }),
  );
  assert.ok(mentions(failures, 'nothing enforces it'), failures.join('\n'));
});

test('a revoke of all privileges is a different declaration and is not demanded of', () => {
  const declared = tamperEvidentTables([
    { name: 'probe.sql', sql: 'revoke all on public.probe_cache from app_rls;' },
  ]);
  assert.deepEqual(declared, []);
});

test('a revoke from another role says nothing about the application role', () => {
  const declared = tamperEvidentTables([
    { name: 'probe.sql', sql: 'revoke update, delete on public.probe_trail from public;' },
  ]);
  assert.deepEqual(declared, []);
});

test('a revoke inside a comment is not a declaration', () => {
  const declared = tamperEvidentTables(
    readMigrations(
      sandbox({
        add: `-- revoke update, delete on public.probe_commented from app_rls;`,
      }),
    ),
  );
  assert.ok(!declared.some((entry) => entry.table === 'probe_commented'));
});

test('a table that loses its declaration stops being a subject', () => {
  const dir = sandbox({
    edit: {
      file: '0116_consent_ledger_append_only.sql',
      rewrite: (source) =>
        source.replace(/revoke update, delete on public\.consent_records from app_rls;/g, ''),
    },
  });
  const declared = tamperEvidentTables(readMigrations(dir)).map((entry) => entry.table);

  assert.ok(!declared.includes('consent_records'), declared.join(', '));
  assert.ok(
    tamperEvidentTables(readMigrations(REPO_ROOT))
      .map((entry) => entry.table)
      .includes('consent_records'),
  );
});

test('the guard states the premise it rests on and fails when the premise goes', () => {
  const dir = sandbox({
    edit: {
      file: '0037_rls_user_isolation.sql',
      rewrite: (source) =>
        source.replace(/GRANT[^;]*ON ALL TABLES IN SCHEMA public TO app_rls;/gi, ''),
    },
  });
  const withoutDefaults = mkdtempSync(path.join(tmpdir(), 'audit-immutability-'));
  sandboxes.push(withoutDefaults);
  cpSync(path.join(dir, MIGRATIONS_DIR), path.join(withoutDefaults, MIGRATIONS_DIR), {
    recursive: true,
  });
  for (const file of ['0037_rls_user_isolation.sql']) {
    const target = path.join(withoutDefaults, MIGRATIONS_DIR, file);
    writeFileSync(
      target,
      readFileSync(target, 'utf8').replace(/ALTER DEFAULT PRIVILEGES[\s\S]*?;/gi, ''),
      'utf8',
    );
  }
  const { failures } = checkAuditImmutability(withoutDefaults);
  assert.ok(mentions(failures, 're-read this rule'), failures.join('\n'));
});

test('an empty migrations directory cannot be read as a clean pass', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'audit-immutability-'));
  sandboxes.push(dir);
  const { failures } = checkAuditImmutability(dir);
  assert.ok(mentions(failures, 'no migrations found'), failures.join('\n'));
});

test('the trigger reader names the table each trigger defends', () => {
  const triggers = refusingTriggers(readMigrations(REPO_ROOT));
  const audit = triggers.get('security_audit_logs');
  assert.equal(audit?.trigger, 'security_audit_logs_append_only');
  assert.equal(audit?.perRow, true);
  assert.equal(audit?.refuses, true);
});
