import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CONTRACT_PATH,
  GENERATED_ROOT,
  REPO_ROOT,
  TAXONOMY_PATH,
  collectViolations,
  readGeneratedUnion,
} from './check-error-contract-parity.mjs';

const roots = [];

function write(root, relativePath, contents) {
  const absolute = path.join(root, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

const CONSUMER = 'apps/web/features/code/local-code.ts';
const REGION = 'const TABLE[\\s\\S]*?\\}\\);';

function consumerSource(codes) {
  const rows = codes.map((code) => `  ${code}: 'x',`).join('\n');
  return `const TABLE = Object.freeze({\n${rows}\n});\n`;
}

function contract(overrides = {}) {
  return {
    why: 'test',
    vocabularies: {
      TurnFailureCode: {
        consumers: [
          { surface: 'web', file: CONSUMER, region: REGION, uncovered: {}, ...overrides },
        ],
      },
    },
    retryability: { RATE_LIMIT_EXCEEDED: true },
  };
}

function scaffold({
  members = ['network', 'timeout'],
  codes = ['network', 'timeout'],
  contractJson = contract(),
  taxonomy = {
    classes: {
      rate_limit: { retryable: true, codes: ['RATE_LIMIT_EXCEEDED'] },
      network: { retryable: true, codes: ['NETWORK_ERROR'] },
    },
  },
} = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'error-parity-'));
  roots.push(root);
  const union = members.map((member) => `  | '${member}'`).join('\n');
  write(root, `${GENERATED_ROOT}/TurnFailureCode.ts`, `export type TurnFailureCode =\n${union};\n`);
  write(root, CONSUMER, consumerSource(codes));
  write(root, CONTRACT_PATH, JSON.stringify(contractJson, null, 2));
  write(root, TAXONOMY_PATH, JSON.stringify(taxonomy, null, 2));
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('a client that answers for every code passes', () => {
  assert.deepEqual(collectViolations(scaffold()), []);
});

test('a client branching on a code the protocol dropped fails', () => {
  const violations = collectViolations(scaffold({ codes: ['network', 'timeout', 'teapot'] }));
  assert.equal(violations.length, 1);
  assert.match(violations[0], /that branch is unreachable/);
});

test('a code the protocol added and no client answers for fails', () => {
  const violations = collectViolations(
    scaffold({ members: ['network', 'timeout', 'tool_denied'] }),
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0], /has no answer for "tool_denied"/);
});

test('an excused code the client now handles fails', () => {
  const violations = collectViolations(
    scaffold({ contractJson: contract({ uncovered: { network: 'deliberate' } }) }),
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0], /Delete the entry/);
});

test('an excused code with no reason fails', () => {
  const violations = collectViolations(
    scaffold({ codes: ['network'], contractJson: contract({ uncovered: { timeout: '' } }) }),
  );
  assert.ok(violations.some((violation) => /without saying why/.test(violation)));
});

test('a code classified twice fails, because retryability would depend on where you look', () => {
  const violations = collectViolations(
    scaffold({
      taxonomy: {
        classes: {
          rate_limit: { retryable: true, codes: ['RATE_LIMIT_EXCEEDED'] },
          quota: { retryable: false, codes: ['RATE_LIMIT_EXCEEDED'] },
        },
      },
    }),
  );
  assert.ok(violations.some((violation) => /is in both/.test(violation)));
});

test('flipping a pinned code from retryable to fatal fails', () => {
  const violations = collectViolations(
    scaffold({
      taxonomy: { classes: { rate_limit: { retryable: false, codes: ['RATE_LIMIT_EXCEEDED'] } } },
    }),
  );
  assert.ok(violations.some((violation) => /changes six\s+surfaces at once/.test(violation)));
});

test('the real binding is the closed set the clients were built against', () => {
  const members = readGeneratedUnion(REPO_ROOT, 'TurnFailureCode');
  assert.ok(members.includes('provider_rate_limited'));
  assert.ok(members.includes('unknown'));
});
