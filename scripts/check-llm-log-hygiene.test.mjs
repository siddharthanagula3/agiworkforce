import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { SCANNED_ROOTS, logHygieneViolations, productFiles } from './check-llm-log-hygiene.mjs';

function fixtureRoot(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'llm-log-hygiene-'));
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolute = path.join(root, relativePath);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents);
  }
  return root;
}

function withEveryRoot(files) {
  const populated = { ...files };
  for (const root of SCANNED_ROOTS) {
    populated[`${root}/placeholder.ts`] ??= 'export const placeholder = 1;\n';
  }
  return populated;
}

test('a log call that names a prompt is a violation with its line', () => {
  const root = fixtureRoot(
    withEveryRoot({
      [`${SCANNED_ROOTS[0]}/route.ts`]: [
        'export function handler() {',
        '  logger.info({ systemPrompt }, "turn started");',
        '}',
      ].join('\n'),
    }),
  );

  const { violations } = logHygieneViolations(root);

  assert.equal(violations.length, 1);
  assert.match(violations[0], /route\.ts:2 logs systemPrompt/);
});

test('a derived value is not a violation and the prose of a message is not code', () => {
  const root = fixtureRoot(
    withEveryRoot({
      [`${SCANNED_ROOTS[0]}/route.ts`]: [
        'logger.info({ promptTokens, messageCount }, "sent messages to the prompt");',
        'console.warn({ requestId }, "tool output truncated");',
      ].join('\n'),
    }),
  );

  assert.deepEqual(logHygieneViolations(root).violations, []);
});

test('a scanned root that has moved fails rather than passing on an empty tree', () => {
  const root = fixtureRoot({ 'apps/web/app/api/llm/route.ts': 'export const a = 1;\n' });

  const { violations } = logHygieneViolations(root);

  assert.ok(violations.length > 0);
  assert.ok(violations.every((violation) => /matched no product file/.test(violation)));
});

test('tests, mocks and declaration files are not product code', () => {
  const root = fixtureRoot({
    'tree/route.ts': 'export const a = 1;\n',
    'tree/route.test.ts': 'export const a = 1;\n',
    'tree/types.d.ts': 'export {};\n',
    'tree/__tests__/inner.ts': 'export const a = 1;\n',
    'tree/nested/handler.tsx': 'export const a = 1;\n',
  });

  const found = productFiles(path.join(root, 'tree'))
    .map((file) => path.relative(root, file))
    .sort();

  assert.deepEqual(found, [
    path.join('tree', 'nested', 'handler.tsx'),
    path.join('tree', 'route.ts'),
  ]);
});

test('the real repository roots are scanned and clean', () => {
  const { violations, sites } = logHygieneViolations();

  assert.deepEqual(violations, []);
  assert.ok(sites > 50, 'the guard must have log call sites to measure');
});
