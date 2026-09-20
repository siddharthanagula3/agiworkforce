import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  expressionRoots,
  moduleScopeNames,
  parameterNames,
  splitArguments,
  targetIsRepoChosen,
} from './check-security-egress-inventory.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const guard = path.join(repoRoot, 'scripts/check-security-egress-inventory.mjs');

function withTree(files, run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'egress-inventory-'));
  try {
    for (const [name, contents] of Object.entries(files)) {
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
    return { code: error.status, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

test('a fetch to a host that arrived from outside the module fails', () => {
  withTree(
    {
      'apps/web/lib/notifier.ts': `
export async function deliver(row: { endpoint: string }) {
  return fetch(row.endpoint, { method: 'POST' });
}
`,
    },
    (root) => {
      const { code, output } = runGuard(root);
      assert.equal(code, 1);
      assert.match(output, /apps\/web\/lib\/notifier\.ts::deliver/);
      assert.match(output, /without resolving the host first/);
    },
  );
});

test('the same fetch passes once the host is resolved in that function', () => {
  withTree(
    {
      'apps/web/lib/notifier.ts': `
import { assertResolvedPublicHostname } from '@/lib/egress-policy';

export async function deliver(row: { endpoint: string }) {
  await assertResolvedPublicHostname(row.endpoint);
  return fetch(row.endpoint, { method: 'POST', redirect: 'manual' });
}
`,
    },
    (root) => assert.equal(runGuard(root).code, 0),
  );
});

test('resolving the first hop and then following redirects fails', () => {
  withTree(
    {
      'apps/web/lib/notifier.ts': `
import { assertResolvedPublicHostname } from '@/lib/egress-policy';

export async function deliver(row: { endpoint: string }) {
  await assertResolvedPublicHostname(row.endpoint);
  return fetch(row.endpoint, { method: 'POST' });
}
`,
    },
    (root) => {
      const { code, output } = runGuard(root);
      assert.equal(code, 1);
      assert.match(output, /follows redirects/);
    },
  );
});

test('an endpoint constant, an environment variable and a fixed host are the repository own choice', () => {
  withTree(
    {
      'apps/web/lib/vendor.ts': `
const VENDOR = 'https://vendor.example.com';

export async function ping(id: string) {
  await fetch(\`\${VENDOR}/ping\`);
  await fetch(\`https://vendor.example.com/items/\${id}\`);
  return fetch(process.env['VENDOR_URL'] ?? VENDOR);
}
`,
    },
    (root) => assert.equal(runGuard(root).code, 0),
  );
});

test('a helper is judged by what this module passes it, not by its parameter', () => {
  withTree(
    {
      'apps/web/lib/reports.ts': `
const BASE = 'https://reports.example.com';

async function readJson(url: string) {
  return fetch(url);
}

export async function load() {
  return readJson(\`\${BASE}/daily\`);
}
`,
    },
    (root) => assert.equal(runGuard(root).code, 0),
  );
});

test('a module that admits the URL only through its own allowlist passes', () => {
  withTree(
    {
      'apps/web/lib/assets.ts': `
import { isTrustedReleaseAssetUrl } from '@/lib/releases/trusted-release-asset-url';

export async function head(url: string) {
  if (!isTrustedReleaseAssetUrl(url)) return false;
  const response = await fetch(url, { method: 'HEAD' });
  return response.ok;
}
`,
    },
    (root) => assert.equal(runGuard(root).code, 0),
  );
});

test('a browser module is not asked to resolve hosts', () => {
  withTree(
    {
      'apps/web/lib/panel.tsx': `'use client';

export async function save(target: string) {
  return fetch(target, { method: 'POST' });
}
`,
    },
    (root) => assert.equal(runGuard(root).code, 0),
  );
});

test('an empty tree fails rather than reporting success', () => {
  withTree({ 'README.md': 'nothing here' }, (root) => {
    const { code, output } = runGuard(root);
    assert.equal(code, 1);
    assert.match(output, /no source file was found/);
  });
});

test('expressionRoots reads through a template to each interpolation', () => {
  assert.deepEqual(expressionRoots('`${base}/x/${id}`'), ['base', 'id']);
  assert.deepEqual(expressionRoots('`https://fixed.example/x/${id}`'), []);
  assert.deepEqual(expressionRoots('row.endpoint'), ['row']);
  assert.deepEqual(expressionRoots('new URL(target)'), ['URL']);
  assert.deepEqual(expressionRoots("'https://fixed.example'"), []);
});

test('moduleScopeNames collects declarations and every import form', () => {
  const names = moduleScopeNames(`
import base from './base';
import { alpha, beta as gamma } from './pair';
const DELTA = 1;
function epsilon() {}
`);
  for (const name of ['base', 'alpha', 'gamma', 'DELTA', 'epsilon']) {
    assert.equal(names.has(name), true, name);
  }
  assert.equal(names.has('beta'), false);
});

test('splitArguments ignores commas nested inside an argument', () => {
  assert.deepEqual(
    splitArguments('url, { headers: { a: 1, b: 2 }, body: f(1, 2) }').map((part) => part.trim()),
    ['url', '{ headers: { a: 1, b: 2 }, body: f(1, 2) }'],
  );
});

test('parameterNames reads the parameters a call site fills', () => {
  assert.deepEqual(parameterNames('async function send(url: string, body: Buffer) {'), [
    'url',
    'body',
  ]);
});

test('targetIsRepoChosen follows a local binding back to a module constant', () => {
  const context = {
    source: '',
    moduleNames: new Set(['BASE']),
    enclosing: 'const target = `${BASE}/x`;',
    functionName: 'send',
    parameters: [],
  };
  assert.equal(targetIsRepoChosen('target', context), true);
  assert.equal(targetIsRepoChosen('somethingElse', context), false);
});
