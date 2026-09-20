#!/usr/bin/env node

/**
 * Enumerates the compiled model registry and refuses a record that is
 * internally inconsistent: a route pointing at a model or harness that is not
 * there, a trust mode the harness cannot carry, a live route on a dead model, a
 * deprecation with nowhere to send the traffic, a managed route that bills
 * nothing. The vocabularies come from the registry's own JSON schema and from
 * the registry itself, so this guard holds no second copy of them.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const REGISTRY_PATH = 'packages/ai/model-registry/generated/registry.json';
const SCHEMA_PATH = 'packages/ai/model-registry/schema/registry.schema.json';

const MANAGED_TRUST_MODE = 'managed_cloud';
const LIVE_AVAILABILITY = 'live';
const ROUTER_ROLE = 'router';

/** Kinds whose answer is a token stream, so a context window is meaningful. */
const TOKEN_CONTEXT_KINDS = new Set(['chat', 'reasoning', 'code', 'multimodal', 'embedding']);

/**
 * Capability flags the catalog has never decided for any model, so a router
 * that needs them has no answer to read. They stay listed here rather than
 * silently tolerated everywhere: the guard refuses a model that leaves any
 * OTHER flag undecided, and this list may only shrink.
 */
const UNDECIDED_CAPABILITIES = new Set([
  'imageEditing',
  'realtime',
  'reranking',
  'toolSchemaSupport',
]);

function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function schemaEnum(schema, definition) {
  const defs = schema.$defs ?? schema.definitions ?? {};
  const values = defs[definition]?.enum;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`registry schema declares no ${definition} vocabulary to check against`);
  }
  return new Set(values);
}

function schemaRequired(schema, definition) {
  const defs = schema.$defs ?? schema.definitions ?? {};
  const fields = defs[definition]?.required;
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new Error(`registry schema requires no field of ${definition} to check against`);
  }
  return fields;
}

