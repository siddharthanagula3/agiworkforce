import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRendererSandboxServer } from './renderer-sandbox-server.mjs';

async function fixture(t) {
  const server = createRendererSandboxServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('serves the exact sandbox document with every deployed security header', async (t) => {
  const origin = await fixture(t);
  const response = await fetch(origin);
  assert.equal(response.status, 200);
  const root = new URL('../../../../infrastructure/sandbox/', import.meta.url);
  assert.equal(await response.text(), readFileSync(new URL('index.html', root), 'utf8'));
  const config = JSON.parse(readFileSync(new URL('vercel.json', root), 'utf8'));
  for (const { key, value } of config.headers.find((rule) => rule.source === '/(.*)').headers) {
    assert.equal(response.headers.get(key), value, key);
  }
  assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
  assert.match(response.headers.get('content-security-policy'), /connect-src 'none'/);
  assert.equal(response.headers.get('cross-origin-embedder-policy'), 'credentialless');
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'cross-origin');
});

test('refuses other files and mutations while preserving the sandbox policy', async (t) => {
  const origin = await fixture(t);
  for (const pathname of ['/vercel.json', '/../package.json', '/private.html']) {
    const response = await fetch(origin + pathname);
    assert.equal(response.status, 404);
    assert.match(response.headers.get('content-security-policy'), /form-action 'none'/);
  }
  const mutation = await fetch(origin, { method: 'POST', body: 'ignored' });
  assert.equal(mutation.status, 405);
  assert.equal(mutation.headers.get('allow'), 'GET, HEAD');
  const head = await fetch(origin + '/index.html', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});
