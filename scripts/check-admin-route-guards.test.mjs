import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ADMIN_ROOT,
  adminRoutes,
  auditRouteGuards,
  compareFindings,
  exportedMethods,
  handlerBody,
} from './lib/admin-route-guards.mjs';

const GOOD_ROUTE = `
import { requirePlatformAdmin } from '@/lib/auth-guards';

async function handlePost(request: NextRequest): Promise<Response> {
  const csrfResponse = await requireCsrfToken(request);
  const limited = await withRateLimit(request, 'admin-operator');
  await requirePlatformAdmin(request);
  await recordAuditEvent({ eventType: 'admin_action' });
  return NextResponse.json({});
}

export const POST = withErrorHandler(handlePost);
`;

function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-route-guards-'));
  for (const [rel, source] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, source);
  }
  return root;
}

function rules(root) {
  return auditRouteGuards(root, adminRoutes(root)).map((f) => `${f.method}::${f.rule}`);
}

test('the routes come from the tree, tests excluded', () => {
  const root = tree({
    [`${ADMIN_ROOT}/one/route.ts`]: GOOD_ROUTE,
    [`${ADMIN_ROOT}/two/__tests__/route.ts`]: GOOD_ROUTE,
  });

  assert.deepEqual(adminRoutes(root), [`${ADMIN_ROOT}/one/route.ts`]);
});

test('a handler with every control is clean', () => {
  assert.deepEqual(rules(tree({ [`${ADMIN_ROOT}/one/route.ts`]: GOOD_ROUTE })), []);
});

test('a return type carrying braces and semicolons does not hide the body', () => {
  const source = `
async function authorize(
  request: NextRequest,
): Promise<{ userId: string; key: string } | Response> {
  await requirePlatformAdmin(request);
  await withRateLimit(request, 'admin-operator');
  await requireCsrfToken(request);
  await recordAuditEvent({});
  return { userId: 'a', key: 'b' };
}

async function handlePut(request: NextRequest) {
  const authorized = await authorize(request);
  return NextResponse.json({});
}

export const PUT = withErrorHandler(handlePut);
`;

  assert.ok(handlerBody(source, 'PUT').includes('requirePlatformAdmin'));
  assert.deepEqual(rules(tree({ [`${ADMIN_ROOT}/one/route.ts`]: source })), []);
});

test('a handler with no authorization call is reported', () => {
  const root = tree({
    [`${ADMIN_ROOT}/one/route.ts`]: GOOD_ROUTE.replace('await requirePlatformAdmin(request);', ''),
  });

  assert.deepEqual(rules(root), ['POST::no-authorization']);
});

test('a handler with no rate limit is reported', () => {
  const root = tree({
    [`${ADMIN_ROOT}/one/route.ts`]: GOOD_ROUTE.replace(
      "const limited = await withRateLimit(request, 'admin-operator');",
      '',
    ),
  });

  assert.deepEqual(rules(root), ['POST::no-rate-limit']);
});

test('a write with no CSRF token and no audit entry is reported', () => {
  const root = tree({
    [`${ADMIN_ROOT}/one/route.ts`]: GOOD_ROUTE.replace(
      'const csrfResponse = await requireCsrfToken(request);',
      '',
    ).replace("await recordAuditEvent({ eventType: 'admin_action' });", ''),
  });

  assert.deepEqual(rules(root).sort(), ['POST::no-audit', 'POST::no-csrf']);
});

test('a read is not asked for a CSRF token or an audit entry', () => {
  const source = `
async function handleGet(request: NextRequest) {
  await withRateLimit(request, 'admin-operator');
  await requirePlatformAdmin(request);
  return NextResponse.json({});
}
export const GET = withErrorHandler(handleGet);
`;

  assert.deepEqual(rules(tree({ [`${ADMIN_ROOT}/one/route.ts`]: source })), []);
});

test('an audit the service performs counts, one import deep', () => {
  const root = tree({
    'apps/web/lib/flag-admin-service.ts': "recordAuditEvent({ eventType: 'x' });",
    [`${ADMIN_ROOT}/one/route.ts`]: `
import { setFlagOverride } from '@/lib/flag-admin-service';

async function handlePost(request: NextRequest) {
  await requireCsrfToken(request);
  await withRateLimit(request, 'admin-operator');
  await requirePlatformAdmin(request);
  await setFlagOverride({});
  return NextResponse.json({});
}
export const POST = withErrorHandler(handlePost);
`,
  });

  assert.deepEqual(rules(root), []);
});

test('authorization may not move into the service the way the audit may', () => {
  const root = tree({
    'apps/web/lib/flag-admin-service.ts':
      "recordAuditEvent({}); requirePlatformAdmin(request); withRateLimit(request, 'x');",
    [`${ADMIN_ROOT}/one/route.ts`]: `
import { setFlagOverride } from '@/lib/flag-admin-service';

async function handlePost(request: NextRequest) {
  await requireCsrfToken(request);
  await setFlagOverride({});
  return NextResponse.json({});
}
export const POST = withErrorHandler(handlePost);
`,
  });

  assert.deepEqual(rules(root).sort(), ['POST::no-authorization', 'POST::no-rate-limit']);
});

test('a route file exporting no handler is reported', () => {
  const root = tree({ [`${ADMIN_ROOT}/one/route.ts`]: "export const runtime = 'nodejs';" });

  assert.deepEqual(rules(root), ['-::no-handler']);
});

test('every exported method is checked, not only the first', () => {
  const source = `${GOOD_ROUTE}
export async function DELETE(request: NextRequest) {
  return NextResponse.json({});
}
`;

  assert.deepEqual(exportedMethods(source).sort(), ['DELETE', 'POST']);
  assert.deepEqual(rules(tree({ [`${ADMIN_ROOT}/one/route.ts`]: source })).sort(), [
    'DELETE::no-audit',
    'DELETE::no-authorization',
    'DELETE::no-csrf',
    'DELETE::no-rate-limit',
  ]);
});

test('an accepted exception needs a reason, and fails once it no longer applies', () => {
  const finding = [{ route: 'a/route.ts', method: 'POST', rule: 'no-audit' }];
  const key = 'a/route.ts::POST::no-audit';

  assert.deepEqual(compareFindings(finding, { accepted: { [key]: '' } }).missingReason, [key]);
  assert.deepEqual(compareFindings(finding, { accepted: { [key]: 'why' } }).unexpected, []);
  assert.deepEqual(compareFindings([], { accepted: { [key]: 'why' } }).stale, [key]);
  assert.deepEqual(compareFindings(finding, { accepted: {} }).unexpected, [key]);
});
