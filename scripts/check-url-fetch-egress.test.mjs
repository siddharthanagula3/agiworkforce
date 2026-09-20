import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  fixedEndpointNames,
  importedEndpointNames,
  moduleScopeFunctions,
  outboundFetchCalls,
} from './lib/url-fetch-egress.mjs';

const script = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'check-url-fetch-egress.mjs',
);

const SHARED = `
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

const CONNECTOR = `
import { assertResolvedPublicHostname } from '@/lib/egress-policy';

export async function probe(serverUrl) {
  await assertResolvedPublicHostname(serverUrl);
  return fetch(serverUrl, { method: 'GET', redirect: 'manual' });
}
`;

function buildRoot(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'url-fetch-egress-'));
  const write = (relative, body) => {
    if (body === null) return;
    const full = path.join(root, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  };
  write('apps/web/lib/url-fetch/guarded-fetch.ts', overrides.shared ?? SHARED);
  write('apps/web/lib/url-fetch/url-fetch-tool.ts', overrides.fetchTool ?? FETCH_TOOL);
  write('apps/web/lib/web-search/web-search-tool.ts', overrides.searchTool ?? SEARCH_TOOL);
  write('apps/web/lib/connectors/probe.ts', overrides.connector ?? CONNECTOR);
  write('apps/web/lib/mcp-egress-policy.ts', overrides.mcpPolicy ?? MCP_POLICY);
  return root;
}

function run(root) {
  try {
    const stdout = execFileSync(process.execPath, [script, '--root', root], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out: stdout };
  } catch (error) {
    return { code: error.status ?? 1, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

test('passes when the tool surfaces go through the shared function', () => {
  const result = run(buildRoot());
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /reach an unvetted URL/);
});

test('fails a tool surface that calls fetch directly again', () => {
  const root = buildRoot({
    searchTool: SEARCH_TOOL.replace(
      'return guardedFetch(new URL(url), { maxRedirects: 3, headers: {} });',
      "return fetch(url, { redirect: 'manual' });",
    ),
  });
  const result = run(root);
  assert.equal(result.code, 1);
  assert.match(result.out, /fetchPageMetadata calls fetch\(\) directly/);
});

test('fails a tool surface that stops using the shared function at all', () => {
  const root = buildRoot({
    searchTool: 'export const nothing = 1;\n',
    fetchTool: 'export const other = 2;\n',
  });
  const result = run(root);
  assert.equal(result.code, 1);
  assert.match(result.out, /never calls guardedFetch/);
});

test('fails a module outside the tool surfaces that lets the client follow redirects', () => {
  const root = buildRoot({
    connector: CONNECTOR.replace(", redirect: 'manual'", ''),
  });
  const result = run(root);
  assert.equal(result.code, 1);
  assert.match(result.out, /probe fetches fetch\(\) with redirect 'follow \(unset\)'/);
});

test('fails a module that vets no host at all before fetching', () => {
  const root = buildRoot({
    connector: CONNECTOR.replace('  await assertResolvedPublicHostname(serverUrl);\n', ''),
  });
  const result = run(root);
  assert.equal(result.code, 1);
  // With the guard gone the module leaves the scanned set, so the surfaces alone must still fail.
  assert.match(result.out, /guardedFetch|assertResolvedPublicHostname|unvetted/);
});

test('fails an MCP policy that hands the client a fetch of its own', () => {
  const root = buildRoot({
    mcpPolicy: MCP_POLICY.replace(
      "fetch: (input, init) => credentialedFetch(new URL(String(input)), { redirects: 'same-origin' }),",
      'fetch: (input, init) => pinnedPublicFetch(input, init),',
    ).replace("import { credentialedFetch } from '@/lib/url-fetch/guarded-fetch';\n", ''),
  });
  const result = run(root);
  assert.equal(result.code, 1);
  assert.match(result.out, /hands the MCP client a fetch of its own/);
});

test('fails when the shared function has gone', () => {
  const root = buildRoot();
  fs.rmSync(path.join(root, 'apps/web/lib/url-fetch/guarded-fetch.ts'));
  const result = run(root);
  assert.equal(result.code, 1);
  assert.match(result.out, /there is no one place that vets a hop/);
});

test('a literal vendor endpoint, and one built from a literal, are not caller-chosen', () => {
  const names = fixedEndpointNames(SEARCH_TOOL);
  assert.ok(names.includes('VENDOR_ORIGIN'));
  assert.ok(names.includes('VENDOR_SEARCH_URL'));
  const calls = outboundFetchCalls(SEARCH_TOOL);
  assert.equal(
    calls.some((call) => call.target === 'VENDOR_SEARCH_URL'),
    true,
  );
});

test('resolves an endpoint constant that lives in another module', () => {
  const root = buildRoot();
  fs.writeFileSync(
    path.join(root, 'apps/web/lib/connectors/registry.ts'),
    "export const REGISTRY_BASE = 'https://registry.example';\n",
  );
  const consumer = path.join(root, 'apps/web/lib/connectors/consumer.ts');
  const source = [
    "import { REGISTRY_BASE } from './registry';",
    'export async function read(id) {',
    '  return fetch(`${REGISTRY_BASE}/${id}`);',
    '}',
  ].join('\n');
  fs.writeFileSync(consumer, source);
  assert.deepEqual(importedEndpointNames(source, consumer, root), ['REGISTRY_BASE']);
});

test('a function definition is not a call to itself', () => {
  const source =
    'export function pinnedPublicFetch(input, init) {\n  return undiciFetch(input);\n}\n';
  assert.equal(
    outboundFetchCalls(source).some((call) => call.callee === 'pinnedPublicFetch'),
    false,
  );
});

test('attributes a call to the function that has to vet the host', () => {
  const functions = moduleScopeFunctions(CONNECTOR);
  assert.deepEqual(
    functions.map((fn) => fn.name),
    ['probe'],
  );
  const call = outboundFetchCalls(CONNECTOR).find((c) => c.target === 'serverUrl');
  const holder = functions.find((fn) => call.index >= fn.start && call.index < fn.end);
  assert.equal(holder.name, 'probe');
});
