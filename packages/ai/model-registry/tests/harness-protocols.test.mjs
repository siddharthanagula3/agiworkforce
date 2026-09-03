import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_JSON = path.join(PACKAGE_ROOT, 'generated', 'registry.json');
const HARNESSES_JSON = path.join(PACKAGE_ROOT, 'catalog', 'harnesses.json');

const PROVIDER_NATIVE_PROTOCOL = 'provider_native';
const REGISTRY_DECLARED_HOST_POLICY = 'registry_declared';
const ALLOWLIST_ONLY_HOST_POLICY = 'allowlist_only';
const PROTOCOLS = new Set([
  'openai_chat',
  'openai_responses',
  'anthropic_messages',
  'gemini_native',
  PROVIDER_NATIVE_PROTOCOL,
]);
const HOST_POLICIES = new Set([ALLOWLIST_ONLY_HOST_POLICY, REGISTRY_DECLARED_HOST_POLICY]);
const HTTPS_URL_PROTOCOL = 'https:';

const registry = JSON.parse(fs.readFileSync(REGISTRY_JSON, 'utf8'));
const authored = JSON.parse(fs.readFileSync(HARNESSES_JSON, 'utf8')).harnesses;

test('every compiled harness names a known protocol and host policy', () => {
  for (const [harnessId, harness] of Object.entries(registry.harnesses)) {
    assert.ok(PROTOCOLS.has(harness.protocol), `${harnessId} protocol ${harness.protocol}`);
    assert.ok(
      HOST_POLICIES.has(harness.hostPolicy),
      `${harnessId} hostPolicy ${harness.hostPolicy}`,
    );
  }
});

test('a harness that declares no protocol compiles to the provider-native default', () => {
  const undeclared = Object.entries(authored).filter(
    ([, harness]) => harness.protocol === undefined,
  );
  assert.ok(undeclared.length > 0, 'the catalog must still carry provider-native harnesses');
  for (const [harnessId] of undeclared) {
    assert.equal(registry.harnesses[harnessId].protocol, PROVIDER_NATIVE_PROTOCOL);
    assert.equal(registry.harnesses[harnessId].hostPolicy, ALLOWLIST_ONLY_HOST_POLICY);
    assert.equal(registry.harnesses[harnessId].baseUrl, undefined);
    assert.equal(registry.harnesses[harnessId].apiKeyEnv, undefined);
  }
});

test('a harness that names a wire protocol carries the base url and key env to reach it', () => {
  const declared = Object.entries(registry.harnesses).filter(
    ([, harness]) => harness.protocol !== PROVIDER_NATIVE_PROTOCOL,
  );
  assert.ok(declared.length > 0, 'the catalog must exercise at least one protocol harness');
  for (const [harnessId, harness] of declared) {
    assert.equal(
      new URL(harness.baseUrl).protocol,
      HTTPS_URL_PROTOCOL,
      `${harnessId} must dispatch over https`,
    );
    assert.match(harness.apiKeyEnv, /^[A-Z][A-Z0-9_]*$/u, `${harnessId} must name a key env var`);
  }
});

test('every route on a protocol harness reaches its model through a dispatchable endpoint', () => {
  const protocolRoutes = Object.entries(registry.routes).filter(
    ([, route]) => registry.harnesses[route.harnessId].protocol !== PROVIDER_NATIVE_PROTOCOL,
  );
  assert.ok(protocolRoutes.length > 0, 'the catalog must exercise at least one protocol route');
  for (const [routeId, route] of protocolRoutes) {
    const harness = registry.harnesses[route.harnessId];
    assert.equal(harness.provider, route.provider, `${routeId} harness must serve its provider`);
    assert.ok(route.providerModelId.length > 0, `${routeId} must name an upstream model id`);
  }
});

test('only a registry-declared host policy widens the base-url allowlist', () => {
  const declaredHosts = new Set(
    Object.values(registry.harnesses)
      .filter((harness) => harness.hostPolicy === REGISTRY_DECLARED_HOST_POLICY && harness.baseUrl)
      .map((harness) => new URL(harness.baseUrl).hostname.toLowerCase()),
  );
  for (const harness of Object.values(registry.harnesses)) {
    if (harness.hostPolicy !== ALLOWLIST_ONLY_HOST_POLICY || !harness.baseUrl) continue;
    assert.equal(
      declaredHosts.has(new URL(harness.baseUrl).hostname.toLowerCase()),
      false,
      'an allowlist-only harness must not be admitted through a registry declaration',
    );
  }
});
