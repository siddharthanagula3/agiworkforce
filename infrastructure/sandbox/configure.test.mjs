import { URL } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { chromeArtifactParentOrigin, configureSandboxParent } from './configure.mjs';
const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const configuration = JSON.parse(await readFile(new URL('./vercel.json', import.meta.url), 'utf8'));
const extensionId = 'a'.repeat(32);

test('the configured exact extension origin reaches both framing and actual renderer admission', () => {
  const result = configureSandboxParent(html, configuration, extensionId);
  const policy = result.configuration.headers
    .flatMap((rule) => rule.headers)
    .find((header) => header.key === 'Content-Security-Policy').value;
  assert(policy.includes(`frame-ancestors `));
  assert(policy.includes(result.origin));
  const start = result.html.indexOf('const PRODUCTION_PARENT_ORIGINS');
  const end = result.html.indexOf(
    '\n        //',
    result.html.indexOf('function isAllowedParent', start),
  );
  const context = vm.createContext({
    window: { location: { hostname: 'sandbox.agiworkforce.com' } },
  });
  vm.runInContext(result.html.slice(start, end), context);
  assert.equal(vm.runInContext(`isAllowedParent(${JSON.stringify(result.origin)})`, context), true);
  assert.equal(
    vm.runInContext(`isAllowedParent('chrome-extension://${'b'.repeat(32)}')`, context),
    false,
  );
  assert.equal(vm.runInContext(`isAllowedParent('https://attacker.invalid')`, context), false);
  assert.equal(vm.runInContext(`isAllowedParent('http://localhost:3000')`, context), false);
  assert.equal(vm.runInContext(`isAllowedParent('https://agiworkforce.com')`, context), true);
  assert.equal(
    configuration.headers
      .flatMap((rule) => rule.headers)
      .find((header) => header.key === 'Content-Security-Policy')
      .value.includes(result.origin),
    false,
  );
  assert(result.html.includes('event.source !== window.parent'));
});

test('refuses wildcard, URL, missing and malformed extension identities', () => {
  for (const id of [
    undefined,
    '',
    '*',
    'chrome-extension://' + extensionId,
    'a'.repeat(31),
    'z'.repeat(32),
    extensionId + '/',
  ])
    assert.throws(() => chromeArtifactParentOrigin(id));
});

test('configuration replaces stale extension admission and preserves unrelated isolation headers', () => {
  const first = configureSandboxParent(html, configuration, extensionId);
  const second = configureSandboxParent(first.html, first.configuration, 'b'.repeat(32));
  assert(!second.html.includes(JSON.stringify(first.origin)));
  assert(!JSON.stringify(second.configuration).includes(first.origin));
  for (const original of configuration.headers
    .flatMap((rule) => rule.headers)
    .filter((header) => header.key !== 'Content-Security-Policy'))
    assert.deepEqual(
      second.configuration.headers
        .flatMap((rule) => rule.headers)
        .find((header) => header.key === original.key),
      original,
    );
});

test('fails closed if either policy owner is absent or ambiguous', () => {
  assert.throws(() =>
    configureSandboxParent(
      html.replace('CONFIGURED_EXTENSION_ORIGINS = []', 'MISSING = []'),
      configuration,
      extensionId,
    ),
  );
  assert.throws(() =>
    configureSandboxParent(
      html + 'const CONFIGURED_EXTENSION_ORIGINS = [];',
      configuration,
      extensionId,
    ),
  );
  assert.throws(() => configureSandboxParent(html, { headers: [] }, extensionId));
});
