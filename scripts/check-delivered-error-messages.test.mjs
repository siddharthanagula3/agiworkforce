import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { deliveredFactories, findDeliveredRawMessages } from './lib/delivered-error-messages.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checker = path.join(repoRoot, 'scripts/check-delivered-error-messages.mjs');

const FACTORY_SOURCE = `
export const createError = {
  validation: (message, details) => appError(ErrorCode.VALIDATION_ERROR, message, details),
  conflict: (message) => appError(ErrorCode.CONFLICT, message),
  internal: (message = 'Internal server error') => appError(ErrorCode.INTERNAL_ERROR, message),
  denied: (message) => appError(ErrorCode.PLAN_UPGRADE_REQUIRED, message),
};
`;

const HANDLER_SOURCE = `
const SAFE_TO_EXPOSE_CODES = new Set([
  'VALIDATION_ERROR',
  'CONFLICT',
  ...Object.values(DenialErrorCode),
]);
`;

const DENIAL_SOURCE = `
export const DenialErrorCode = {
  PLAN_UPGRADE_REQUIRED: 'PLAN_UPGRADE_REQUIRED',
} as const;
`;

function resolved() {
  return deliveredFactories({
    factorySource: FACTORY_SOURCE,
    handlerSource: HANDLER_SOURCE,
    denialSource: DENIAL_SOURCE,
  });
}

function scan(source) {
  return findDeliveredRawMessages(source, 'route.ts', resolved().delivered);
}

test('a factory is delivered only when the handler exposes its code', () => {
  const { delivered } = resolved();

  assert.ok(delivered.has('validation'));
  assert.ok(delivered.has('conflict'));
  assert.ok(!delivered.has('internal'), 'internal is replaced with generic text for its status');
});

test('a denial code spread into the exposed set makes its factory delivered', () => {
  assert.ok(resolved().delivered.has('denied'));
});

test('the caught value forwarded through instanceof Error is a finding', () => {
  const findings = scan(`
    try { await store(); } catch (error) {
      throw createError.validation(error instanceof Error ? error.message : 'nope');
    }
  `);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 3);
});

test('getErrorMessage and String(error) are the same leak by another name', () => {
  assert.equal(scan('throw createError.conflict(getErrorMessage(error));').length, 1);
  assert.equal(scan('throw createError.validation(String(err));').length, 1);
});

test('a message narrowed to an error class this repository declares is not a finding', () => {
  const findings = scan(`
    catch (error) {
      if (error instanceof PublishedArtifactValidationError) {
        throw createError.validation(error.message);
      }
      throw error;
    }
  `);

  assert.equal(findings.length, 0);
});

test('a factory whose code the handler replaces may still forward the caught words', () => {
  assert.equal(scan('throw createError.internal(getErrorMessage(error));').length, 0);
});

test('asUserSafe marks any error as delivered, whatever its code', () => {
  const findings = scan(
    "throw createError.internal(error instanceof Error ? error.message : 'x').asUserSafe();",
  );

  assert.equal(findings.length, 1);
});

test('prose that names the condition is not a finding', () => {
  const findings = scan(`
    catch (error) {
      logger.error({ error }, 'upload failed');
      throw createError.validation('This upload could not be stored. Try the file again.');
    }
  `);

  assert.equal(findings.length, 0);
});

test('the checker fails on a synthetic violation and passes once it is named', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'delivered-error-'));
  try {
    for (const [relative, source] of [
      ['packages/platform/utils/src/errors.ts', FACTORY_SOURCE],
      ['apps/web/lib/error-handler.ts', HANDLER_SOURCE],
      ['packages/contracts/types/src/errors.ts', DENIAL_SOURCE],
      [
        'apps/web/app/api/thing/route.ts',
        "catch (error) { throw createError.validation(error instanceof Error ? error.message : 'x'); }",
      ],
    ]) {
      const file = path.join(scratch, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, source);
    }

    const failed = spawnSync(process.execPath, [checker, '--root', scratch], { encoding: 'utf8' });
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /app\/api\/thing\/route\.ts/);

    fs.writeFileSync(
      path.join(scratch, 'apps/web/app/api/thing/route.ts'),
      "catch (error) { throw createError.validation('That file could not be stored.'); }",
    );
    const passed = spawnSync(process.execPath, [checker, '--root', scratch], { encoding: 'utf8' });
    assert.equal(passed.status, 0);
    assert.match(passed.stdout, /no caught exception reaches a caller in its own words/);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test('the checker refuses to pass when no delivered factory resolves', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'delivered-error-empty-'));
  try {
    for (const [relative, source] of [
      ['packages/platform/utils/src/errors.ts', 'export const createError = {};'],
      ['apps/web/lib/error-handler.ts', 'const SAFE_TO_EXPOSE_CODES = new Set([]);'],
      ['packages/contracts/types/src/errors.ts', DENIAL_SOURCE],
    ]) {
      const file = path.join(scratch, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, source);
    }

    const result = spawnSync(process.execPath, [checker, '--root', scratch], { encoding: 'utf8' });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /vacuously/);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
