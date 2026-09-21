import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  PERMISSIONS_NO_DECISION_ASKS,
  PRIMARY_OWNER_ROLE_READS,
  RLS_ENFORCED_ROUTES,
  SELF_SERVICE_ROUTES,
  readCanonicalPermissions,
} from './check-org-permissions.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const script = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'check-org-permissions.mjs',
);

const PERMISSIONS_CONTRACT = `
export const ADMIN_PERMISSION_AREAS = ['members', 'roles'] as const;
export const FEATURE_ORGANIZATION_PERMISSIONS = ['feature.content.view'] as const;
export const LEGACY_ORGANIZATION_PERMISSION_ALIASES: Readonly<Record<string, string>> =
  Object.freeze({
  'content.read': 'feature.content.view',
  'members.manage': 'admin.members.manage',
  'roles.manage': 'admin.roles.manage',
});
`;

const PERMISSION_SERVICE = `
import { getNeonDb } from '@/lib/server/neon-db';
export async function resolveOrganizationPermissions(organizationId, userId) {
  return new Set(await getNeonDb().query('select 1', [organizationId, userId]));
}
export async function requireMemberPermission(organizationId, userId, permission, message) {
  const held = await resolveOrganizationPermissions(organizationId, userId);
  if (!held.has(permission)) throw new Error(message);
  return held;
}
`;

const NEON_DB = `export function getNeonDb() { return { query: async () => [] }; }\n`;

