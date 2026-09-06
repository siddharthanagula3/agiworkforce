import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_JSON = path.join(PACKAGE_ROOT, 'generated', 'registry.json');
const MODEL_ROUTES_JSON = path.join(PACKAGE_ROOT, 'catalog', 'model-routes.json');
const HARNESSES_JSON = path.join(PACKAGE_ROOT, 'catalog', 'harnesses.json');

const CACHE_CLASSES = new Set([
  'provider_implicit_prompt_cache',
  'provider_explicit_prompt_cache',
  'gateway_prompt_cache',
  'gateway_response_cache',
  'no_provider_cache',
]);
const COMMERCIAL_STATUSES = new Set([
  'agi_direct',
  'customer_byok',
  'authorized_marketplace',
  'free_commercial',
  'experimental_only',
  'blocked',
]);
const DATA_RETENTIONS = new Set(['zero_retention', 'provider_default', 'conditional', 'unknown']);
const UNKNOWN_GOVERNANCE_VALUE = 'unknown';
const ZERO_RETENTION = 'zero_retention';
const CACHE_TOKEN_BILLING_CLASSES = new Set([
  'additional_to_input',
  'included_in_input',
  'unknown',
]);

const registry = JSON.parse(fs.readFileSync(REGISTRY_JSON, 'utf8'));
const declarations = JSON.parse(fs.readFileSync(MODEL_ROUTES_JSON, 'utf8'));
const harnesses = JSON.parse(fs.readFileSync(HARNESSES_JSON, 'utf8')).harnesses;

function routesForModel(modelKey) {
  return Object.entries(registry.routes).filter(([, route]) => route.modelKey === modelKey);
}

test('every canonical model keeps exactly one default route at its historic id', () => {
  for (const modelKey of Object.keys(registry.models)) {
    const routes = routesForModel(modelKey);
    assert.ok(routes.length >= 1, `${modelKey} must have at least one route`);
    const defaults = routes.filter(([, route]) => route.isDefault);
    assert.equal(defaults.length, 1, `${modelKey} must have exactly one default route`);
    const [defaultRouteId, defaultRoute] = defaults[0];
    assert.equal(
      defaultRouteId,
      `${registry.models[modelKey].identity.provider}/${modelKey}`,
      `${modelKey} default route id must stay provider-keyed`,
    );
    assert.equal(defaultRoute.provider, registry.models[modelKey].identity.provider);
    assert.deepEqual(
      defaultRoute.pricing,
      registry.pricing[modelKey],
      `${modelKey} default route must carry the model-level price sheet`,
    );
  }
});

test('every route declares a known cache class, commercial status and its own prices', () => {
  for (const [routeId, route] of Object.entries(registry.routes)) {
    assert.ok(CACHE_CLASSES.has(route.cacheClass), `${routeId} cache class ${route.cacheClass}`);
    assert.ok(
      COMMERCIAL_STATUSES.has(route.commercialStatus),
      `${routeId} commercial status ${route.commercialStatus}`,
    );
    assert.ok(
      DATA_RETENTIONS.has(route.dataRetention),
      `${routeId} data retention ${route.dataRetention}`,
    );
    assert.equal(route.pricing.currency, 'USD', `${routeId} must price in USD`);
    assert.ok(route.pricing.unit.length > 0, `${routeId} must name a pricing unit`);
    assert.equal(
      route.harnessId in harnesses,
      true,
      `${routeId} references unknown harness ${route.harnessId}`,
    );
    assert.equal(
      harnesses[route.harnessId].provider,
      route.provider,
      `${routeId} harness must serve its own provider`,
    );
    assert.deepEqual(
      route.trustModes,
      harnesses[route.harnessId].trustModes,
      `${routeId} trust modes must come from its own harness`,
    );
  }
});

const MANAGED_OPEN_ROUTER_HARNESS_ID = 'open-router/chat-completions-managed';
const MANAGED_OPEN_ROUTER_DEFAULT_KEYS = Object.entries(declarations.models)
  .filter(
    ([, declaration]) => declaration.defaultRoute?.harnessId === MANAGED_OPEN_ROUTER_HARNESS_ID,
  )
  .map(([modelKey]) => modelKey);
const MANAGED_OPEN_ROUTER_MODEL_KEYS = Object.entries(declarations.models)
  .filter(([, declaration]) =>
    (declaration.additionalRoutes ?? []).some(
      (route) =>
        route.provider === 'open_router' && route.harnessId === MANAGED_OPEN_ROUTER_HARNESS_ID,
    ),
  )
  .map(([modelKey]) => modelKey)
  .concat(MANAGED_OPEN_ROUTER_DEFAULT_KEYS);

