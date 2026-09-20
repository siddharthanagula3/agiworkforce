import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  MINIMUM_CODE_BITS,
  REPO_ROOT,
  TERMINAL_STATUSES,
  checkDeviceAuthGrant,
  grantStatuses,
  userCodeEntropyBits,
} from './check-device-auth-grant.mjs';

const roots = [];

const MIGRATION = [
  'create table if not exists public.device_authorization_codes (',
  '  id uuid primary key,',
  "  status text not null default 'pending'",
  "    check (status = any (array['pending', 'approved', 'denied', 'expired', 'consumed']))",
  ');',
  '',
  'create table if not exists public.background_jobs (',
  "  status text not null check (status = any (array['queued', 'failed', 'succeeded']))",
  ');',
  '',
  'alter table public.device_authorization_codes',
  '  drop constraint if exists device_authorization_codes_status_check,',
  '  add constraint device_authorization_codes_status_check',
  "  check (status = any (array['pending', 'approved', 'denied', 'expired', 'consumed', 'revoked']));",
].join('\n');

const VALIDATIONS = [
  "export const CLI_USER_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';",
  'export const CLI_USER_CODE_PATTERN = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;',
].join('\n');

const GENERATOR = "import crypto from 'node:crypto';\nconst b = crypto.randomBytes(8);\n";

const TOKEN_ROUTE = [
  "await withRateLimit(request, 'device-poll');",
  "if (record.status === 'denied' || record.status === 'revoked') return deny();",
  "if (record.status === 'consumed') return gone();",
  "if (record.status === 'expired') return gone();",
  "if (record.status === 'pending') return pending();",
  "if (record.status !== 'approved') return deny();",
  "const rows = await tx.query(`UPDATE device_authorization_codes SET status = 'consumed' WHERE device_id = $1 AND status = 'approved' RETURNING status`);",
  "return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });",
].join('\n');

const OTHER_ROUTE =
  "await withRateLimit(request, 'device-link');\n" +
  "return NextResponse.json({}, { headers: { 'Cache-Control': 'no-store' } });\n";

function tree(overrides = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'device-auth-grant-'));
  roots.push(root);
  const files = {
    'db/0001_devices.sql': MIGRATION,
    'lib/validations.ts': VALIDATIONS,
    'lib/device-codes.ts': GENERATOR,
    'api/device/token/route.ts': TOKEN_ROUTE,
    'api/device/code/route.ts': OTHER_ROUTE,
    ...overrides,
  };
  for (const [relativePath, contents] of Object.entries(files)) {
    if (contents === null) continue;
    const absolute = path.join(root, relativePath);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents);
  }
  return root;
}

function check(overrides = {}, options = {}) {
  return checkDeviceAuthGrant(tree(overrides), {
    roots: ['api/device'],
    migrations: 'db',
    validations: 'lib/validations.ts',
    generator: 'lib/device-codes.ts',
    tokenRoute: 'api/device/token/route.ts',
    ...options,
  });
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('a grant that answers for every state it can be in passes', () => {
  const { errors, report } = check();
  assert.deepEqual(errors, []);
  assert.equal(report.routes, 2);
  assert.equal(report.statuses, 6);
});

test('the states come from the migrations, and only from the grant table', () => {
  const statuses = grantStatuses(tree(), 'db', 'device_authorization_codes');
  assert.deepEqual(statuses, ['approved', 'consumed', 'denied', 'expired', 'pending', 'revoked']);
  assert.ok(!statuses.includes('failed'), 'read the status vocabulary of another table');
});

test('a state the route decides on that the schema can never hold fails', () => {
  const { errors } = check({
    'api/device/token/route.ts': TOKEN_ROUTE.replace(
      "record.status === 'consumed'",
      "record.status === 'consummed'",
    ),
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /'consummed'/);
  assert.match(errors[0], /that branch is dead/);
});

test('a route with no refusal for a code that is not approved fails', () => {
  const { errors } = check({
    'api/device/token/route.ts': TOKEN_ROUTE.replace(
      "if (record.status !== 'approved') return deny();",
      '',
    ),
  });
  assert.match(errors.join('\n'), /no refusal for a code that is not approved/);
});

test('a terminal state that is neither named nor caught fails, one error per state', () => {
  const bare = [
    "await withRateLimit(request, 'device-poll');",
    "if (record.status === 'pending') return pending();",
    "const rows = await tx.query(`UPDATE device_authorization_codes SET status = 'consumed' WHERE device_id = $1 AND status = 'approved' RETURNING status`);",
    "return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });",
  ].join('\n');
  const { errors } = check({ 'api/device/token/route.ts': bare });

  for (const status of TERMINAL_STATUSES) {
    assert.match(
      errors.join('\n'),
      new RegExp(`'${status}' is a state a code never returns from`),
      `${status} may be left unanswered`,
    );
  }
});

test('a route that cannot tell a live code from a dead one fails', () => {
  const { errors } = check({
    'api/device/token/route.ts': TOKEN_ROUTE.replace(
      "if (record.status === 'pending') return pending();",
      '',
    ),
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /told the same thing/);
});

test('spending a code without approved as the condition fails', () => {
  const { errors } = check({
    'api/device/token/route.ts': TOKEN_ROUTE.replace(
      "WHERE device_id = $1 AND status = 'approved'",
      'WHERE device_id = $1',
    ),
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /both mint a token/);
});

test('a grant route that throttles nothing fails', () => {
  const { errors } = check({
    'api/device/code/route.ts': OTHER_ROUTE.replace(
      "await withRateLimit(request, 'device-link');\n",
      '',
    ),
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /throttles nothing/);
});

test('a grant route that lets a code be cached fails', () => {
  const { errors } = check({
    'api/device/code/route.ts': "await withRateLimit(request, 'device-link');\nreturn json({});\n",
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /without no-store/);
});

test('a user code short enough to guess fails, and the bits are computed', () => {
  const { errors } = check({
    'lib/validations.ts': [
      "export const CLI_USER_CODE_ALPHABET = 'ABCDEFGH';",
      'export const CLI_USER_CODE_PATTERN = /^[A-Z]{4}$/;',
    ].join('\n'),
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], new RegExp(`at least ${MINIMUM_CODE_BITS}`));

  const entropy = userCodeEntropyBits(VALIDATIONS);
  assert.equal(entropy.characters, 8);
  assert.ok(entropy.bits > MINIMUM_CODE_BITS, `${entropy.bits} bits`);
});

test('a user-code alphabet with characters a person mistypes fails', () => {
  const { errors } = check({
    'lib/validations.ts': VALIDATIONS.replace(
      'ABCDEFGHJKMNPQRSTUVWXYZ23456789',
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    ),
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /mistypes/);
});

test('a user code drawn from Math.random fails', () => {
  const { errors } = check({
    'lib/device-codes.ts': 'const index = Math.floor(Math.random() * 31);\n',
  });
  assert.equal(errors.length, 2);
  assert.match(errors.join('\n'), /Math\.random/);
  assert.match(errors.join('\n'), /platform random source/);
});

test('a tree with no grant route fails rather than passing empty', () => {
  const { errors } = check({}, { roots: ['api/nothing'] });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /no route found/);
});

test('the repository itself passes, with a real grant swept', () => {
  const { errors, report } = checkDeviceAuthGrant(REPO_ROOT);
  assert.deepEqual(errors, []);
  assert.ok(report.routes >= 5, `${report.routes} grant routes`);
  assert.ok(report.statuses >= 5, `${report.statuses} code states`);
  assert.ok(report.codeBits >= MINIMUM_CODE_BITS, `${report.codeBits} bits`);
});
