import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  BILLING_PATH,
  CHAT_REQUEST_PATH,
  CONTRACT_PATH,
  FEATURE_REGISTRY_PATH,
  MODEL_CATALOG_PATH,
  REGISTRY_PATH,
  REPO_ROOT,
  SUITE_PATH,
  collectViolations,
} from './check-interaction-modes.mjs';

const roots = [];

function write(root, relativePath, contents) {
  const absolute = path.join(root, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

const SELECTOR_FILE = 'apps/web/features/chat/components/Composer/ChatComposerNew.tsx';
const ROUTE_DIR = 'apps/web/app/api/media/image/generate';

function baseMode(overrides = {}) {
  return {
    label: 'Chat',
    description: 'Quick questions and conversation.',
    selector: { file: SELECTOR_FILE, marker: 'WORK_MODE_LABELS', label: 'Chat' },
    request: { kind: 'chat-completions', field: 'work_mode', route: 'apps/web/app/api/chat' },
    gates: { feature: null, entitlement: 'managed_chat' },
    models: { catalog: 'chat' },
    requiredModelCapabilities: ['streaming'],
    requiredTools: [],
    optionalTools: [],
    sourceBehavior: 'conversation',
    fileBehavior: 'inline-and-attached',
    memoryBehavior: 'read-write',
    projectBehavior: 'optional',
    approvalBehavior: 'none',
    streamingFormat: 'sse-chat-completions',
    persistence: 'conversation',
    backgroundExecution: false,
    usageAccounting: 'chat',
    billing: 'managed_chat',
    cancellation: 'stop-stream',
    resume: 'same-conversation',
    crossDevice: 'synced',
    offline: 'queued-draft-only',
    trustModes: ['managed'],
    enterprisePolicy: null,
    outputTypes: ['text'],
    draft: 'carried',
    ...overrides,
  };
}

function fixture(modes) {
  const root = mkdtempSync(path.join(tmpdir(), 'interaction-modes-'));
  roots.push(root);
  write(root, REGISTRY_PATH, JSON.stringify({ modes }, null, 2));
  write(root, CONTRACT_PATH, "import registryJson from './interaction-modes.json';\n");
  write(
    root,
    BILLING_PATH,
    `export const BILLING_PLAN_CAPABILITY_TIERS = Object.freeze({\n  managed_chat: [],\n  image_generation: [],\n});\n`,
  );
  write(
    root,
    MODEL_CATALOG_PATH,
    `export const COMPAT_CAPABILITY_SOURCES = {\n  streaming: 'streaming',\n  imageGen: 'imageOutput',\n} as const;\n`,
  );
  write(root, SUITE_PATH, `export const PRIVACY_MODES = ['local', 'byok', 'managed'] as const;\n`);
  write(root, FEATURE_REGISTRY_PATH, JSON.stringify({ features: { work: {} } }, null, 2));
  write(
    root,
    CHAT_REQUEST_PATH,
    `export const ChatCompletionRequestSchema = z.object({\n  model: z.string(),\n  work_mode: z.enum(CLOUD_WORK_MODES).optional(),\n  research: z.boolean().optional(),\n});\n`,
  );
  write(root, SELECTOR_FILE, `const WORK_MODE_LABELS = { chat: 'Chat' };\n`);
  write(root, path.join(ROUTE_DIR, 'route.ts'), 'export async function POST() {}\n');
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('a registry whose bindings all resolve passes', () => {
  assert.deepEqual(collectViolations(fixture({ chat: baseMode() })), []);
});

test('a mode with no selector is refused', () => {
  const violations = collectViolations(
    fixture({ chat: baseMode({ selector: { file: '', marker: '', label: '' } }) }),
  );
  assert.ok(violations.some((entry) => entry.includes('names no selector')));
});

test('a selector marker that is not in its file is refused', () => {
  const violations = collectViolations(
    fixture({
      chat: baseMode({ selector: { file: SELECTOR_FILE, marker: 'GONE', label: 'Chat' } }),
    }),
  );
  assert.ok(violations.some((entry) => entry.includes('GONE')));
});

test('a selector label the file never renders is refused', () => {
  const violations = collectViolations(
    fixture({
      chat: baseMode({
        selector: { file: SELECTOR_FILE, marker: 'WORK_MODE_LABELS', label: 'Telepathy' },
      }),
    }),
  );
  assert.ok(violations.some((entry) => entry.includes('Telepathy')));
});

test('a request field the schema does not accept is refused', () => {
  const violations = collectViolations(
    fixture({
      chat: baseMode({
        request: { kind: 'chat-completions', field: 'invented', route: 'apps/web/app/api/chat' },
      }),
    }),
  );
  assert.ok(violations.some((entry) => entry.includes('invented')));
});

test('a route mode whose route file is absent is refused', () => {
  const violations = collectViolations(
    fixture({
      chat: baseMode({
        request: { kind: 'route', field: 'prompt', route: 'apps/web/app/api/media/nowhere' },
      }),
    }),
  );
  assert.ok(violations.some((entry) => entry.includes('does not exist')));
});

test('an entitlement the plan catalog does not define is refused', () => {
  const violations = collectViolations(
    fixture({ chat: baseMode({ gates: { feature: null, entitlement: 'free_lunch' } }) }),
  );
  assert.ok(violations.some((entry) => entry.includes('free_lunch')));
});

test('a feature id the feature registry does not have is refused', () => {
  const violations = collectViolations(
    fixture({ chat: baseMode({ gates: { feature: 'ghost', entitlement: 'managed_chat' } }) }),
  );
  assert.ok(violations.some((entry) => entry.includes('ghost')));
});

test('a model capability no model can report is refused', () => {
  const violations = collectViolations(
    fixture({ chat: baseMode({ requiredModelCapabilities: ['telepathy'] }) }),
  );
  assert.ok(violations.some((entry) => entry.includes('telepathy')));
});

test('a trust boundary that does not exist is refused', () => {
  const violations = collectViolations(fixture({ chat: baseMode({ trustModes: ['astral'] }) }));
  assert.ok(violations.some((entry) => entry.includes('astral')));
});

test('a mode that names no trust boundary at all is refused', () => {
  const violations = collectViolations(fixture({ chat: baseMode({ trustModes: [] }) }));
  assert.ok(violations.some((entry) => entry.includes('names no trust boundary')));
});

test('a missing attribute is refused, and named', () => {
  const mode = baseMode();
  delete mode.cancellation;
  const violations = collectViolations(fixture({ chat: mode }));
  assert.ok(violations.some((entry) => entry.includes('"cancellation"')));
});

test('a missing transition trait is refused as such', () => {
  const mode = baseMode();
  delete mode.persistence;
  const violations = collectViolations(fixture({ chat: mode }));
  assert.ok(violations.some((entry) => entry.includes('no transition rule can be derived')));
});

test('a blank description is refused', () => {
  const violations = collectViolations(fixture({ chat: baseMode({ description: '   ' }) }));
  assert.ok(violations.some((entry) => entry.includes('no description')));
});

test('a contract that keeps its own copy of the list is refused', () => {
  const root = fixture({ chat: baseMode() });
  write(root, CONTRACT_PATH, "export const INTERACTION_MODES = ['chat'];\n");
  const violations = collectViolations(root);
  assert.ok(violations.some((entry) => entry.includes('second copy')));
});

test('an empty registry is refused', () => {
  const violations = collectViolations(fixture({}));
  assert.ok(violations.some((entry) => entry.includes('declares no modes')));
});

test('the repository itself satisfies the guard', () => {
  assert.deepEqual(collectViolations(REPO_ROOT), []);
});