test('the openrouter route admits managed traffic only for the models the registry names', () => {
  for (const [routeId, route] of Object.entries(registry.routes)) {
    if (route.provider !== 'open_router' || route.harnessId.startsWith('open_router/')) continue;
    const admitsManaged = route.trustModes.includes('managed_cloud');
    assert.equal(
      admitsManaged,
      MANAGED_OPEN_ROUTER_MODEL_KEYS.includes(route.modelKey),
      `${routeId} managed_cloud admission must match the named roster`,
    );
    if (admitsManaged) {
      assert.equal(
        route.commercialStatus,
        'authorized_marketplace',
        `${routeId} must keep its authorized_marketplace status while admitting managed traffic`,
      );
      assert.equal(
        route.isDefault,
        MANAGED_OPEN_ROUTER_DEFAULT_KEYS.includes(route.modelKey),
        `${routeId} is the default route only for a model whose canonical provider is openrouter`,
      );
    }
  }
  for (const modelKey of MANAGED_OPEN_ROUTER_MODEL_KEYS) {
    const route = registry.routes[`open_router/${modelKey}`];
    assert.ok(route, `open_router/${modelKey} must be compiled`);
    assert.deepEqual(route.trustModes, ['managed_cloud', 'byok']);
  }
});

test('a declared additional route compiles to a second priced route on the same model', () => {
  const declared = Object.entries(declarations.models).flatMap(([modelKey, declaration]) =>
    (declaration.additionalRoutes ?? []).map((route) => [modelKey, route]),
  );
  assert.ok(declared.length > 0, 'the catalog must exercise at least one additional route');

  for (const [modelKey, declaration] of declared) {
    const routeId = `${declaration.provider}/${modelKey}`;
    const route = registry.routes[routeId];
    assert.ok(route, `${routeId} must be compiled`);
    assert.equal(route.isDefault, false);
    assert.equal(route.modelKey, modelKey);
    assert.equal(route.providerModelId, declaration.upstreamModelId);
    assert.equal(route.cacheClass, declaration.cacheClass);
    assert.equal(route.commercialStatus, declaration.commercialStatus);
    if (declaration.discount === undefined) {
      assert.equal(route.discount, undefined);
      assert.equal(route.pricing.inputPerMillion, declaration.pricing.inputPerMillion);
      assert.equal(route.pricing.outputPerMillion, declaration.pricing.outputPerMillion);
      assert.equal(route.pricing.cacheReadPerMillion, declaration.pricing.cacheReadPerMillion);
      assert.equal(
        route.pricing.cacheWritePerMillion,
        declaration.pricing.cacheWritePerMillion ??
          (declaration.cacheClass === 'provider_implicit_prompt_cache'
            ? declaration.pricing.inputPerMillion
            : undefined),
      );
    } else {
      const harness = harnesses[route.harnessId];
      const gateway = registry.gateways[harness.gatewayId];
      assert.ok(gateway?.discount, `${routeId} names a gateway discount policy`);
      const factor = (100 - gateway.discount.minPercent) / 100;
      const list = registry.pricing[modelKey];
      assert.equal(route.discount.minPercent, gateway.discount.minPercent);
      assert.equal(route.discount.requestField, gateway.discount.requestField);
      assert.equal(route.discount.listPricing.inputPerMillion, list.inputPerMillion);
      assert.equal(
        route.pricing.inputPerMillion,
        Number((list.inputPerMillion * factor).toFixed(6)),
      );
      assert.equal(
        route.pricing.outputPerMillion,
        Number((list.outputPerMillion * factor).toFixed(6)),
      );
      assert.ok(route.pricing.inputPerMillion < list.inputPerMillion);
    }
    assert.notEqual(
      route.provider,
      registry.models[modelKey].identity.provider,
      `${routeId} must reach the model through a different provider than the default route`,
    );
  }
});

test('every route takes its data retention from its provider governance record', () => {
  const routes = Object.entries(registry.routes);
  assert.ok(routes.length > 0, 'the catalog must exercise at least one route');
  for (const [routeId, route] of routes) {
    const entry = registry.governance[route.provider];
    assert.ok(entry, `${routeId} provider ${route.provider} has no governance record`);
    assert.equal(
      route.dataRetention,
      entry.dataRetentionClass,
      `${routeId} must carry the retention class its provider declares`,
    );
  }
});

test('a zero-retention claim always cites a source and a day it was read', () => {
  for (const [providerId, entry] of Object.entries(registry.governance)) {
    if (entry.dataRetentionClass !== ZERO_RETENTION) continue;
    assert.ok(entry.source, `${providerId} claims zero retention without a source`);
    assert.ok(entry.verifiedOn, `${providerId} claims zero retention without a verified date`);
  }
});

