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

const SHARED_TRANSPORT = `
import { assertResolvedPublicHostname, pinnedPublicFetch } from '@/lib/egress-policy';

export async function guardedFetch(target, options) {
  const fetchImpl = options.fetchImpl ?? pinnedPublicFetch;
  let current = target;
  for (let hop = 0; hop <= options.maxRedirects; hop += 1) {
    await assertResolvedPublicHostname(current.href);
    const response = await fetchImpl(current.href, { method: 'GET', redirect: 'manual' });
    if (response.status < 300 || response.status >= 400) return { ok: true, response };
    current = new URL(response.headers.get('location'), current);
  }
  return { ok: false };
}
`;

const FETCH_TOOL = `
import { guardedFetch } from '@/lib/url-fetch/guarded-fetch';

export async function executeUrlFetch(args) {
  return guardedFetch(new URL(args.url), { maxRedirects: 5, headers: {} });
}
`;

const SEARCH_TOOL = `
import { guardedFetch } from '@/lib/url-fetch/guarded-fetch';

const VENDOR_ORIGIN = 'https://api.vendor.example';
const VENDOR_SEARCH_URL = \`\${VENDOR_ORIGIN}/search\`;

export async function vendorSearch(request) {
  return fetch(VENDOR_SEARCH_URL, { method: 'POST', body: request.body });
}

export async function fetchPageMetadata(url) {
  return guardedFetch(new URL(url), { maxRedirects: 3, headers: {} });
}
`;

const MCP_POLICY = `
import type { McpEgressPolicy } from '@agiworkforce/mcp';
import { credentialedFetch } from '@/lib/url-fetch/guarded-fetch';
import { assertResolvedPublicHostname } from './egress-policy';

export const MCP_EGRESS_POLICY: McpEgressPolicy = {
  assertAllowedUrl: (url) => assertResolvedPublicHostname(url),
  fetch: (input, init) => credentialedFetch(new URL(String(input)), { redirects: 'same-origin' }),
};
`;

/** The surfaces the guard asserts on every run, so a tree without them is never the subject. */
const BASE_TREE = {
  'apps/web/lib/url-fetch/guarded-fetch.ts': SHARED_TRANSPORT,
  'apps/web/lib/url-fetch/url-fetch-tool.ts': FETCH_TOOL,
  'apps/web/lib/web-search/web-search-tool.ts': SEARCH_TOOL,
  'apps/web/lib/mcp-egress-policy.ts': MCP_POLICY,
};

function withTree(files, run, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'egress-inventory-'));
  try {
    const tree = options.bare ? files : { ...BASE_TREE, ...files };
    for (const [name, contents] of Object.entries(tree)) {
      if (contents === null) continue;
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
  withTree(
    { 'README.md': 'nothing here' },
    (root) => {
      const { code, output } = runGuard(root);
      assert.equal(code, 1);
      assert.match(output, /no source file was found/);
    },
    { bare: true },
  );
});

test('a module under a feature server directory is inspected too', () => {
  withTree(
    {
      'apps/web/features/plugins/server/registry.ts': `
export async function read(location: { url: string }) {
  return fetch(location.url, { method: 'GET' });
}
`,
    },
    (root) => {
      const { code, output } = runGuard(root);
      assert.equal(code, 1);
      assert.match(output, /features\/plugins\/server\/registry\.ts::read/);
    },
  );
});

test('a tool surface that dials a caller-chosen URL itself fails', () => {
  withTree(
    {
      'apps/web/lib/web-search/web-search-tool.ts': SEARCH_TOOL.replace(
        'return guardedFetch(new URL(url), { maxRedirects: 3, headers: {} });',
        "return fetch(url, { redirect: 'manual' });",
      ),
    },
    (root) => {
      const { code, output } = runGuard(root);
      assert.equal(code, 1);
      assert.match(output, /fetchPageMetadata calls fetch\(\) directly/);
    },
  );
});

test('a literal vendor endpoint on a tool surface is not a caller-chosen URL', () => {
  withTree({}, (root) => assert.equal(runGuard(root).code, 0));
});

test('a tool surface that stops using the shared transport fails', () => {
  withTree(
    {
      'apps/web/lib/web-search/web-search-tool.ts': 'export const nothing = 1;\n',
      'apps/web/lib/url-fetch/url-fetch-tool.ts': 'export const other = 2;\n',
    },
    (root) => {
      const { code, output } = runGuard(root);
      assert.equal(code, 1);
      assert.match(output, /never calls guardedFetch/);
    },
  );
});

test('the shared transport going missing fails on its own', () => {
  withTree({ 'apps/web/lib/url-fetch/guarded-fetch.ts': null }, (root) => {
    const { code, output } = runGuard(root);
    assert.equal(code, 1);
    assert.match(output, /there is no one place that vets a hop/);
  });
});

test('an MCP policy that hands the client a fetch of its own fails', () => {
  withTree(
    {
      'apps/web/lib/mcp-egress-policy.ts': MCP_POLICY.replace(
        "fetch: (input, init) => credentialedFetch(new URL(String(input)), { redirects: 'same-origin' }),",
        'fetch: (input, init) => pinnedPublicFetch(input, init),',
      ).replace("import { credentialedFetch } from '@/lib/url-fetch/guarded-fetch';\n", ''),
    },
    (root) => {
      const { code, output } = runGuard(root);
      assert.equal(code, 1);
      assert.match(output, /hands the MCP client a fetch of its own/);
    },
  );
});

test('expressionRoots reads through a template to each interpolation', () => {
  assert.deepEqual(expressionRoots('`${base}/x/${id}`'), ['base']);
  assert.deepEqual(expressionRoots('`https://fixed.example/x/${id}`'), []);
  assert.deepEqual(expressionRoots('row.endpoint'), ['row']);
  assert.deepEqual(expressionRoots('new URL(target)'), ['URL']);
  assert.deepEqual(expressionRoots("'https://fixed.example'"), []);
});

test('only the interpolations that can still name a host count', () => {
  assert.deepEqual(expressionRoots('`/api/items/${id}`'), []);
  assert.deepEqual(expressionRoots('`${scheme}://${host}/path/${id}`'), ['scheme', 'host']);
  assert.deepEqual(expressionRoots('`https://${host}/path/${id}`'), ['host']);
  assert.deepEqual(expressionRoots('`//${host}/path`'), ['host']);
  assert.deepEqual(expressionRoots('`${BASE}/repos/${encodeURIComponent(ref)}`'), ['BASE']);
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
