import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkAgainstRatchet,
  countByRule,
  findProductionMocks,
  isProductionPath,
} from './lib/production-mocks.mjs';

const found = (source, file = 'apps/web/lib/billing.ts') =>
  findProductionMocks(source, file).map((f) => f.rule);

test('flags a production module importing a mock', () => {
  assert.deepEqual(found("import { invoke } from '@/lib/tauri-mock';"), ['mock-import']);
  assert.deepEqual(found("import { handlers } from '../__mocks__/stripe';"), ['mock-import']);
  assert.deepEqual(found("import { setupServer } from 'msw/node';"), ['mock-import']);
  assert.deepEqual(found("import { faker } from '@faker-js/faker';"), ['mock-import']);
});

test('flags a mock reached through a dynamic import or require', () => {
  assert.deepEqual(found("const m = await import('./fixtures.mock');"), ['mock-import']);
  assert.deepEqual(found("const m = require('../__mocks__/db');"), ['mock-import']);
});

test('flags a test-double API compiled into the product', () => {
  assert.deepEqual(found('vi.mock("@agiworkforce/client-runtime");'), ['test-double-api']);
  assert.deepEqual(found('const send = vi.fn();'), ['test-double-api']);
});

test('does not flag a message that merely names vi.mock', () => {
  assert.deepEqual(
    found("throw new Error(`Use vi.mock('@agiworkforce/client-runtime') to provide a mock.`);"),
    [],
  );
});

test('flags a function that answers from a canned constant', () => {
  assert.deepEqual(found('function listPlans() { return MOCK_PLANS; }'), ['stub-return']);
  assert.deepEqual(found('function listPlans() { return FAKE_INVOICES; }'), ['stub-return']);
});

test('leaves real imports and real constants alone', () => {
  assert.deepEqual(found("import { stripe } from '@/lib/billing/stripe';"), []);
  assert.deepEqual(found('function limits() { return PLAN_LIMITS; }'), []);
});

test('a mock inside a comment is not a finding', () => {
  assert.deepEqual(found("// import { handlers } from '../__mocks__/stripe';"), []);
});

test('test, fixture and story paths are out of scope', () => {
  assert.ok(isProductionPath('apps/web/lib/billing.ts'));
  assert.ok(!isProductionPath('apps/web/lib/__tests__/billing.test.ts'));
  assert.ok(!isProductionPath('apps/web/lib/__mocks__/stripe.ts'));
  assert.ok(!isProductionPath('apps/web/lib/__fixtures__/plans.ts'));
  assert.ok(!isProductionPath('apps/web/e2e/chat.spec.ts'));
  assert.ok(!isProductionPath('apps/web/lib/billing.test.ts'));
  assert.ok(!isProductionPath('packages/ui/ui/src/stories/Button.stories.tsx'));
  assert.ok(!isProductionPath('apps/web/node_modules/msw/index.js'));
  assert.ok(!isProductionPath('apps/web/lib/billing.css'));
});

test('a test file importing a mock is not a finding', () => {
  assert.deepEqual(
    findProductionMocks(
      "import { handlers } from '../__mocks__/stripe';",
      'apps/web/lib/__tests__/billing.test.ts',
    ),
    [],
  );
});

test('the ratchet fails on growth and on an unmeasured rule', () => {
  const counts = countByRule([{ file: 'a.ts', line: 1, rule: 'mock-import' }]);
  assert.equal(
    checkAgainstRatchet(counts, {
      maxFindings: { 'mock-import': 1, 'test-double-api': 0, 'stub-return': 0 },
    }).length,
    0,
  );
  assert.equal(
    checkAgainstRatchet(counts, {
      maxFindings: { 'mock-import': 0, 'test-double-api': 0, 'stub-return': 0 },
    }).length,
    1,
  );
  assert.equal(checkAgainstRatchet(counts, { maxFindings: {} }).length, 3);
});