test('a governance record with nothing verified claims no source', () => {
  for (const [providerId, entry] of Object.entries(registry.governance)) {
    const everythingUnknown =
      entry.dataRetentionClass === UNKNOWN_GOVERNANCE_VALUE &&
      entry.zeroDataRetentionAvailability === UNKNOWN_GOVERNANCE_VALUE &&
      entry.trainsOnInputs === UNKNOWN_GOVERNANCE_VALUE &&
      entry.residencyRegions === null;
    if (!everythingUnknown) continue;
    assert.equal(entry.source, undefined, `${providerId} cites a source for nothing verified`);
  }
});

test('every provider declares a known cache-token billing class', () => {
  for (const [providerId, entry] of Object.entries(registry.governance)) {
    assert.ok(
      CACHE_TOKEN_BILLING_CLASSES.has(entry.cacheTokenBillingClass),
      `${providerId} cacheTokenBillingClass ${entry.cacheTokenBillingClass} is not a known class`,
    );
  }
});

test('a verified cache-token billing class always cites a source and a day it was read', () => {
  for (const [providerId, entry] of Object.entries(registry.governance)) {
    if (entry.cacheTokenBillingClass === UNKNOWN_GOVERNANCE_VALUE) {
      assert.equal(
        entry.cacheTokenBillingSource,
        undefined,
        `${providerId} claims a cache-token billing class of unknown but cites a source`,
      );
      continue;
    }
    assert.ok(
      entry.cacheTokenBillingSource,
      `${providerId} claims a cache-token billing class without a source`,
    );
    assert.ok(
      entry.cacheTokenBillingVerifiedOn,
      `${providerId} claims a cache-token billing class without a verified date`,
    );
  }
});

test('anthropic and every provider proxying it through the Anthropic Messages protocol report cache tokens additional to input', () => {
  const anthropicProtocolProviders = new Set(
    Object.values(registry.harnesses)
      .filter((harness) => harness.protocol === 'anthropic_messages')
      .map((harness) => harness.provider),
  );
  anthropicProtocolProviders.add('anthropic');
  for (const providerId of anthropicProtocolProviders) {
    assert.equal(
      registry.governance[providerId]?.cacheTokenBillingClass,
      'additional_to_input',
      `${providerId} speaks the Anthropic Messages protocol and must report cache tokens additional to input`,
    );
  }
});

test('every declared compute-pricing entry carries a known unit, a positive rate, and its own source', () => {
  const entries = Object.entries(registry.computePricing);
  assert.ok(entries.length > 0, 'the catalog must declare at least one compute-pricing provider');
  for (const [providerId, entry] of entries) {
    assert.equal(
      entry.unit,
      'usd_per_vcpu_second',
      `${providerId} compute pricing unit ${entry.unit} is not a known unit`,
    );
    assert.ok(entry.ratePerUnit > 0, `${providerId} compute pricing rate must be positive`);
    assert.ok(entry.source, `${providerId} compute pricing has no source`);
    assert.ok(entry.verifiedOn, `${providerId} compute pricing has no verified date`);
  }
});

test('e2b sandbox compute pricing is declared in the registry, not a literal in compute-metering.ts', () => {
  assert.ok(registry.computePricing.e2b, 'e2b must have a compute-pricing entry');
  assert.equal(registry.computePricing.e2b.ratePerUnit, 0.000014);
});

test('a marketplace route never bills above its list price and always names its ceiling', () => {
  const discounted = Object.entries(registry.routes).filter(([, route]) => route.discount);
  assert.ok(discounted.length > 0, 'the catalog must exercise at least one discount route');
  for (const [routeId, route] of discounted) {
    assert.ok(route.discount.minPercent > 0 && route.discount.minPercent < 100, routeId);
    assert.ok(route.discount.source.startsWith('https://'), routeId);
    for (const field of ['inputPerMillion', 'outputPerMillion']) {
      assert.ok(route.pricing[field] <= route.discount.listPricing[field], `${routeId} ${field}`);
    }
  }
});

test('a marketplace or third-party host stays experimental until its commercial terms are confirmed', () => {
  for (const [routeId, route] of Object.entries(registry.routes)) {
    if (!['deepinfra', 'together', 'novita', 'cheaperinference'].includes(route.provider)) continue;
    assert.equal(route.commercialStatus, 'experimental_only', routeId);
    assert.ok(!route.trustModes.includes('byok'), routeId);
  }
});
