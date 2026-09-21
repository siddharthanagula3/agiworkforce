import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  GUARD_MODULE,
  REPO_ROOT,
  RENDERER_DIR,
  checkDesktopLocalEgress,
  isFetchMember,
  unguardedCalls,
} from './check-desktop-local-egress.mjs';

const roots = [];

function fixture(files = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'agi-local-egress-'));
  roots.push(root);
  mkdirSync(path.join(root, RENDERER_DIR, 'lib'), { recursive: true });
  cpSync(path.join(REPO_ROOT, GUARD_MODULE), path.join(root, GUARD_MODULE));
  writeFileSync(
    path.join(root, RENDERER_DIR, 'placeholder.ts'),
    'export const nothing = 1;\n',
    'utf8',
  );
  for (const [name, source] of Object.entries(files)) {
    const destination = path.join(root, RENDERER_DIR, name);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, source, 'utf8');
  }
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('the repository as it stands passes', () => {
  assert.deepEqual(checkDesktopLocalEgress(), []);
});

test('a module that goes through the chokepoint passes', () => {
  const root = fixture({
    'features/models.ts': `
import { guardedFetch } from '../lib/egressGuard';
export async function probe(baseUrl: string) {
  return guardedFetch(\`\${baseUrl}/models\`);
}
`,
  });
  assert.deepEqual(checkDesktopLocalEgress(root), []);
});

test('a module that calls fetch directly fails, and is named with its line', () => {
  const root = fixture({
    'features/models.ts': `
export async function probe(baseUrl: string) {
  return fetch(\`\${baseUrl}/models\`);
}
`,
  });
  const failures = checkDesktopLocalEgress(root);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /features\/models\.ts:3/);
  assert.match(failures[0], /guardedFetch/);
});

test('a host that arrived in a variable is caught, which the eslint rule cannot see', () => {
  const root = fixture({
    'features/models.ts': `
export async function probe(endpoint: string) {
  const target = endpoint;
  return fetch(target, { method: 'GET' });
}
`,
  });
  assert.equal(checkDesktopLocalEgress(root).length, 1);
});

test('declaring or implementing a fetch member is not a call', () => {
  const source = `
export interface Context {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}
export function make(): Context {
  return {
    fetch(input, init) {
      return bound(input, init);
    },
  };
}
`;
  assert.deepEqual(unguardedCalls(source, 'apps/desktop/src/services/context.ts'), []);
  assert.equal(isFetchMember(source, source.indexOf('fetch(input: RequestInfo')), true);
  assert.equal(isFetchMember(source, source.indexOf('fetch(input, init) {')), true);
});

test('a bare fetch statement is still a call', () => {
  const source = 'export function ping(url: string) {\n  fetch(url);\n}\n';
  assert.equal(unguardedCalls(source, 'apps/desktop/src/features/ping.ts').length, 1);
});

test('the chokepoint itself is the one place allowed to dial', () => {
  assert.deepEqual(unguardedCalls('return fetch(input, init);\n', GUARD_MODULE), []);
});

test('a chokepoint that stops classifying the destination fails', () => {
  const root = fixture();
  writeFileSync(
    path.join(root, GUARD_MODULE),
    "import { isPrivateTrustBoundary } from '../stores/privacyBoundary';\nexport async function guardedFetch(input: RequestInfo) {\n  isPrivateTrustBoundary();\n  return fetch(input);\n}\n",
    'utf8',
  );
  const failures = checkDesktopLocalEgress(root);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /classifies the destination/);
});

test('a chokepoint that stops reading the trust boundary fails', () => {
  const root = fixture();
  writeFileSync(
    path.join(root, GUARD_MODULE),
    "import { isOurCloudHost } from '@agiworkforce/trust-boundaries';\nexport async function guardedFetch(input: RequestInfo) {\n  isOurCloudHost('example.com');\n  return fetch(input);\n}\n",
    'utf8',
  );
  const failures = checkDesktopLocalEgress(root);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /trust boundary/);
});