function isFiniteRate(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function collectViolations(registry, schema) {
  const violations = [];
  const fail = (check, subject, detail) => violations.push({ check, subject, detail });

  const trustModes = schemaEnum(schema, 'trustMode');
  const requiredCapabilityFlags = schemaRequired(schema, 'capabilities');
  const cacheClasses = schemaEnum(schema, 'routeCacheClass');
  const commercialStatuses = schemaEnum(schema, 'routeCommercialStatus');
  const dataRetentions = schemaEnum(schema, 'routeDataRetention');

  const models = registry.models ?? {};
  const routes = registry.routes ?? {};
  const harnesses = registry.harnesses ?? {};
  const capabilities = registry.capabilities ?? {};
  const limits = registry.limits ?? {};
  const pricing = registry.pricing ?? {};
  const governance = registry.governance ?? {};
  const retired = registry.retiredModels ?? {};

  const residencyRegions = new Set(
    Object.values(governance).flatMap((record) =>
      Array.isArray(record?.residencyRegions) ? record.residencyRegions : [],
    ),
  );

  const liveRoutedModels = new Set();
  for (const route of Object.values(routes)) {
    if (route?.availability === LIVE_AVAILABILITY) liveRoutedModels.add(route.modelKey);
  }

  for (const [modelKey, model] of Object.entries(models)) {
    const identity = model?.identity ?? {};
    const lifecycle = model?.lifecycle ?? {};

    if (identity.key !== modelKey) {
      fail('model identity', modelKey, `identity.key is ${identity.key ?? 'absent'}`);
    }
    if (retired[modelKey]) {
      fail('retired model', modelKey, 'a retired id is still a catalog model');
    }
    const declared = capabilities[modelKey];
    if (!declared) {
      fail('model capabilities', modelKey, 'no capability record');
    } else {
      for (const flag of requiredCapabilityFlags) {
        if (typeof declared[flag] === 'boolean') continue;
        if (declared[flag] === null && UNDECIDED_CAPABILITIES.has(flag)) continue;
        fail(
          'model capabilities',
          modelKey,
          `${flag} is ${String(declared[flag])}, not a decision`,
        );
      }
    }
    if (!limits[modelKey]) fail('model limits', modelKey, 'no limits record');
    if (!pricing[modelKey]) fail('model pricing', modelKey, 'no pricing record');

    if (TOKEN_CONTEXT_KINDS.has(identity.kind)) {
      const contextTokens = limits[modelKey]?.contextTokens;
      if (!(typeof contextTokens === 'number' && contextTokens > 0)) {
        fail('model limits', modelKey, `kind ${identity.kind} declares no positive contextTokens`);
      }
    }

    // `null` is the registry's way of saying the provider publishes no region
    // list, which is an evidence gap the router admits rather than a claim.
    if (model?.residencyRegions !== null && !Array.isArray(model?.residencyRegions)) {
      fail('model residency', modelKey, 'residencyRegions is neither a list nor unpublished');
    } else if (Array.isArray(model.residencyRegions)) {
      for (const region of model.residencyRegions) {
        if (!residencyRegions.has(region)) {
          fail('model residency', modelKey, `region ${region} is published by no provider`);
        }
      }
    }

    const isDeprecated = lifecycle.deprecated === true || lifecycle.status === 'deprecated';
    if (isDeprecated) {
      if (!lifecycle.deprecatedOn) {
        fail('deprecation', modelKey, 'deprecated without the day it was deprecated');
      }
      const replacement = lifecycle.replacedBy;
      if (!replacement) {
        fail('deprecation', modelKey, 'deprecated with no replacement to send traffic to');
      } else {
        const target = models[replacement];
        if (!target) {
          fail('deprecation', modelKey, `replacement ${replacement} is not a catalog model`);
        } else if (target.lifecycle?.deprecated === true) {
          fail('deprecation', modelKey, `replacement ${replacement} is itself deprecated`);
        }
      }
    }

    if (lifecycle.availability === LIVE_AVAILABILITY && !liveRoutedModels.has(modelKey)) {
      fail('model reachability', modelKey, 'live model has no live route');
    }
  }

  for (const [routeId, route] of Object.entries(routes)) {
    const model = models[route?.modelKey];
    if (!model) {
      fail('route model', routeId, `modelKey ${route?.modelKey} is not a catalog model`);
    }
    if (retired[route?.modelKey]) {
      fail('retired model', routeId, `route still serves retired id ${route.modelKey}`);
    }

    const harness = harnesses[route?.harnessId];
    if (!harness) {
      fail('route harness', routeId, `harnessId ${route?.harnessId} is not a catalog harness`);
    } else if (harness.provider !== route.provider) {
      fail(
        'route harness',
        routeId,
        `route provider ${route.provider} does not match harness provider ${harness.provider}`,
      );
    }

    if (!Array.isArray(route?.trustModes) || route.trustModes.length === 0) {
      fail('route trust modes', routeId, 'declares no trust mode');
    } else {
      for (const mode of route.trustModes) {
        if (!trustModes.has(mode)) {
          fail('route trust modes', routeId, `trust mode ${mode} is outside the vocabulary`);
        } else if (harness && !(harness.trustModes ?? []).includes(mode)) {
          fail('route trust modes', routeId, `harness ${route.harnessId} cannot carry ${mode}`);
        }
      }
    }

    if (!cacheClasses.has(route?.cacheClass)) {
      fail('route vocabulary', routeId, `cacheClass ${route?.cacheClass} is unknown`);
    }
    if (!commercialStatuses.has(route?.commercialStatus)) {
      fail('route vocabulary', routeId, `commercialStatus ${route?.commercialStatus} is unknown`);
    }
    if (!dataRetentions.has(route?.dataRetention)) {
      fail('route vocabulary', routeId, `dataRetention ${route?.dataRetention} is unknown`);
    }

    const isServing = route?.selectable === true && route?.availability === LIVE_AVAILABILITY;
    if (isServing && model) {
      if (model.lifecycle?.availability !== LIVE_AVAILABILITY) {
        fail(
          'route lifecycle',
          routeId,
          `serves ${route.modelKey}, whose availability is ${model.lifecycle?.availability}`,
        );
      }
      if (model.lifecycle?.deprecated === true) {
        fail('route lifecycle', routeId, `serves deprecated model ${route.modelKey}`);
      }
    }

    const price = route?.pricing;
    if (!price) {
      fail('route pricing', routeId, 'no pricing block');
      continue;
    }
    // The model's own price sheet and the route's are compiled separately, so
    // a unit or currency that drifts between them is a billing layer reading
    // one number in the other's units.
    const modelPrice = pricing[route?.modelKey];
    if (modelPrice) {
      if (modelPrice.unit !== price.unit) {
        fail('route pricing', routeId, `unit ${price.unit} but model prices in ${modelPrice.unit}`);
      }
      if (modelPrice.currency !== price.currency) {
        fail(
          'route pricing',
          routeId,
          `currency ${price.currency} but model prices in ${modelPrice.currency}`,
        );
      }
    }
    // Only the numeric fields are rates; a price sheet also carries structured
    // members such as a promo expiry or a per-resolution table.
    for (const [rate, value] of Object.entries(price)) {
      if (typeof value !== 'number') continue;
      if (!isFiniteRate(value)) {
        fail('route pricing', routeId, `${rate} is ${String(value)}, not a rate`);
      }
    }

    if (isServing && (route.trustModes ?? []).includes(MANAGED_TRUST_MODE) && model) {
      const producesTokens = capabilities[route.modelKey]?.textOutput === true;
      const isRouterAlias = model.identity?.role === ROUTER_ROLE;
      if (producesTokens && !isRouterAlias && !(price.inputPerMillion > 0)) {
        fail(
          'managed pricing',
          routeId,
          `managed route bills ${price.inputPerMillion} per million input tokens`,
        );
      }
    }
  }

  return violations;
}

function main() {
  const root = process.cwd();
  const registryArgument = process.argv.indexOf('--registry');
  const registryPath = registryArgument === -1 ? REGISTRY_PATH : process.argv[registryArgument + 1];
  const registry = readJson(root, registryPath);
  const schema = readJson(root, SCHEMA_PATH);
  const violations = collectViolations(registry, schema);

  if (violations.length > 0) {
    console.error('Model registry integrity check FAILED:\n');
    for (const violation of violations) {
      console.error(`- [${violation.check}] ${violation.subject}: ${violation.detail}`);
    }
    console.error(`\n${violations.length} violation(s).`);
    process.exit(1);
  }

  const modelCount = Object.keys(registry.models ?? {}).length;
  const routeCount = Object.keys(registry.routes ?? {}).length;
  console.log(
    `Model registry integrity check passed (${modelCount} models, ${routeCount} routes).`,
  );
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main();
}
