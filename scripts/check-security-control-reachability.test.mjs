import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BASELINE_PATH,
  declarationChunks,
  exportedNames,
  importedBindings,
  isControlModule,
  isControlName,
  matchesControlStem,
} from './check-security-control-reachability.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const guard = path.join(repoRoot, 'scripts/check-security-control-reachability.mjs');

const CONTROL_MODULE = `
import { logger } from '@/lib/logger';

export function readRetentionWindow(days: number): number {
  return days;
}

function auditSkip(ids: readonly string[]): void {
  logger.warn({ ids }, 'skipped');
}

export function assertNothingDropped(mandatory: readonly string[], swept: readonly string[]): void {
  const dropped = mandatory.filter((id) => !swept.includes(id));
  if (dropped.length > 0) {
    auditSkip(dropped);
    throw new Error('dropped');
  }
}

export function purgeExpiredRows(ids: readonly string[]): number {
  assertNothingDropped(ids, ids);
  return ids.length;
}
`;

const ROUTE = `
import { purgeExpiredRows } from '@/lib/security/retention-sweep';

export async function GET() {
  return Response.json({ purged: purgeExpiredRows([]) });
}
`;

const ROUTE_CALLING_THE_HELPER = `
import { assertNothingDropped } from '@/lib/security/retention-sweep';

export async function GET() {
  assertNothingDropped([], []);
  return Response.json({});
}
`;

const TEST_FILE = `
import { assertNothingDropped, purgeExpiredRows } from '@/lib/security/retention-sweep';

it('throws', () => {
  expect(() => assertNothingDropped(['a'], [])).toThrow();
  expect(purgeExpiredRows([])).toBe(0);
});
`;

