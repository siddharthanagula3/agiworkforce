import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ENTRY_POINT,
  OWN_ROW_OPERATIONS,
  OWN_ROW_READERS,
  REPO_ROOT,
  checkEntitlementEntryPoint,
  decidesFromRawPlan,
} from './check-entitlement-entry-point.mjs';

const roots = [];

function fixture({ edits = {}, added = {} } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'agi-entitlement-entry-point-'));
  roots.push(root);
  const files = [ENTRY_POINT, ...Object.keys(OWN_ROW_OPERATIONS), ...Object.keys(OWN_ROW_READERS)];
  for (const relative of files) {
    const destination = path.join(root, relative);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(path.join(REPO_ROOT, relative), destination);
  }
  for (const [relative, edit] of Object.entries(edits)) {
    const absolute = path.join(root, relative);
    writeFileSync(absolute, edit(readFileSync(absolute, 'utf8')));
  }
  for (const [relative, source] of Object.entries(added)) {
    const absolute = path.join(root, relative);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, source);
  }
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const PRIVATE_RESOLVER = `import { canUseBillingPlanCapability } from '@agiworkforce/types';
export async function canExport(db, userId) {
  const [row] = await db.query('select plan_tier from public.subscriptions where user_id = $1', [userId]);
  return canUseBillingPlanCapability(row?.plan_tier, 'agi_work');
}
`;

test('the tree as it stands resolves every entitlement through the entry point', () => {
  assert.deepEqual(checkEntitlementEntryPoint(REPO_ROOT), []);
  assert.deepEqual(checkEntitlementEntryPoint(fixture()), []);
});

test('a module that decides from a raw subscriptions plan fails', () => {
  const root = fixture({ added: { 'apps/web/lib/services/export-gate.ts': PRIVATE_RESOLVER } });
  assert.ok(
    checkEntitlementEntryPoint(root).some((entry) =>
      /export-gate\.ts reads plan_tier from subscriptions and decides/.test(entry),
    ),
  );
});

test('reading the own row outside the recorded operations fails', () => {
  const root = fixture({
    added: {
      'apps/web/app/api/example/route.ts':
        'export async function GET() { return SubscriptionService.getSubscription(db, userId); }\n',
    },
  });
  assert.ok(
    checkEntitlementEntryPoint(root).some((entry) =>
      /example\/route\.ts calls SubscriptionService\.getSubscription/.test(entry),
    ),
  );
});

test('a recorded operation that stops reading the raw plan fails until its record goes', () => {
  const file = 'apps/web/lib/services/export-gate.ts';
  const operations = { ...OWN_ROW_OPERATIONS, [file]: 'charges the row the user pays for today' };
  const stale = fixture({
    added: { [file]: "export const nothing = 'no plan read here';\n" },
  });
  assert.ok(
    checkEntitlementEntryPoint(stale, { operations }).some((entry) =>
      /export-gate\.ts no longer decides from a raw plan/.test(entry),
    ),
  );
  const live = fixture({ added: { [file]: PRIVATE_RESOLVER } });
  assert.deepEqual(checkEntitlementEntryPoint(live, { operations }), []);
});

test('the entry point losing a resolver fails', () => {
  const root = fixture({
    edits: {
      [ENTRY_POINT]: (source) =>
        source.replace('export async function resolveEntitledPlanTier', 'async function hidden'),
    },
  });
  assert.ok(
    checkEntitlementEntryPoint(root).some((entry) =>
      /no longer exports resolveEntitledPlanTier/.test(entry),
    ),
  );
});

test('a plan read alone, or a predicate alone, is not a private resolution', () => {
  assert.equal(decidesFromRawPlan(PRIVATE_RESOLVER), true);
  assert.equal(
    decidesFromRawPlan("await db.query('select plan_tier from subscriptions where id = $1');"),
    false,
  );
  assert.equal(decidesFromRawPlan("canUseBillingPlanCapability(plan, 'agi_work');"), false);
});