function writeFile(root, relative, contents) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'org-permissions-'));
  writeFile(root, 'packages/contracts/types/src/enterprise/permissions.ts', PERMISSIONS_CONTRACT);
  writeFile(root, 'apps/web/lib/services/organization-permission-service.ts', PERMISSION_SERVICE);
  writeFile(root, 'apps/web/lib/server/neon-db.ts', NEON_DB);
  writeFile(
    root,
    'apps/web/app/api/settings/organization/retention/route.ts',
    `
import { requireMemberPermission } from '@/lib/services/organization-permission-service';
async function handle(request) {
  await requireMemberPermission('org', 'user', 'policy.manage', 'no');
  await requireMemberPermission('org', 'user', 'members.manage', 'no');
  await requireMemberPermission('org', 'user', 'roles.manage', 'no');
  await requireMemberPermission('org', 'user', 'admin.roles.view', 'no');
}
export const PUT = handle;
`,
  );
  // Every declared exemption gets a file, so a stale declaration is the only
  // reason the stale check can fire in the fixture.
  for (const relative of SELF_SERVICE_ROUTES.keys()) {
    writeFile(root, path.join('apps/web', relative), 'export const POST = async () => null;\n');
  }
  for (const [relative, table] of RLS_ENFORCED_ROUTES) {
    writeFile(
      root,
      path.join('apps/web', relative),
      `
import { getUserScopedDb } from '@/lib/server/rls-db';
async function handle(request) {
  const { db } = await getUserScopedDb(request);
  await db.query('delete from public.${table}');
}
export const DELETE = handle;
`,
    );
    writeFile(
      root,
      `apps/web/db/neon/0001_${table}.sql`,
      `create policy ${table}_owner_delete\n  on public.${table} for delete to app_rls\n  using (public.app_org_resource_is_manageable(organization_id));\n`,
    );
  }
  writeFile(root, 'apps/web/lib/server/rls-db.ts', 'export async function getUserScopedDb() {}\n');
  for (const relative of PRIMARY_OWNER_ROLE_READS.keys()) {
    writeFile(root, relative, "export const isOwner = (m) => m.role === 'owner';\n");
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

test('passes on a tree where every mutating route asks the grid', () => {
  const root = fixture();
  const { status, output } = run(root);
  assert.equal(status, 0, output);
  assert.match(output, /3 organization-scoped mutating route\(s\) each ask the permission grid/);
  assert.match(output, /3 self-service route\(s\) declared/);
});

test('fails on a mutating route that checks nothing', () => {
  const root = fixture();
  writeFile(
    root,
    'apps/web/app/api/settings/organization/spend-limit/route.ts',
    'export const PUT = async () => null;\n',
  );
  const { status, output } = run(root);
  assert.equal(status, 1);
  assert.match(output, /reach no permission check/);
  assert.match(output, /spend-limit/);
});

test('fails on a route that resolves permissions and never acts on them', () => {
  const root = fixture();
  writeFile(
    root,
    'apps/web/app/api/settings/organization/spend-limit/route.ts',
    `
import { resolveOrganizationPermissions } from '@/lib/services/organization-permission-service';
async function handle() {
  await resolveOrganizationPermissions('org', 'user');
}
export const PUT = handle;
`,
  );
  const { status, output } = run(root);
  assert.equal(status, 1);
  assert.match(output, /never act on them/);
});

test('accepts a route that tests the set it resolved', () => {
  const root = fixture();
  writeFile(
    root,
    'apps/web/app/api/settings/organization/spend-limit/route.ts',
    `
import { resolveOrganizationPermissions } from '@/lib/services/organization-permission-service';
async function handle() {
  const held = await resolveOrganizationPermissions('org', 'user');
  if (!held.has('policy.manage')) throw new Error('no');
}
export const PUT = handle;
`,
  );
  const { status, output } = run(root);
  assert.equal(status, 0, output);
});

test('fails on a permission id the registry does not define', () => {
  const root = fixture();
  writeFile(
    root,
    'apps/web/app/api/settings/organization/spend-limit/route.ts',
    `
import { requireMemberPermission } from '@/lib/services/organization-permission-service';
async function handle() {
  await requireMemberPermission('org', 'user', 'admin.invented.manage', 'no');
}
export const PUT = handle;
`,
  );
  const { status, output } = run(root);
  assert.equal(status, 1);
  assert.match(output, /admin\.invented\.manage/);
});

test('fails when a route decides by comparing a role name', () => {
  const root = fixture();
  writeFile(
    root,
    'apps/web/app/api/settings/organization/spend-limit/route.ts',
    `
import { requireMemberPermission } from '@/lib/services/organization-permission-service';
async function handle(membership) {
  await requireMemberPermission('org', 'user', 'policy.manage', 'no');
  if (membership.role === 'admin') return null;
}
export const PUT = handle;
`,
  );
  const { status, output } = run(root);
  assert.equal(status, 1);
  assert.match(output, /decide by comparing a role name/);
});

test('fails when a declared row-policy route loses its policy', () => {
  const root = fixture();
  for (const table of RLS_ENFORCED_ROUTES.values()) {
    fs.rmSync(path.join(root, `apps/web/db/neon/0001_${table}.sql`));
  }
  const { status, output } = run(root);
  assert.equal(status, 1);
  assert.match(output, /no write policy that asks the grid/);
});

test('fails when a declared exemption names a route that is gone', () => {
  const root = fixture();
  const [first] = [...SELF_SERVICE_ROUTES.keys()];
  fs.rmSync(path.join(root, 'apps/web', first));
  const { status, output } = run(root);
  assert.equal(status, 1);
  assert.match(output, /name no mutating route any more/);
});

test('fails when a declared Primary Owner read stops comparing a role', () => {
  const root = fixture();
  const [first] = [...PRIMARY_OWNER_ROLE_READS.keys()];
  writeFile(root, first, 'export const isOwner = () => false;\n');
  const { status, output } = run(root);
  assert.equal(status, 1);
  assert.match(output, /no longer compare a role/);
});

test('fails on a permission the role editor offers that no decision asks', () => {
  const root = fixture();
  const route = 'apps/web/app/api/settings/organization/retention/route.ts';
  writeFile(
    root,
    route,
    fs.readFileSync(path.join(root, route), 'utf8').replace(/'roles\.manage'/, "'policy.manage'"),
  );
  const { status, output } = run(root);
  assert.equal(status, 1);
  assert.match(output, /no server decision asks/);
  assert.match(output, /admin\.roles\.manage/);
});

test('a legacy key counts as asking for the permission it is an alias of', () => {
  const root = fixture();
  const { status, output } = run(root);
  assert.equal(status, 0, output);
  assert.doesNotMatch(output, /admin\.members\.manage/);
});

test('a declaration goes stale as soon as a decision does ask for it', () => {
  const root = fixture();
  const route = 'apps/web/app/api/settings/organization/retention/route.ts';
  writeFile(
    root,
    route,
    `${fs.readFileSync(path.join(root, route), 'utf8')}
export const PATCH = async () => {
  await requireMemberPermission('org', 'user', 'admin.members.view', 'no');
};
`,
  );
  const { status, output } = run(root);
  assert.equal(status, 1);
  assert.match(output, /declared as consulted by nothing now are/);
  assert.match(output, /admin\.members\.view/);
});

test('the canonical list is re-derived from the contract, not held here', () => {
  const { canonical, alias } = readCanonicalPermissions(
    path.join(REPO_ROOT, 'packages/contracts/types/src/enterprise/permissions.ts'),
  );
  assert.equal(canonical.length, 30);
  assert.equal(alias.get('workspace.delete'), 'admin.lifecycle.manage');
  for (const permission of PERMISSIONS_NO_DECISION_ASKS.keys()) {
    assert.ok(canonical.includes(permission), `${permission} is not a canonical id`);
  }
});

test('every declaration says what governs the act instead', () => {
  for (const [permission, reason] of PERMISSIONS_NO_DECISION_ASKS) {
    assert.ok(reason.length > 60, `${permission}: the reason has to be stated in full`);
  }
});

test('asking an area for its level consults both halves of that area', () => {
  const root = fixture();
  const route = 'apps/web/app/api/settings/organization/retention/route.ts';
  writeFile(
    root,
    route,
    fs
      .readFileSync(path.join(root, route), 'utf8')
      .replace(
        /await requireMemberPermission\('org', 'user', 'admin\.roles\.view', 'no'\);/,
        "const level = adminPermissionLevel(new Set(), 'roles');",
      ),
  );
  const { status, output } = run(root);
  assert.equal(status, 0, output);
});
