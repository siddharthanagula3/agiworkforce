import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CROSS_WORKSPACE_STATEMENTS,
  MEMBERSHIP_TABLES,
  REVOCATION_AT_CALLER,
} from './check-membership-isolation.mjs';

const script = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'check-membership-isolation.mjs',
);

function writeFile(root, relative, contents) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'membership-isolation-'));
  for (const table of MEMBERSHIP_TABLES) {
    writeFile(
      root,
      `apps/web/db/neon/0001_${table}.sql`,
      `create table if not exists public.${table} (\n  id uuid primary key,\n  organization_id uuid not null,\n  user_id text not null\n);\n`,
    );
  }
  writeFile(
    root,
    'apps/web/lib/services/team-service.ts',
    'export async function listMembers(db, organizationId) {\n  return db.query(`select user_id from public.organization_members where organization_id = $1`, [organizationId]);\n}\n',
  );
  // The declared cross-workspace statements have to be present, or every run
  // would report them stale and no other case could be seen.
  writeFile(
    root,
    'apps/web/lib/services/organization-invitation-service.ts',
    [
      'export async function sweep(db) {',
      "  await db.execute(`update public.organization_invitations set status = 'expired' where status = 'pending' and expires_at <= now()`);",
      '}',
      'export async function accept(db, hash) {',
      "  const [row] = await db.query(`select id from public.organization_invitations where token_hash = $1 and status = 'pending'`, [hash]);",
      "  await db.execute(`update public.organization_invitations set status = 'accepted' where id = $1`, [row.id]);",
      '}',
      'export async function decline(db, id) {',
      "  await db.execute(`update public.organization_invitations set status = 'declined' where id = $1`, [id]);",
      '}',
      '',
    ].join('\n'),
  );
  for (const entry of CROSS_WORKSPACE_STATEMENTS) {
    if (fs.existsSync(path.join(root, entry.file))) continue;
    writeFile(root, entry.file, 'export const nothing = null;\n');
  }
  return root;
}

function run(root) {
  try {
    return {
      status: 0,
      output: execFileSync(process.execPath, [script, '--root', root], { encoding: 'utf8' }),
    };
  } catch (error) {
    return { status: error.status ?? 1, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

test('passes when every membership statement names its workspace', () => {
  const root = fixture();
  const { status, output } = run(root);
  assert.equal(status, 0, output);
  assert.match(output, /5 statement\(s\) over 8 membership table\(s\)/);
});

test('fails on a membership statement with no workspace predicate', () => {
  const root = fixture();
  writeFile(
    root,
    'apps/web/lib/services/leaky-service.ts',
    "export async function all(db) {\n  return db.query(`select user_id from public.organization_members where role = 'owner'`);\n}\n",
  );
  const { status, output } = run(root);
  assert.equal(status, 1);
  assert.match(output, /name no workspace/);
  assert.match(output, /leaky-service/);
});

test('fails on a role-grant statement with no workspace predicate', () => {
  const root = fixture();
  writeFile(
    root,
    'apps/web/app/api/leaky/route.ts',
    "export async function POST(db) {\n  return db.query(`delete from public.organization_member_roles where user_id = $1`, ['u']);\n}\n",
  );
  const { status, output } = run(root);
  assert.equal(status, 1);
  assert.match(output, /organization_member_roles/);
});

test('accepts a statement the row policies scope by current_app_org_id', () => {
  const root = fixture();
  writeFile(
    root,
    'apps/web/lib/services/scoped-service.ts',
    'export async function all(db) {\n  return db.query(`select user_id from public.organization_invitations where current_app_org_id() is not null`);\n}\n',
  );
  const { status, output } = run(root);
  assert.equal(status, 0, output);
});

test('fails when a membership table loses its organization_id column', () => {
  const root = fixture();
  writeFile(
    root,
    'apps/web/db/neon/0001_organization_invitations.sql',
    'create table if not exists public.organization_invitations (\n  id uuid primary key,\n  email text not null\n);\n',
  );
  const { status, output } = run(root);
  assert.equal(status, 1);
  assert.match(output, /no organization_id in the schema/);
  assert.match(output, /organization_invitations/);
});

test('fails when a membership is ended without revoking what it authorized', () => {
  const root = fixture();
  writeFile(
    root,
    'apps/web/lib/services/offboarding.ts',
    'export async function remove(db, organizationId, userId) {\n  await db.execute(`delete from public.organization_members where organization_id = $1 and user_id = $2`, [organizationId, userId]);\n}\n',
  );
  const { status, output } = run(root);
  assert.equal(status, 1);
  assert.match(output, /without revoking what it authorized/);
});

test('accepts an ending whose own module revokes', () => {
  const root = fixture();
  writeFile(
    root,
    'apps/web/lib/services/offboarding.ts',
    'import { deprovisionMember } from "@/lib/services/deprovision-service";\nexport async function remove(db, organizationId, userId) {\n  await db.execute(`delete from public.organization_members where organization_id = $1 and user_id = $2`, [organizationId, userId]);\n  await deprovisionMember(db, null, { userId, organizationId });\n}\n',
  );
  const { status, output } = run(root);
  assert.equal(status, 0, output);
});

test('fails when the caller that owes a revocation stops doing it', () => {
  const root = fixture();
  const [entry] = REVOCATION_AT_CALLER;
  writeFile(
    root,
    entry.file,
    `export async function ${entry.symbol}(db, organizationId, userId) {\n  await db.execute(\`delete from public.organization_members where organization_id = $1 and user_id = $2\`, [organizationId, userId]);\n}\n`,
  );
  writeFile(root, entry.caller, `export const DELETE = async () => ${entry.symbol};\n`);
  const { status, output } = run(root);
  assert.equal(status, 1);
  assert.match(output, /no longer both calls/);
});

test('fails when a cross-workspace declaration matches nothing', () => {
  const root = fixture();
  const [first] = CROSS_WORKSPACE_STATEMENTS;
  writeFile(root, first.file, 'export const nothing = null;\n');
  const { status, output } = run(root);
  assert.equal(status, 1);
  assert.match(output, /match nothing any more/);
});
