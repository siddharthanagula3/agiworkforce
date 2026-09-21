import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SERVES,
  classifyRoutes,
  operatorReachableRoutes,
  reachesSupportGate,
} from './check-support-access-coverage.mjs';

const OPERATOR_ROUTE = `
import { requirePlatformAdmin } from '@/lib/auth-guards';

async function handleGet(request: NextRequest) {
  await requirePlatformAdmin(request);
  return NextResponse.json({});
}
export const GET = withErrorHandler(handleGet);
`;

const MEMBER_ROUTE = `
export async function GET(request: NextRequest) {
  const { userId } = await getUserScopedDb(request);
  return NextResponse.json({});
}
`;

function reader(files) {
  return (rel) => files[rel] ?? '';
}

test('a route is operator reachable only when a handler reaches the guard', () => {
  const files = {
    'a/route.ts': OPERATOR_ROUTE,
    'b/route.ts': MEMBER_ROUTE,
    'c/route.ts': '// requirePlatformAdmin is named in a comment and nowhere else\n',
  };

  assert.deepEqual(operatorReachableRoutes(Object.keys(files), reader(files)), ['a/route.ts']);
});

test('an unclassified operator route fails', () => {
  const files = { 'a/route.ts': OPERATOR_ROUTE };

  const { unclassified } = classifyRoutes(['a/route.ts'], { routes: {} }, reader(files));

  assert.deepEqual(unclassified, ['a/route.ts']);
});

test('a content route that reaches no gate fails, and passes once it does', () => {
  const classification = {
    routes: { 'a/route.ts': { serves: 'customer_content', reason: 'dead job payloads' } },
  };

  assert.deepEqual(
    classifyRoutes(['a/route.ts'], classification, reader({ 'a/route.ts': OPERATOR_ROUTE }))
      .ungated,
    ['a/route.ts'],
  );
  assert.deepEqual(
    classifyRoutes(
      ['a/route.ts'],
      classification,
      reader({ 'a/route.ts': `${OPERATOR_ROUTE}\nreadOperatorContentUnderGrants({});` }),
    ).ungated,
    [],
  );
});

test('a platform-only route is not asked for a gate', () => {
  const classification = {
    routes: { 'a/route.ts': { serves: 'platform_only', reason: 'flag register' } },
  };

  assert.deepEqual(
    classifyRoutes(['a/route.ts'], classification, reader({ 'a/route.ts': OPERATOR_ROUTE }))
      .ungated,
    [],
  );
});

test('a classification without a known kind or without a reason fails', () => {
  const read = reader({ 'a/route.ts': OPERATOR_ROUTE });

  assert.deepEqual(
    classifyRoutes(
      ['a/route.ts'],
      { routes: { 'a/route.ts': { serves: 'maybe', reason: 'x' } } },
      read,
    ).malformed,
    ['a/route.ts'],
  );
  assert.deepEqual(
    classifyRoutes(
      ['a/route.ts'],
      { routes: { 'a/route.ts': { serves: 'platform_only', reason: '  ' } } },
      read,
    ).malformed,
    ['a/route.ts'],
  );
});

test('a classification for a route that is gone fails, so the list cannot outlive the tree', () => {
  const classification = {
    routes: { 'gone/route.ts': { serves: 'platform_only', reason: 'was a dashboard' } },
  };

  assert.deepEqual(classifyRoutes([], classification, reader({})).stale, ['gone/route.ts']);
});

test('every gate call the service offers is accepted', () => {
  assert.ok(reachesSupportGate('await assertSupportAccess({});'));
  assert.ok(reachesSupportGate('await withSupportAccess({}, read);'));
  assert.ok(reachesSupportGate('await readOperatorContentUnderGrants({});'));
  assert.equal(reachesSupportGate('await listDeadJobs(db, page);'), false);
});

test('the three classifications are the only ones there are', () => {
  assert.deepEqual(SERVES, ['customer_content', 'submitted_to_platform', 'platform_only']);
});
