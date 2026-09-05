import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_JSON = path.join(PACKAGE_ROOT, 'generated', 'registry.json');
const HARNESSES_JSON = path.join(PACKAGE_ROOT, 'catalog', 'harnesses.json');
const GATEWAYS_JSON = path.join(PACKAGE_ROOT, 'catalog', 'gateways.json');

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
const ENV_VAR_NAME = /^[A-Z][A-Z0-9_]*$/u;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/u;

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
    ([, harness]) =>
      harness.protocol !== PROVIDER_NATIVE_PROTOCOL && harness.gatewayId === undefined,
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

test('a gateway-backed harness names env vars and never a literal endpoint or key', () => {
  const gatewayBacked = Object.entries(registry.harnesses).filter(
    ([, harness]) => harness.gatewayId !== undefined,
  );
  assert.ok(gatewayBacked.length > 0, 'the catalog must exercise at least one gateway harness');
  for (const [harnessId, harness] of gatewayBacked) {
    assert.notEqual(harness.protocol, PROVIDER_NATIVE_PROTOCOL, `${harnessId} must name a dialect`);
    assert.equal(harness.baseUrl, undefined, `${harnessId} must not carry a literal base url`);
    assert.equal(harness.apiKeyEnv, undefined, `${harnessId} must not carry a literal key env`);
    const gateway = registry.gateways[harness.gatewayId];
    assert.ok(gateway, `${harnessId} references unknown gateway ${harness.gatewayId}`);
    assert.match(gateway.baseUrlEnv, ENV_VAR_NAME, `${harnessId} gateway must name a base url env`);
    assert.match(gateway.apiKeyEnv, ENV_VAR_NAME, `${harnessId} gateway must name a key env`);
    assert.equal(
      gateway.host.includes('/'),
      false,
      `${harnessId} gateway host must be a bare hostname`,
    );
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

test('only a reviewed gateway definition widens the base-url allowlist', () => {
  const gatewayBacked = Object.entries(registry.harnesses).filter(
    ([, harness]) => harness.gatewayId !== undefined,
  );
  assert.ok(gatewayBacked.length > 0, 'the catalog must exercise at least one gateway harness');
  for (const [harnessId, harness] of gatewayBacked) {
    if (harness.hostPolicy !== REGISTRY_DECLARED_HOST_POLICY) continue;
    const gateway = registry.gateways[harness.gatewayId];
    assert.match(
      gateway.governanceReviewedOn ?? '',
      ISO_DAY,
      `${harnessId} widens the egress allowlist through a gateway whose governance records no review`,
    );
  }
});

test('a gateway definition records a review only from a sourced, dated governance block', () => {
  const authoredGateways = JSON.parse(fs.readFileSync(GATEWAYS_JSON, 'utf8')).gateways;
  for (const [gatewayId, gateway] of Object.entries(registry.gateways)) {
    const governance = authoredGateways[gatewayId]?.governance ?? {};
    const reviewed = gateway.governanceReviewedOn !== undefined;
    const sourced =
      typeof governance.source === 'string' && governance.source.startsWith('https://');
    const dated = typeof governance.verifiedOn === 'string' && ISO_DAY.test(governance.verifiedOn);
    assert.equal(
      reviewed,
      sourced && dated,
      `${gatewayId} review marker disagrees with its source`,
    );
  }
});

test('only a registry-declared host policy widens the base-url allowlist', () => {
  const declaredHosts = new Set([
    ...Object.values(registry.harnesses)
      .filter((harness) => harness.hostPolicy === REGISTRY_DECLARED_HOST_POLICY && harness.baseUrl)
      .map((harness) => new URL(harness.baseUrl).hostname.toLowerCase()),
    ...Object.values(registry.harnesses)
      .filter(
        (harness) => harness.hostPolicy === REGISTRY_DECLARED_HOST_POLICY && harness.gatewayId,
      )
      .filter((harness) => registry.gateways[harness.gatewayId].governanceReviewedOn)
      .map((harness) => registry.gateways[harness.gatewayId].host.toLowerCase()),
  ]);
  for (const harness of Object.values(registry.harnesses)) {
    if (harness.hostPolicy !== ALLOWLIST_ONLY_HOST_POLICY || !harness.baseUrl) continue;
    assert.equal(
      declaredHosts.has(new URL(harness.baseUrl).hostname.toLowerCase()),
      false,
      'an allowlist-only harness must not be admitted through a registry declaration',
    );
  }
});
