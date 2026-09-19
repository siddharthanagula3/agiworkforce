#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const IGNORED = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  'target',
  'coverage',
  '.cache',
  '.turbo',
  '.expo',
  'Pods',
  '.vercel',
  'dist-web',
  '.vscode-test',
  'playwright-report',
  'test-results',
]);
const SOURCE_EXT = new Set(['.ts', '.tsx']);

const INLINE_ADMIN_ROLE =
  /\[\s*(['"`])(owner|admin)\1\s*,\s*(['"`])(owner|admin)\3\s*\]\s*(?:as const\s*)?\.\s*includes\s*\(/;

const HELPER = 'isOrganizationAdminRole';
const HELPER_SOURCE = 'packages/contracts/types/src/enterprise/index.ts';

const MIGRATIONS_DIR = 'apps/web/db/neon';
const FIRST_PERMISSION_GRID_MIGRATION = 200;
const MIGRATION_FILE = /^(\d{4})_.+\.sql$/;
const SQL_ROLE_ARRAY_CHECK =
  /\bapp_has_org_role\s*\(|\bcurrent_app_org_role\s*\(\s*\)\s*(?:in|=)\s*[('"]/i;
const SQL_PERMISSION_HELPER = 'app_has_org_permission';

// Applied migrations cannot be edited, so their role-array policies are corrected by a later
// migration. This set may only shrink: an entry whose file no longer offends is an error.
const SQL_BASELINE = new Map([
  ['0227_payment_provider_subscription_history.sql', 'redefined by 0267'],
  ['0228_enterprise_commercial_agreements.sql', 'redefined by 0267'],
  ['0248_permission_namespaces_and_scim_group_membership_lock.sql', 'redefined by 0267'],
]);

function stripSqlComments(source) {
  return source.replace(/--[^\n]*/g, '');
}

function findRoleArrayChecksInMigration(source) {
  const hits = [];
  for (const [index, line] of stripSqlComments(source).split('\n').entries()) {
    if (SQL_ROLE_ARRAY_CHECK.test(line)) hits.push({ line: index + 1, text: line.trim() });
  }
  return hits;
}

function walk(dir, files = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue;
    if (IGNORED.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (SOURCE_EXT.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

const offenders = [];
for (const file of walk(root)) {
  const relative = path.relative(root, file);
  if (relative === HELPER_SOURCE) continue;
  const source = fs.readFileSync(file, 'utf8');
  const lines = source.split('\n');
  for (const [index, line] of lines.entries()) {
    if (INLINE_ADMIN_ROLE.test(line)) {
      offenders.push(`${relative}:${index + 1}  ${line.trim()}`);
    }
  }
}

const sqlOffenders = [];
const unusedBaseline = new Set(SQL_BASELINE.keys());
const migrationsAbs = path.join(root, MIGRATIONS_DIR);
if (fs.existsSync(migrationsAbs)) {
  for (const name of fs.readdirSync(migrationsAbs).sort()) {
    const match = MIGRATION_FILE.exec(name);
    if (!match || Number.parseInt(match[1], 10) < FIRST_PERMISSION_GRID_MIGRATION) continue;
    const source = fs.readFileSync(path.join(migrationsAbs, name), 'utf8');
    const hits = findRoleArrayChecksInMigration(source);
    if (hits.length > 0 && SQL_BASELINE.has(name)) {
      unusedBaseline.delete(name);
      continue;
    }
    for (const hit of hits) {
      sqlOffenders.push(`${MIGRATIONS_DIR}/${name}:${hit.line}  ${hit.text}`);
    }
  }
}

if (offenders.length > 0) {
  console.error(
    `check:org-role-checks, ${offenders.length} inline organization-admin role test(s) found.\n` +
      `Use ${HELPER}() from @agiworkforce/types so one edit changes every gate.\n`,
  );
  for (const offender of offenders) console.error(`  ${offender}`);
}

if (sqlOffenders.length > 0) {
  console.error(
    `check:org-role-checks, ${sqlOffenders.length} role-name check(s) in a migration from ` +
      `${String(FIRST_PERMISSION_GRID_MIGRATION).padStart(4, '0')} on.\n` +
      `A policy asks ${SQL_PERMISSION_HELPER}(organization_id, '<permission>') so custom, ` +
      `additional and group-granted roles are honoured (0200).\n`,
  );
  for (const offender of sqlOffenders) console.error(`  ${offender}`);
}

if (unusedBaseline.size > 0) {
  console.error(
    `check:org-role-checks, ${unusedBaseline.size} baseline entr(y/ies) no longer offend.\n` +
      'Delete them from SQL_BASELINE; the set may only shrink.\n',
  );
  for (const name of unusedBaseline) console.error(`  ${MIGRATIONS_DIR}/${name}`);
}

if (offenders.length > 0 || sqlOffenders.length > 0 || unusedBaseline.size > 0) process.exit(1);

console.log(
  'check:org-role-checks, every organization-admin gate goes through the shared helper, ' +
    `and every new policy asks for a permission (${SQL_BASELINE.size} baselined migration(s)).`,
);
