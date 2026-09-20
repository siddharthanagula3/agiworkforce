import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CONTRACT_PATH,
  REPO_ROOT,
  checkRetrySemantics,
  loadContract,
  readPolicyDefaults,
} from './check-retry-semantics.mjs';

const roots = [];

function write(root, relativePath, contents) {
  const absolute = path.join(root, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

const POLICY = `
export type RetryDisposition = 'retry' | 'terminal';
export interface RetryClassification { disposition: RetryDisposition; reason: string; }
export type RetryStopReason = 'terminal' | 'attempts-exhausted';
export type RetryTelemetryEvent = { type: 'attempt' };
export const RETRY_POLICY_DEFAULTS = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 30_000,
  multiplier: 2,
  jitter: 'full' as const,
  maxRetryAfterMs: 120_000,
};
`;

const TOOL = 'export type ToolDefinition = {\n  retrySafety: ToolRetrySafety;\n};';
const SAFETY = "export type ToolRetrySafety = 'idempotent' | 'at_most_once' | 'unknown';";
const SURFACE = 'export function retryableUserMessageId() { return null; }';

function fixture(overrides = {}, files = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'retry-semantics-'));
  roots.push(root);
  const contract = { ...loadContract(REPO_ROOT), ...overrides };
  write(root, CONTRACT_PATH, JSON.stringify(contract));
  write(root, contract.policy.module, POLICY);
  write(root, contract.toolRetry.module, TOOL);
  write(root, contract.toolRetry.vocabulary.module, SAFETY);
  for (const surface of contract.userVisibleRetry) write(root, surface.module, SURFACE);
  for (const [relativePath, contents] of Object.entries(files)) write(root, relativePath, contents);
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('the real guard passes on the repository as it stands', () => {
  const { errors } = checkRetrySemantics(REPO_ROOT);
  assert.deepEqual(errors, []);
});

test('a clean policy passes', () => {
  assert.deepEqual(checkRetrySemantics(fixture()).errors, []);
});

test('a policy that drops a field fails', () => {
  const contract = loadContract(REPO_ROOT);
  const root = fixture({}, { [contract.policy.module]: POLICY.replace('  multiplier: 2,\n', '') });
  const { errors } = checkRetrySemantics(root);
  assert.ok(
    errors.some((error) => error.includes('declares no multiplier')),
    errors.join('\n'),
  );
});

test('turning jitter off fails', () => {
  const contract = loadContract(REPO_ROOT);
  const root = fixture(
    {},
    { [contract.policy.module]: POLICY.replace("jitter: 'full'", "jitter: 'none'") },
  );
  const { errors } = checkRetrySemantics(root);
  assert.ok(
    errors.some((error) => error.includes('turns the protection off')),
    errors.join('\n'),
  );
});

test('a single attempt, or no backoff, falls below the floor', () => {
  const contract = loadContract(REPO_ROOT);
  for (const [from, to, fragment] of [
    ['maxAttempts: 3', 'maxAttempts: 1', 'maxAttempts is 1'],
    ['multiplier: 2', 'multiplier: 1', 'multiplier is 1'],
  ]) {
    const root = fixture({}, { [contract.policy.module]: POLICY.replace(from, to) });
    const { errors } = checkRetrySemantics(root);
    assert.ok(
      errors.some((error) => error.includes(fragment)),
      `${to}: ${errors.join('\n')}`,
    );
  }
});

test('losing the classification vocabulary fails', () => {
  const contract = loadContract(REPO_ROOT);
  const root = fixture(
    {},
    {
      [contract.policy.module]: POLICY.replace(
        'export type RetryStopReason',
        'type RetryStopReason',
      ),
    },
  );
  const { errors } = checkRetrySemantics(root);
  assert.ok(
    errors.some((error) => error.includes('no longer carries RetryStopReason')),
    errors.join('\n'),
  );
});

test('a tool definition with no retry safety fails', () => {
  const contract = loadContract(REPO_ROOT);
  const root = fixture(
    {},
    { [contract.toolRetry.module]: 'export type ToolDefinition = { name: string };' },
  );
  const { errors } = checkRetrySemantics(root);
  assert.ok(
    errors.some((error) => error.includes('no longer carries retrySafety')),
    errors.join('\n'),
  );
});

test('dropping a retry-safety case fails', () => {
  const contract = loadContract(REPO_ROOT);
  const root = fixture(
    {},
    {
      [contract.toolRetry.vocabulary.module]:
        "export type ToolRetrySafety = 'idempotent' | 'unknown';",
    },
  );
  const { errors } = checkRetrySemantics(root);
  assert.ok(
    errors.some((error) => error.includes('no longer offers "at_most_once"')),
    errors.join('\n'),
  );
});

test('a user-visible retry surface that offers nothing fails', () => {
  const contract = loadContract(REPO_ROOT);
  const root = fixture({}, { [contract.userVisibleRetry[0].module]: 'export const nothing = 1;' });
  const { errors } = checkRetrySemantics(root);
  assert.ok(
    errors.some((error) => error.includes('offers nothing matching')),
    errors.join('\n'),
  );
});

test('the defaults are read from the module, not restated here', () => {
  const contract = loadContract(REPO_ROOT);
  const defaults = readPolicyDefaults({
    repoRoot: REPO_ROOT,
    module: contract.policy.module,
    symbol: contract.policy.symbol,
  });
  for (const name of Object.keys(contract.policy.fields)) {
    assert.ok(defaults[name] !== undefined, `${name} was not read`);
  }
});