function withTree(files, run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'control-reachability-'));
  try {
    for (const [name, contents] of Object.entries(files)) {
      if (contents === null) continue;
      const full = path.join(root, name);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, contents);
    }
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function runGuard(root) {
  try {
    return { code: 0, output: execFileSync('node', [guard, '--root', root], { encoding: 'utf8' }) };
  } catch (error) {
    return { code: error.status ?? 1, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

const baseline = (entries) => JSON.stringify({ unreachable: entries }, null, 2);

test('a control nothing calls fails, and names the control', () => {
  withTree({ 'apps/web/lib/security/retention-sweep.ts': CONTROL_MODULE }, (root) => {
    const { code, output } = runGuard(root);
    assert.equal(code, 1);
    assert.match(output, /retention-sweep\.ts::purgeExpiredRows/);
    assert.match(output, /nothing in production reaches it/);
  });
});

test('the same control passes once a route calls it', () => {
  withTree(
    {
      'apps/web/lib/security/retention-sweep.ts': CONTROL_MODULE,
      'apps/web/app/api/cron/sweep/route.ts': ROUTE,
    },
    (root) => {
      const { code, output } = runGuard(root);
      assert.equal(code, 0, output);
      assert.match(output, /2 exported controls, 0 without a production caller/);
    },
  );
});

test('an exported helper behind a reachable entry point is not a finding', () => {
  withTree(
    {
      'apps/web/lib/security/retention-sweep.ts': CONTROL_MODULE,
      'apps/web/app/api/cron/sweep/route.ts': ROUTE,
    },
    (root) => assert.doesNotMatch(runGuard(root).output, /assertNothingDropped/),
  );
});

test('reaching the helper does not reach the entry point that calls it', () => {
  withTree(
    {
      'apps/web/lib/security/retention-sweep.ts': CONTROL_MODULE,
      'apps/web/app/api/cron/sweep/route.ts': ROUTE_CALLING_THE_HELPER,
    },
    (root) => {
      const { code, output } = runGuard(root);
      assert.equal(code, 1);
      assert.match(output, /::purgeExpiredRows/);
      assert.doesNotMatch(output, /::assertNothingDropped/);
    },
  );
});

test('a test is not a caller, and the report says the tests reach it', () => {
  withTree(
    {
      'apps/web/lib/security/retention-sweep.ts': CONTROL_MODULE,
      'apps/web/lib/security/__tests__/retention-sweep.test.ts': TEST_FILE,
    },
    (root) => {
      const { code, output } = runGuard(root);
      assert.equal(code, 1);
      assert.match(output, /though its own tests do/);
    },
  );
});

test('a namespace import counts as a caller when it names the control', () => {
  withTree(
    {
      'apps/web/lib/security/retention-sweep.ts': CONTROL_MODULE,
      'scripts/sweep.mjs': `
const { purgeExpiredRows, assertNothingDropped } = await import(
  '../apps/web/lib/security/retention-sweep.ts'
);
assertNothingDropped([], []);
purgeExpiredRows([]);
`,
    },
    (root) => assert.equal(runGuard(root).code, 0),
  );
});

test('a re-export chain carries reachability back to the module that declares it', () => {
  withTree(
    {
      'apps/web/lib/security/retention-sweep.ts': CONTROL_MODULE,
      'apps/web/lib/server/retention/index.ts': `export { purgeExpiredRows, assertNothingDropped } from '@/lib/security/retention-sweep';`,
      'apps/web/app/api/cron/sweep/route.ts': `
import { purgeExpiredRows, assertNothingDropped } from '@/lib/server/retention';

export async function GET() {
  assertNothingDropped([], []);
  return Response.json({ purged: purgeExpiredRows([]) });
}
`,
    },
    (root) => assert.equal(runGuard(root).code, 0),
  );
});

test('a reader nobody calls is not a finding', () => {
  withTree(
    {
      'apps/web/lib/security/retention-sweep.ts': `
export function readRetentionWindow(days: number): number {
  return days;
}

export function purgeExpiredRows(): number {
  return readRetentionWindow(0);
}
`,
      'apps/web/app/api/cron/sweep/route.ts': ROUTE,
    },
    (root) => {
      const { code, output } = runGuard(root);
      assert.equal(code, 0, output);
      assert.doesNotMatch(output, /readRetentionWindow/);
    },
  );
});

test('a baseline entry without the control it promises and its owner fails', () => {
  withTree(
    {
      'apps/web/lib/security/retention-sweep.ts': CONTROL_MODULE,
      [BASELINE_PATH]: baseline([
        { module: 'apps/web/lib/security/retention-sweep.ts', name: 'purgeExpiredRows' },
      ]),
    },
    (root) => {
      const { code, output } = runGuard(root);
      assert.equal(code, 1);
      assert.match(output, /needs both the control it promises and the file that owes the call/);
    },
  );
});

test('a complete baseline entry excuses the finding', () => {
  withTree(
    {
      'apps/web/lib/security/retention-sweep.ts': CONTROL_MODULE,
      [BASELINE_PATH]: baseline([
        {
          module: 'apps/web/lib/security/retention-sweep.ts',
          name: 'purgeExpiredRows',
          control: 'rows past the retention window are deleted',
          owner: 'apps/web/app/api/cron/sweep/route.ts',
        },
        {
          module: 'apps/web/lib/security/retention-sweep.ts',
          name: 'assertNothingDropped',
          control: 'a run that skips a mandatory workspace fails',
          owner: 'apps/web/app/api/cron/sweep/route.ts',
        },
      ]),
    },
    (root) => assert.equal(runGuard(root).code, 0),
  );
});

test('a baseline entry that has since been wired fails, so the list can only shrink', () => {
  withTree(
    {
      'apps/web/lib/security/retention-sweep.ts': CONTROL_MODULE,
      'apps/web/app/api/cron/sweep/route.ts': ROUTE,
      [BASELINE_PATH]: baseline([
        {
          module: 'apps/web/lib/security/retention-sweep.ts',
          name: 'purgeExpiredRows',
          control: 'rows past the retention window are deleted',
          owner: 'apps/web/app/api/cron/sweep/route.ts',
        },
      ]),
    },
    (root) => {
      const { code, output } = runGuard(root);
      assert.equal(code, 1);
      assert.match(output, /which is reachable now/);
    },
  );
});

test('a tree with no control module fails rather than reporting nothing', () => {
  withTree({ 'apps/web/lib/other/thing.ts': 'export const value = 1;' }, (root) => {
    const { code, output } = runGuard(root);
    assert.equal(code, 1);
    assert.match(output, /no control module was found/);
  });
});

test('the control vocabulary reads a stem through its participle and its plural', () => {
  assert.equal(matchesControlStem('guarded'), true);
  assert.equal(matchesControlStem('revoked'), true);
  assert.equal(matchesControlStem('verifies'), true);
  assert.equal(matchesControlStem('denied'), true);
  assert.equal(matchesControlStem('render'), false);
  assert.equal(isControlName('guardedFetch'), true);
  assert.equal(isControlName('runKeyRewrap'), true);
  assert.equal(isControlName('reEraseTombstonedAccount'), true);
  assert.equal(isControlName('readAccountStatus'), false);
  assert.equal(isControlName('MAX_TOOL_SCHEMA_DEPTH'), false);
});

test('the subject set is the security directories and the data lifecycle modules', () => {
  assert.equal(isControlModule('apps/web/lib/security/upload-scan.ts'), true);
  assert.equal(isControlModule('apps/web/lib/auth/session-policy.ts'), true);
  assert.equal(isControlModule('apps/web/lib/crypto/envelope.ts'), true);
  assert.equal(isControlModule('apps/web/lib/url-fetch/guarded-fetch.ts'), true);
  assert.equal(isControlModule('apps/web/lib/server/step-up/verify-factor.ts'), true);
  assert.equal(isControlModule('apps/web/lib/server/account-erasure.ts'), true);
  assert.equal(isControlModule('apps/web/lib/server/security-log-retention.ts'), true);
  assert.equal(isControlModule('apps/web/lib/server/legal-hold-notice.ts'), true);
  assert.equal(isControlModule('apps/web/lib/services/retention-service.ts'), false);
});

test('export and import parsing sees the shapes this repository writes', () => {
  const names = exportedNames(`
export async function verifyThing() {}
export const denyThing = () => {};
export class PurgeError extends Error {}
export type Shape = { a: 1 };
export interface Other { b: 2 }
const hidden = 1;
export { hidden as exposedThing };
`);
  assert.deepEqual([...names].sort(), ['PurgeError', 'denyThing', 'exposedThing', 'verifyThing']);

  const bindings = importedBindings(`
import { alpha, beta as gamma } from './one';
import type { Shape } from './types';
import * as everything from './two';
const { delta } = await import('./three');
export { epsilon } from './four';
export * from './five';
`);
  assert.deepEqual([...(bindings.get('./one') ?? [])].sort(), ['alpha', 'beta']);
  assert.equal(bindings.has('./types'), false);
  assert.deepEqual([...(bindings.get('./two') ?? [])], ['*']);
  assert.deepEqual([...(bindings.get('./three') ?? [])], ['*']);
  assert.deepEqual([...(bindings.get('./four') ?? [])], ['epsilon']);
  assert.deepEqual([...(bindings.get('./five') ?? [])], ['*']);
});

test('a declaration owns the references inside it and nothing after it', () => {
  const { chunks } = declarationChunks(`
export function first() {
  helperOne();
}

export function second() {
  helperTwo();
}
`);
  assert.match(chunks.get('first'), /helperOne/);
  assert.doesNotMatch(chunks.get('first'), /helperTwo/);
  assert.match(chunks.get('second'), /helperTwo/);
});
