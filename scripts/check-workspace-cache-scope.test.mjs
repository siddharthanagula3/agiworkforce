import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  literalStorageKeys,
  persistedStoreName,
  registeredStoreModules,
  storagePatterns,
} from './lib/workspace-cache-scope.mjs';

const script = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'check-workspace-cache-scope.mjs',
);

const REGISTRY = `
const USER_SCOPED_STORE_MODULES = [
  { label: 'web-chat-store', load: () => import('./web-chat-store') },
  { label: 'layout-store', load: () => import('./layout-store') },
];

const WORKSPACE_SCOPED_STORE_LABELS = new Set(['web-chat-store']);

const WORKSPACE_STORAGE_KEY_PATTERNS: readonly RegExp[] = [
  /^agi-composer-draft:/,
];

const APP_STORAGE_KEY_PATTERNS: readonly RegExp[] = [
  /^agi[-_.]/i,
  /^theme$/,
];

export async function applyCacheScope(scope) {
  const next = { account: scope.accountId, workspace: scope.workspaceId };
  return next;
}
`;

const CHAT_STORE = `
export const useWebChatStore = create(persist((set) => ({}), { name: 'agi-chat-store' }));
`;

function fixture(extra = {}, registry = REGISTRY) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-scope-'));
  const write = (relative, source) => {
    const full = path.join(root, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, source);
  };
  write('apps/web/shared/stores/authentication-store.ts', registry);
  write('apps/web/shared/stores/web-chat-store.ts', CHAT_STORE);
  write(
    'apps/web/shared/stores/layout-store.ts',
    'export const useLayoutStore = create(() => ({}));\n',
  );
  for (const [relative, source] of Object.entries(extra)) write(relative, source);
  return root;
}

function run(root) {
  try {
    return {
      code: 0,
      output: execFileSync('node', [script, '--root', root], { encoding: 'utf8' }),
    };
  } catch (error) {
    return { code: error.status ?? 1, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

test('passes when every persisted store is registered for the sweep', () => {
  const result = run(fixture());
  assert.equal(result.code, 0);
  assert.match(result.output, /2 registered stores/);
});

test('fails when a new persisted store is never swept', () => {
  const result = run(
    fixture({
      'apps/web/features/projects/stores/project-store.ts':
        "export const useProjectStore = create(persist((set) => ({}), { name: 'agi-project-store' }));\n",
    }),
  );
  assert.equal(result.code, 1);
  assert.match(result.output, /project-store\.ts persists state to the browser but is not in/);
});

test('fails when a storage key escapes the sign-out sweep', () => {
  const result = run(
    fixture({
      'apps/web/features/chat/lib/draft.ts':
        "export const save = (v) => localStorage.setItem('draft-body', v);\n",
    }),
  );
  assert.equal(result.code, 1);
  assert.match(result.output, /writes 'draft-body' to browser storage/);
});

test('fails when a workspace label names a store that is not registered', () => {
  const result = run(
    fixture({}, REGISTRY.replace("new Set(['web-chat-store'])", "new Set(['media-store'])")),
  );
  assert.equal(result.code, 1);
  assert.match(result.output, /names 'media-store', which is not a registered store/);
});

test('fails when the registry itself is gone', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-scope-empty-'));
  const result = run(root);
  assert.equal(result.code, 1);
  assert.match(result.output, /is missing; nothing sweeps the caches/);
});

test('reads the registry out of the source it governs', () => {
  const modules = registeredStoreModules(REGISTRY);
  assert.deepEqual(
    modules.map((entry) => entry.label),
    ['web-chat-store', 'layout-store'],
  );
  assert.equal(storagePatterns(REGISTRY, 'APP_STORAGE_KEY_PATTERNS').length, 2);
});

test('tells a persisted store from an in-memory one', () => {
  assert.equal(persistedStoreName(CHAT_STORE), 'agi-chat-store');
  assert.equal(persistedStoreName('export const useX = create(() => ({}));'), null);
  assert.deepEqual(literalStorageKeys("sessionStorage.setItem('agi:x', v)"), ['agi:x']);
});
