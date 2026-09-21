import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  checkUsageReservationReplay,
  exportedFunctionBody,
  importedModulePath,
  KNOWN_REPLAY_UNSAFE,
  nonDeterministicSourceIn,
  objectPropertyValue,
  reservationKeys,
  resolveLocalBinding,
} from './check-usage-reservation-replay.mjs';

function fixture(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'reservation-replay-'));
  for (const [name, source] of Object.entries(files)) {
    const full = path.join(root, 'apps/web/lib', name);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, source, 'utf8');
  }
  return root;
}

function scan(files) {
  const root = fixture(files);
  try {
    return checkUsageReservationReplay(root, ['apps/web/lib']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('a key built from the request passes', () => {
  const result = scan({
    'clean.ts': `
      export async function run(input: { conversationId: string }) {
        return reserveManagedUsageRequest({
          db,
          userId: input.userId,
          idempotencyKey: \`title:\${input.conversationId}\`,
          requestHash: fingerprintManagedUsageRequest(input),
          estimatedCostCents: 1,
        });
      }
    `,
  });
  assert.equal(result.callSites, 1);
  assert.deepEqual(result.unexpected, []);
  assert.deepEqual(result.offenders, []);
});

test('a key minted from a random source is reported', () => {
  const result = scan({
    'random.ts': `
      export async function run(input: { purpose: string }) {
        return reserveManagedUsageRequest({
          db,
          userId: input.userId,
          idempotencyKey: \`embed:\${randomUUID()}\`,
          estimatedCostCents: 1,
        });
      }
    `,
  });
  assert.equal(result.unexpected.length, 1);
  assert.equal(result.unexpected[0].token, 'randomUUID');
  assert.equal(result.unexpected[0].file, 'apps/web/lib/random.ts');
});

test('a key minted from the clock is reported', () => {
  const result = scan({
    'clock.ts': `
      reserveManagedUsageRequest({ idempotencyKey: \`run:\${Date.now()}\`, estimatedCostCents: 1 });
    `,
  });
  assert.equal(result.unexpected.length, 1);
  assert.equal(result.unexpected[0].token, 'Date.now');
});

test('a shorthand key is judged by what the module bound it to', () => {
  const result = scan({
    'shorthand.ts': `
      export async function run(input: { runId: string }) {
        const idempotencyKey = \`agent:\${randomUUID()}\`;
        return reserveManagedUsageRequest({ db, idempotencyKey, estimatedCostCents: 1 });
      }
    `,
  });
  assert.equal(result.unexpected.length, 1);
  assert.equal(result.unexpected[0].token, 'randomUUID');
});

test('a shorthand key the caller supplies is not blamed on this module', () => {
  const result = scan({
    'passed-in.ts': `
      export async function run(input: { idempotencyKey: string }) {
        const { idempotencyKey } = input;
        return reserveManagedUsageRequest({ db, idempotencyKey, estimatedCostCents: 1 });
      }
    `,
  });
  assert.deepEqual(result.unexpected, []);
});

test('a provider step is judged on its operation key, not on a key it does not carry', () => {
  const result = scan({
    'step.ts': `
      await reserveManagedUsageProviderStep({
        reservation: processed.managedUsage,
        operationKey: \`provider:\${step}\`,
        estimatedCostMicrousd: 10,
      });
      await reserveManagedUsageProviderStep({
        reservation: other.managedUsage,
        operationKey: \`provider:\${randomUUID()}\`,
        estimatedCostMicrousd: 10,
      });
    `,
  });
  assert.equal(result.callSites, 2);
  assert.equal(result.unexpected.length, 1);
  assert.equal(result.unexpected[0].token, 'randomUUID');
});

test('a reservation with no key at all is reported', () => {
  const result = scan({
    'missing.ts': `
      reserveManagedUsageRequest({ db, userId, estimatedCostCents: 1 });
    `,
  });
  assert.equal(result.unexpected.length, 1);
  assert.equal(result.unexpected[0].token, 'no idempotencyKey');
});

test('a brace inside a SQL string does not end the argument early', () => {
  const result = scan({
    'braces.ts': `
      reserveManagedUsageRequest({
        db,
        note: 'values ({ not an object }) and a // comment',
        idempotencyKey: \`ocr:\${input.documentId}\`,
        estimatedCostCents: 1,
      });
    `,
  });
  assert.deepEqual(result.offenders, []);
  assert.equal(result.callSites, 1);
});

test('a random source hidden inside a key helper is still reported', () => {
  const result = scan({
    'keys.ts': `
      import { randomUUID } from 'node:crypto';
      export function buildKey(input: { purpose: string }) {
        return \`embed:\${input.purpose}:\${randomUUID()}\`;
      }
    `,
    'caller.ts': `
      import { buildKey } from '@/lib/keys';
      export async function run(input: { purpose: string }) {
        return reserveManagedUsageRequest({ db, idempotencyKey: buildKey(input), estimatedCostCents: 1 });
      }
    `,
  });
  assert.equal(result.unexpected.length, 1);
  assert.equal(result.unexpected[0].file, 'apps/web/lib/caller.ts');
  assert.equal(result.unexpected[0].token, 'randomUUID inside buildKey');
});

test('a key helper that only reads the request passes', () => {
  const result = scan({
    'keys.ts': `
      export function buildKey(input: { purpose: string }) {
        return \`embed:\${input.purpose}\`;
      }
    `,
    'caller.ts': `
      import { buildKey } from '@/lib/keys';
      reserveManagedUsageRequest({ db, idempotencyKey: buildKey(input), estimatedCostCents: 1 });
    `,
  });
  assert.deepEqual(result.offenders, []);
});

test('a key helper is not blamed for what the rest of its module does', () => {
  const result = scan({
    'keys.ts': `
      import { randomUUID } from 'node:crypto';
      export function buildKey(input: { purpose: string }) {
        return \`embed:\${input.purpose}\`;
      }
      export function newLeaseToken() {
        return randomUUID();
      }
    `,
    'caller.ts': `
      import { buildKey, newLeaseToken } from '@/lib/keys';
      reserveManagedUsageRequest({
        db,
        idempotencyKey: buildKey(input),
        leaseToken: newLeaseToken(),
        estimatedCostCents: 1,
      });
    `,
  });
  assert.deepEqual(
    result.offenders,
    [],
    'the lease token may be fresh; only the idempotency key must replay',
  );
});

test('the import reader and the body reader stand on their own', () => {
  const source = "import { a, b as c } from '@/lib/keys';\nimport { d } from './near';\n";
  assert.equal(importedModulePath(source, 'a', 'apps/web/lib/x.ts'), 'apps/web/lib/keys');
  assert.equal(importedModulePath(source, 'c', 'apps/web/lib/x.ts'), 'apps/web/lib/keys');
  assert.equal(importedModulePath(source, 'd', 'apps/web/lib/x.ts'), 'apps/web/lib/near');
  assert.equal(importedModulePath(source, 'missing', 'apps/web/lib/x.ts'), null);
  assert.equal(
    exportedFunctionBody('export function f({ a }: T) {\n  return a;\n}\n', 'f'),
    '{\n  return a;\n}',
  );
  assert.equal(
    exportedFunctionBody('export const g = (a: string) => {\n  return a;\n};\n', 'g'),
    '{\n  return a;\n}',
  );
  assert.equal(exportedFunctionBody('export function h() {}\n', 'missing'), null);
});

test('a fixed known offender is demanded to leave the list once it is fixed', () => {
  const result = scan({ 'clean.ts': 'reserveManagedUsageRequest({ idempotencyKey: input.key });' });
  assert.deepEqual(
    result.repaired.sort(),
    Object.keys(KNOWN_REPLAY_UNSAFE).sort(),
    'a scan that sees none of the known offenders must ask for every one of them to be removed',
  );
});

test('every known offender carries a reason', () => {
  for (const [file, reason] of Object.entries(KNOWN_REPLAY_UNSAFE)) {
    assert.ok(reason.length > 40, `${file} needs a reason, not a label`);
  }
});

test('the property reader and the binding reader stand on their own', () => {
  assert.deepEqual(objectPropertyValue('{ a: 1, idempotencyKey: x.y, b: 2 }', 'idempotencyKey'), {
    shorthand: false,
    expression: 'x.y',
  });
  assert.deepEqual(
    objectPropertyValue('{ db, idempotencyKey, estimatedCostCents: 1 }', 'idempotencyKey'),
    {
      shorthand: true,
      expression: 'idempotencyKey',
    },
  );
  assert.equal(objectPropertyValue('{ db, userId }', 'idempotencyKey'), null);
  assert.deepEqual(resolveLocalBinding('const key = `a:${b}`;\n', 'key'), ['`a:${b}`;']);
  assert.equal(nonDeterministicSourceIn('`a:${b}`'), null);
  assert.equal(nonDeterministicSourceIn('nanoid()'), 'nanoid');
});
