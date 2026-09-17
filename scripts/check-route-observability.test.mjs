import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkAgainstRatchet,
  countByRule,
  hasStructuredLogging,
  isApiRoute,
  scanRoute,
} from './lib/route-observability.mjs';

const ROUTE = 'apps/web/app/api/invoices/route.ts';

const UNLOGGED = `import 'server-only';
import { NextResponse } from 'next/server';

export async function GET() {
  const rows = await listInvoices();
  return NextResponse.json(rows);
}
`;

test('an API route that logs nothing is reported', () => {
  assert.deepEqual(
    scanRoute(UNLOGGED, ROUTE).map((f) => f.rule),
    ['unlogged-route'],
  );
});

test('the logger import satisfies the rule', () => {
  assert.ok(hasStructuredLogging("import { logger } from '@/lib/logger';"));
  assert.deepEqual(scanRoute(`import { logger } from '@/lib/logger';\n${UNLOGGED}`, ROUTE), []);
});

test('a handler wrapped in withErrorHandler satisfies the rule, because the wrapper logs', () => {
  assert.ok(hasStructuredLogging('export const GET = withErrorHandler(async () => {});'));
});

test('a console call inside a route is reported even when the route also logs', () => {
  const both = `import { logger } from '@/lib/logger';\nexport async function GET() { console.error('boom'); }`;
  assert.deepEqual(
    scanRoute(both, ROUTE).map((f) => f.rule),
    ['console-in-route'],
  );
});

test('logger.error on its own satisfies the rule without an import line', () => {
  assert.ok(hasStructuredLogging('export async function GET() { logger.error("x"); }'));
});

test('a mention of the logger in a comment does not satisfy the rule', () => {
  assert.equal(
    hasStructuredLogging("// import { logger } from '@/lib/logger';\nexport const A = 1;"),
    false,
  );
});

test('only app/api route files are in scope', () => {
  assert.ok(isApiRoute('apps/web/app/api/invoices/route.ts'));
  assert.ok(isApiRoute('apps/web/app/api/a/b/[id]/route.ts'));
  assert.ok(!isApiRoute('apps/web/app/invoices/page.tsx'));
  assert.ok(!isApiRoute('apps/web/app/api/invoices/helpers.ts'));
  assert.ok(!isApiRoute('apps/cli/src/route.ts'));
  assert.deepEqual(scanRoute(UNLOGGED, 'apps/web/app/api/invoices/helpers.ts'), []);
});

test('the ratchet fails on growth and on an unmeasured rule', () => {
  const counts = countByRule([{ file: ROUTE, rule: 'unlogged-route' }]);
  assert.equal(
    checkAgainstRatchet(counts, { maxFindings: { 'unlogged-route': 1, 'console-in-route': 0 } })
      .length,
    0,
  );
  assert.equal(
    checkAgainstRatchet(counts, { maxFindings: { 'unlogged-route': 0, 'console-in-route': 0 } })
      .length,
    1,
  );
  assert.equal(checkAgainstRatchet(counts, { maxFindings: {} }).length, 2);
});
