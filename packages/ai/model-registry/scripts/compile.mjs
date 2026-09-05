#!/usr/bin/env node
/* global AbortSignal, fetch */

import { strict as assert } from 'node:assert';
import console from 'node:console';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

import Ajv from 'ajv';
import prettier from 'prettier';

import {
  buildFamilyView,
  collectFamilyRefs,
  loadFamilyCatalog,
  matchFamilyMember,
  resolveFamilyRefsDeep,
  validateFamilyCatalog,
} from './families.mjs';
import {
  LIFECYCLE_STAGE,
  formatStageCensus,
  isLifecycleStage,
  stageAtOrBefore,
} from './lifecycle-stages.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_DIR = path.resolve(SCRIPT_DIR, '..');
const ROOT = path.resolve(REGISTRY_DIR, '..', '..', '..');
const TYPES_DIR = path.join(ROOT, 'packages', 'contracts', 'types', 'src');
const MODELS_JSON = path.join(TYPES_DIR, 'models.json');
const CATALOG_DIR = path.join(REGISTRY_DIR, 'catalog');
const CURATION_JSON = path.join(CATALOG_DIR, 'models.curation.json');
const SYNCED_JSON = path.join(CATALOG_DIR, 'models.synced.json');
const HARNESSES_JSON = path.join(CATALOG_DIR, 'harnesses.json');
const MODEL_ROUTES_JSON = path.join(CATALOG_DIR, 'model-routes.json');
const PROVIDER_GOVERNANCE_JSON = path.join(CATALOG_DIR, 'provider-governance.json');
const PROVIDER_COMPUTE_PRICING_JSON = path.join(CATALOG_DIR, 'provider-compute-pricing.json');
const RETIRED_MODELS_JSON = path.join(CATALOG_DIR, 'retired-models.json');
const PROVIDER_HOSTS_JSON = path.join(CATALOG_DIR, 'provider-hosts.json');
const PROVIDER_DEFAULTS_JSON = path.join(CATALOG_DIR, 'provider-defaults.json');
const ROUTING_POLICIES_JSON = path.join(CATALOG_DIR, 'routing-policies.json');
const REGISTRY_SCHEMA_JSON = path.join(REGISTRY_DIR, 'schema', 'registry.schema.json');
const GENERATED_DIR = path.join(REGISTRY_DIR, 'generated');
const REGISTRY_JSON = path.join(GENERATED_DIR, 'registry.json');
const REGISTRY_TS = path.join(GENERATED_DIR, 'registry.ts');
const RUST_GENERATED_DIR = path.join(ROOT, 'crates', 'agiworkforce-protocol', 'src', 'generated');
const RUST_REGISTRY_JSON = path.join(RUST_GENERATED_DIR, 'model_registry.json');
const RUST_REGISTRY_MODULE = path.join(RUST_GENERATED_DIR, 'model_registry.rs');
const RUST_ROUTING_GENERATED_DIR = path.join(
  ROOT,
  'crates',
  'agiworkforce-model-registry',
  'src',
  'generated',
);
const RUST_ROUTING_REGISTRY_JSON = path.join(RUST_ROUTING_GENERATED_DIR, 'model_registry.json');
const RUST_ROUTING_REGISTRY_MODULE = path.join(RUST_ROUTING_GENERATED_DIR, 'model_registry.rs');
const SKILLSPECTOR_PROVIDER_REGISTRY_YAMLS = Object.fromEntries(
  ['openai', 'anthropic'].map((providerId) => [
    providerId,
    path.join(
      ROOT,
      'tools',
      'skill-vetting',
      'src',
      'skillspector',
      'providers',
      providerId,
      'model_registry.yaml',
    ),
  ]),
);

const MODELS_DEV_URL = 'https://models.dev/api.json';

const SYNCED_FIELDS = [
  'contextWindow',
  'inputCost',
  'outputCost',
  'cached_input',
  'cached_write',
  'cached_write_1h',
  'capabilities',
  'benchmarks',
  'speed',
  'released',
];

const OVERRIDE_KEYS = [
  'costOverride', // { inputCost?, outputCost?, cached_input?, cached_write?, cached_write_1h? }
  'contextOverride', // contextWindow
  'capabilitiesOverride', // capabilities
  'benchmarkOverride', // benchmarks
  'speedOverride', // speed
  'releasedOverride', // released
];

const CANONICAL_ORDER = [
  'id',
  'apiModelId',
  'openRouterSlug',
  'name',
  'provider',
  'modelType',
  'inputModalities',
  'outputModalities',
  'variantPartner',
  'contextWindow',
  'inputCost',
  'outputCost',
  'cached_input',
  'cached_write',
  'cached_write_1h',
  'capabilities',
  'benchmarks',
  'speed',
  'quality',
  'qualityTier',
  'bestFor',
  'released',
  'deprecated',
  'deprecation_date',
  'promo_expires_at',
  'post_promo_prices',
  'pricingSchedule',
  'inputTokenPricingTiers',
  'longContext',
  'supersedes',
  'supersedes_effective_date',
  'supersedes_note',
  'tokenizer_drift_factor',
  'tokenizer_drift_range',
  'tokenizer_drift_warning',
  'imagePerImageCost',
  'imageApi',
  'imageOutputMimeType',
  'videoPerSecondCost',
  'videoPerSecondCostByResolution',
  'videoGeneration',
  'embeddingDimensions',
  'pricingNote',
  'openWeight',
  'license',
  'commercialRestrictions',
];

const TOP_LEVEL_ORDER = [
  'version',
  'lastUpdated',
  'verificationLog',
  'providers',
  'models',
  'tierAllowedModels',
  'providerDefaults',
  'providersInOrder',
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function formatJson(obj, filepath) {
  const cfg = (await prettier.resolveConfig(filepath)) ?? {};
  return prettier.format(JSON.stringify(obj), { ...cfg, parser: 'json', filepath });
}

async function formatTypescript(source, filepath) {
  const cfg = (await prettier.resolveConfig(filepath)) ?? {};
  return prettier.format(source, { ...cfg, parser: 'typescript', filepath });
}

async function writeJson(file, obj) {
  fs.writeFileSync(file, await formatJson(obj, file));
}

function defined(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

function orderKeys(model) {
  const out = {};
  for (const k of CANONICAL_ORDER) if (k in model && model[k] !== undefined) out[k] = model[k];
  // Safety net: surface any unexpected key (so we never silently drop data).
  for (const k of Object.keys(model)) {
    if (!(k in out) && model[k] !== undefined) out[k] = model[k];
  }
  return out;
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
}

function omit(obj, keys) {
  const drop = new Set(keys);
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (!drop.has(k)) out[k] = v;
  return out;
}

const PROVIDER_MAP = {
  openai: 'openai',
  anthropic: 'anthropic',
  google: 'google',
  xai: 'xai',
  deepseek: 'deepseek',
  qwen: 'alibaba',
  moonshot: 'moonshotai',
  mistral: 'mistral',
  zhipu: 'zhipuai',
  perplexity: 'perplexity',
  groq: 'groq',
  open_router: 'openrouter',
};

function devLookup(dev, model) {
  const apiId = model.apiModelId || model.id;
  if (apiId.endsWith(':free')) return null;
  const providerKey = PROVIDER_MAP[model.provider];
  if (!providerKey) return null;
  const upstream = dev[providerKey]?.models;
  if (!upstream) return null;
  const candidates = [apiId, apiId.split('/').pop()];
  for (const c of candidates) {
    const entry = upstream[c];
    if (entry && entry.cost && entry.cost.input != null) return entry;
  }
  return null;
}

async function loadModelsDev() {
  try {
    const res = await fetch(MODELS_DEV_URL, { signal: AbortSignal.timeout(20000) });
    if (res.ok) return await res.json();
    console.warn(`[sync] models.dev returned HTTP ${res.status}; trying /tmp snapshot`);
  } catch (err) {
    console.warn(`[sync] models.dev fetch failed (${err.message}); trying /tmp snapshot`);
  }
  const snap = '/tmp/modelsdev.json';
  if (fs.existsSync(snap)) return readJson(snap);
  throw new Error('models.dev unreachable and no /tmp snapshot available');
}

async function extract() {
  const current = readJson(MODELS_JSON);
  const dev = await loadModelsDev();

  const curationModels = {};
  const syncedModels = {};
  let upstreamCount = 0;

  for (const [id, model] of Object.entries(current.models)) {
    const curated = omit(model, SYNCED_FIELDS);
    const syncedPart = pick(model, SYNCED_FIELDS);
    const isUpstream = devLookup(dev, model) != null;

    if (isUpstream) {
      upstreamCount += 1;
      curationModels[id] = curated;
      if (Object.keys(syncedPart).length) syncedModels[id] = syncedPart;
    } else {
      const overrides = {};
      const cost = pick(syncedPart, [
        'inputCost',
        'outputCost',
        'cached_input',
        'cached_write',
        'cached_write_1h',
      ]);
      if (Object.keys(cost).length) overrides.costOverride = cost;
      if ('contextWindow' in syncedPart) overrides.contextOverride = syncedPart.contextWindow;
      if ('capabilities' in syncedPart) overrides.capabilitiesOverride = syncedPart.capabilities;
      if ('benchmarks' in syncedPart) overrides.benchmarkOverride = syncedPart.benchmarks;
      if ('speed' in syncedPart) overrides.speedOverride = syncedPart.speed;
      if ('released' in syncedPart) overrides.releasedOverride = syncedPart.released;
      curationModels[id] = { ...curated, ...overrides };
    }
  }

  const curation = {
    version: current.version,
    lastUpdated: current.lastUpdated,
    verificationLog: current.verificationLog,
    providers: current.providers,
    models: curationModels,
    tierAllowedModels: current.tierAllowedModels,
    providersInOrder: current.providersInOrder,
  };
  const synced = { source: 'models.dev', models: syncedModels };

  await writeJson(CURATION_JSON, curation);
  await writeJson(SYNCED_JSON, synced);
  console.log(
    `[sync] extract → ${Object.keys(curationModels).length} models ` +
      `(${upstreamCount} upstream / ${Object.keys(syncedModels).length} in synced snapshot)`,
  );
}

function resolveSyncedFields(cur, up) {
  const co = cur.costOverride ?? {};
  const cachedInput = co.cached_input ?? cur.cached_input ?? up.cached_input;
  const baseCapabilities = cur.capabilitiesOverride ?? up.capabilities;
  // it has a cached-read price (cached_input). This avoids string-prefix hacks
  const capabilities =
    baseCapabilities && typeof baseCapabilities === 'object'
      ? { ...baseCapabilities, caching: baseCapabilities.caching ?? cachedInput != null }
      : baseCapabilities;
  return defined({
    contextWindow: cur.contextOverride ?? up.contextWindow,
    inputCost: co.inputCost ?? up.inputCost,
    outputCost: co.outputCost ?? up.outputCost,
    cached_input: cachedInput,
    cached_write: co.cached_write ?? up.cached_write,
    cached_write_1h: co.cached_write_1h ?? up.cached_write_1h,
    capabilities,
    benchmarks: cur.benchmarkOverride ?? up.benchmarks,
    speed: cur.speedOverride ?? up.speed,
    released: cur.releasedOverride ?? up.released,
  });
}

const FAMILY_RESOLVED_TOP_LEVEL_KEYS = ['providers', 'tierAllowedModels', 'providerDefaults'];

function buildCatalog(curation, synced, familyCatalog, defaultsCatalog) {
  const models = {};
  for (const [id, cur] of Object.entries(curation.models)) {
    const up = synced.models[id] ?? {};
    const curatedEmit = omit(cur, OVERRIDE_KEYS);
    const merged = { ...curatedEmit, ...resolveSyncedFields(cur, up) };
    merged.capabilities = projectCompatCapabilities(normalizeCapabilities(merged));
    assert.ok(
      ['fast', 'balanced', 'best'].includes(merged.qualityTier),
      `${id} has invalid qualityTier ${String(merged.qualityTier)}; expected fast, balanced, or best`,
    );
    models[id] = orderKeys(merged);
  }
  const source = { ...curation, providerDefaults: compatProviderDefaults(defaultsCatalog) };
  const catalog = {};
  for (const key of TOP_LEVEL_ORDER) {
    if (key === 'models') {
      catalog[key] = models;
      continue;
    }
    catalog[key] = FAMILY_RESOLVED_TOP_LEVEL_KEYS.includes(key)
      ? resolveFamilyRefsDeep(source[key], familyCatalog)
      : source[key];
  }
  assert.equal(
    collectFamilyRefs(catalog.models, familyCatalog.policy).size,
    0,
    'Model records must not reference family slots; a family slot resolves to a model record',
  );
  return catalog;
}

const AUTO_POLICY_MODEL_IDS = new Set(['auto', 'auto-economy', 'auto-balanced', 'auto-premium']);
const MEDIA_MODEL_TYPES = new Set(['image', 'video', 'audio', 'tts', 'stt']);
const GENERATED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const CACHE_CLASS = {
  providerImplicitPromptCache: 'provider_implicit_prompt_cache',
  providerExplicitPromptCache: 'provider_explicit_prompt_cache',
  gatewayPromptCache: 'gateway_prompt_cache',
  gatewayResponseCache: 'gateway_response_cache',
  noProviderCache: 'no_provider_cache',
};
const CACHE_CLASSES = new Set(Object.values(CACHE_CLASS));

const COMMERCIAL_STATUS = {
  agiDirect: 'agi_direct',
  customerByok: 'customer_byok',
  authorizedMarketplace: 'authorized_marketplace',
  freeCommercial: 'free_commercial',
  experimentalOnly: 'experimental_only',
  blocked: 'blocked',
};
const COMMERCIAL_STATUSES = new Set(Object.values(COMMERCIAL_STATUS));

const DATA_RETENTION = {
  zeroRetention: 'zero_retention',
  providerDefault: 'provider_default',
  conditional: 'conditional',
  unknown: 'unknown',
};
const DATA_RETENTION_CLASSES = new Set(Object.values(DATA_RETENTION));
const ZERO_DATA_RETENTION_AVAILABILITIES = new Set([
  'default',
  'on_request',
  'per_request_setting',
  'unavailable',
  'unknown',
]);
const TRAINING_POLICIES = new Set(['never', 'opt_in', 'opt_out', 'varies_by_route', 'unknown']);
const CACHE_TOKEN_BILLING_CLASSES = new Set([
  'additional_to_input',
  'included_in_input',
  'unknown',
]);
const UNKNOWN_GOVERNANCE_VALUE = 'unknown';
const GOVERNANCE_FIELDS = [
  'dataRetentionClass',
  'zeroDataRetentionAvailability',
  'trainsOnInputs',
  'residencyRegions',
  'source',
  'verifiedOn',
  'note',
  'cacheTokenBillingClass',
  'cacheTokenBillingSource',
  'cacheTokenBillingVerifiedOn',
  'cacheTokenBillingNote',
];
const GOVERNANCE_SOURCE_URL_PREFIX = 'https://';
const REPOSITORY_CONTRACT_SOURCE_PREFIX = 'AGENTS.md#';

function governanceIsEntirelyUnknown(entry) {
  return (
    entry.dataRetentionClass === UNKNOWN_GOVERNANCE_VALUE &&
    entry.zeroDataRetentionAvailability === UNKNOWN_GOVERNANCE_VALUE &&
    entry.trainsOnInputs === UNKNOWN_GOVERNANCE_VALUE &&
    entry.residencyRegions === null
  );
}

function normalizeProviderGovernance(governanceCatalog) {
  const governance = {};
  for (const [providerId, entry] of Object.entries(governanceCatalog.governance)) {
    const label = `Provider governance ${providerId}`;
    const unsupported = Object.keys(entry).filter((key) => !GOVERNANCE_FIELDS.includes(key));
    assert.deepEqual(unsupported, [], `${label} has unsupported keys: ${unsupported.join(', ')}`);
    assert.ok(
      DATA_RETENTION_CLASSES.has(entry.dataRetentionClass),
      `${label} dataRetentionClass ${String(entry.dataRetentionClass)} is not a known class`,
    );
    assert.ok(
      ZERO_DATA_RETENTION_AVAILABILITIES.has(entry.zeroDataRetentionAvailability),
      `${label} zeroDataRetentionAvailability ${String(entry.zeroDataRetentionAvailability)} is not a known value`,
    );
    assert.ok(
      TRAINING_POLICIES.has(entry.trainsOnInputs),
      `${label} trainsOnInputs ${String(entry.trainsOnInputs)} is not a known value`,
    );
    assert.ok(
      entry.residencyRegions === null ||
        (Array.isArray(entry.residencyRegions) && entry.residencyRegions.length > 0),
      `${label} residencyRegions must be a non-empty array or null for unknown`,
    );
    if (governanceIsEntirelyUnknown(entry)) {
      assert.equal(
        entry.source,
        undefined,
        `${label} records nothing verified, so it must not claim a source`,
      );
    } else {
      assert.ok(
        typeof entry.source === 'string' &&
          (entry.source.startsWith(GOVERNANCE_SOURCE_URL_PREFIX) ||
            entry.source.startsWith(REPOSITORY_CONTRACT_SOURCE_PREFIX)),
        `${label} must cite an https source or the repository trust contract`,
      );
      assert.ok(
        typeof entry.verifiedOn === 'string' && ISO_DATE_PATTERN.test(entry.verifiedOn),
        `${label} must carry the calendar day its source was read`,
      );
    }
    assert.ok(
      CACHE_TOKEN_BILLING_CLASSES.has(entry.cacheTokenBillingClass),
      `${label} cacheTokenBillingClass ${String(entry.cacheTokenBillingClass)} is not a known class`,
    );
    if (entry.cacheTokenBillingClass === UNKNOWN_GOVERNANCE_VALUE) {
      assert.equal(
        entry.cacheTokenBillingSource,
        undefined,
        `${label} records nothing verified about cache-token billing, so it must not claim a source`,
      );
    } else {
      assert.ok(
        typeof entry.cacheTokenBillingSource === 'string' &&
          (entry.cacheTokenBillingSource.startsWith(GOVERNANCE_SOURCE_URL_PREFIX) ||
            entry.cacheTokenBillingSource.startsWith(REPOSITORY_CONTRACT_SOURCE_PREFIX)),
        `${label} must cite an https source or the repository trust contract for cacheTokenBillingClass`,
      );
      assert.ok(
        typeof entry.cacheTokenBillingVerifiedOn === 'string' &&
          ISO_DATE_PATTERN.test(entry.cacheTokenBillingVerifiedOn),
        `${label} must carry the calendar day cacheTokenBillingClass was verified`,
      );
    }
    governance[providerId] = defined({ ...entry });
  }
  return governance;
}

const COMPUTE_PRICING_UNITS = new Set(['usd_per_vcpu_second']);
const COMPUTE_PRICING_FIELDS = ['unit', 'ratePerUnit', 'source', 'verifiedOn', 'note'];

function normalizeProviderComputePricing(computePricingCatalog) {
  const computePricing = {};
  for (const [providerId, entry] of Object.entries(computePricingCatalog.computePricing)) {
    const label = `Provider compute pricing ${providerId}`;
    const unsupported = Object.keys(entry).filter((key) => !COMPUTE_PRICING_FIELDS.includes(key));
    assert.deepEqual(unsupported, [], `${label} has unsupported keys: ${unsupported.join(', ')}`);
    assert.ok(
      COMPUTE_PRICING_UNITS.has(entry.unit),
      `${label} unit ${String(entry.unit)} is not a known compute pricing unit`,
    );
    assert.ok(
      typeof entry.ratePerUnit === 'number' && entry.ratePerUnit > 0,
      `${label} ratePerUnit must be a positive number`,
    );
    assert.ok(
      typeof entry.source === 'string' &&
        (entry.source.startsWith(GOVERNANCE_SOURCE_URL_PREFIX) ||
          entry.source.startsWith(REPOSITORY_CONTRACT_SOURCE_PREFIX)),
      `${label} must cite an https source or the repository trust contract`,
    );
    assert.ok(
      typeof entry.verifiedOn === 'string' && ISO_DATE_PATTERN.test(entry.verifiedOn),
      `${label} must carry the calendar day its source was read`,
    );
    computePricing[providerId] = defined({ ...entry });
  }
  return computePricing;
}

const HARNESS_PROTOCOL = {
  openaiChat: 'openai_chat',
  openaiResponses: 'openai_responses',
  anthropicMessages: 'anthropic_messages',
  geminiNative: 'gemini_native',
  providerNative: 'provider_native',
};
const HARNESS_PROTOCOLS = new Set(Object.values(HARNESS_PROTOCOL));
const HARNESS_HOST_POLICY = {
  allowlistOnly: 'allowlist_only',
  registryDeclared: 'registry_declared',
};
const HARNESS_HOST_POLICIES = new Set(Object.values(HARNESS_HOST_POLICY));
const HARNESS_FIELDS = [
  'provider',
  'apiFamily',
  'adapter',
  'trustModes',
  'features',
  'protocol',
  'baseUrl',
  'apiKeyEnv',
  'hostPolicy',
];
const HTTPS_URL_PROTOCOL = 'https:';
const API_KEY_ENV_PATTERN = /^[A-Z][A-Z0-9_]*$/u;

const MANAGED_CLOUD_TRUST_MODE = 'managed_cloud';
const ROUTE_PRICING_FIELDS = [
  'inputPerMillion',
  'outputPerMillion',
  'cacheReadPerMillion',
  'cacheWritePerMillion',
  'cacheWrite1hPerMillion',
];
const ADDITIONAL_ROUTE_FIELDS = [
  'provider',
  'harnessId',
  'upstreamModelId',
  'cacheClass',
  'commercialStatus',
  'pricing',
  'pricingNote',
];

const ENDPOINT_HOST_MATCHES = new Set(['host', 'hostSuffix', 'domain', 'baseUrl']);
const ENDPOINT_HOST_FIELDS = [
  'match',
  'pattern',
  'endpointClass',
  'longTtlPromptCache',
  'hostPattern',
];
const ENDPOINT_CLASSES = new Set([
  'anthropic-public',
  'chutes-native',
  'deepseek-native',
  'github-copilot-native',
  'groq-native',
  'mistral-public',
  'moonshot-native',
  'modelstudio-native',
  'openai-public',
  'openai-codex',
  'opencode-native',
  'openrouter',
  'xai-native',
  'zai-native',
  'google-generative-ai',
  'google-vertex',
]);
const BASE_URL_MATCH = 'baseUrl';

const PROVIDER_DEFAULT_FIELDS = ['modelKey', 'source', 'verifiedOn', 'note'];

function compatProviderDefaults(defaultsCatalog) {
  return Object.fromEntries(
    Object.entries(defaultsCatalog.defaults).map(([providerId, byCapability]) => [
      providerId,
      Object.fromEntries(
        Object.entries(byCapability).map(([capability, entry]) => [capability, entry.modelKey]),
      ),
    ]),
  );
}

function normalizeProviderDefaults(defaultsCatalog, catalog, capabilities) {
  const defaults = {};
  for (const [providerId, byCapability] of Object.entries(defaultsCatalog.defaults)) {
    assert.ok(
      catalog.providers[providerId],
      `Provider default ${providerId} is not a catalog provider`,
    );
    defaults[providerId] = {};
    for (const [capability, entry] of Object.entries(byCapability)) {
      const label = `Provider default ${providerId}.${capability}`;
      const unsupported = Object.keys(entry).filter(
        (key) => !PROVIDER_DEFAULT_FIELDS.includes(key),
      );
      assert.deepEqual(unsupported, [], `${label} has unsupported keys: ${unsupported.join(', ')}`);
      assert.ok(
        CAPABILITY_NAMES.includes(capability),
        `${label} names ${capability}, which is not a registry capability`,
      );
      const resolved = catalog.providerDefaults?.[providerId]?.[capability];
      assert.ok(resolved, `${label} did not resolve to a model key`);
      const model = catalog.models[resolved];
      assert.ok(model, `${label} resolves to ${resolved}, which is not a catalog model`);
      assert.equal(
        model.provider,
        providerId,
        `${label} resolves to ${resolved}, which belongs to ${model.provider}`,
      );
      assert.notEqual(model.deprecated, true, `${label} resolves to the deprecated ${resolved}`);
      assert.equal(
        capabilities[resolved]?.[capability],
        true,
        `${label} resolves to ${resolved}, which does not offer ${capability}`,
      );
      assert.ok(
        typeof entry.source === 'string' && entry.source.length > 0,
        `${label} must name what grounds the choice`,
      );
      assert.ok(
        typeof entry.verifiedOn === 'string' && ISO_DATE_PATTERN.test(entry.verifiedOn),
        `${label} must carry the day the choice was made`,
      );
      defaults[providerId][capability] = defined({ ...entry, modelKey: resolved });
    }
  }
  return defaults;
}

function assertAmbiguousCapabilitiesAreResolved(defaultsCatalog, catalog, capabilities, defaults) {
  for (const capability of defaultsCatalog.requiredDefaultCapabilities) {
    const activeByProvider = {};
    for (const [modelKey, model] of Object.entries(catalog.models)) {
      if (capabilities[modelKey]?.[capability] !== true) continue;
      if (model.deprecated === true) continue;
      (activeByProvider[model.provider] ??= []).push(modelKey);
    }
    for (const [providerId, modelKeys] of Object.entries(activeByProvider)) {
      if (modelKeys.length < 2) continue;
      assert.ok(
        defaults[providerId]?.[capability],
        `Provider ${providerId} serves ${modelKeys.length} active ${capability} models (${modelKeys.sort().join(', ')}) and must declare which one is its default`,
      );
    }
  }
}

function normalizeProviderHosts(hostCatalog) {
  const seen = new Set();
  const rules = hostCatalog.hosts.map((rule, index) => {
    const label = `Provider host rule ${index}`;
    const unsupported = Object.keys(rule).filter((key) => !ENDPOINT_HOST_FIELDS.includes(key));
    assert.deepEqual(unsupported, [], `${label} has unsupported keys: ${unsupported.join(', ')}`);
    assert.ok(
      ENDPOINT_HOST_MATCHES.has(rule.match),
      `${label} match ${String(rule.match)} is unknown`,
    );
    assert.ok(
      typeof rule.pattern === 'string' && rule.pattern.length > 0,
      `${label} must carry a pattern`,
    );
    assert.ok(
      ENDPOINT_CLASSES.has(rule.endpointClass),
      `${label} endpointClass ${String(rule.endpointClass)} is unknown`,
    );
    assert.equal(
      typeof rule.longTtlPromptCache,
      'boolean',
      `${label} must state whether the endpoint serves a long time-to-live prompt cache`,
    );
    if (rule.match === BASE_URL_MATCH) {
      assert.equal(
        rule.pattern,
        rule.pattern.toLowerCase().replace(/\/+$/u, ''),
        `${label} base URL must be lowercase and carry no trailing slash`,
      );
    }
    if (rule.hostPattern !== undefined) {
      new RegExp(rule.hostPattern, 'u');
    }
    const key = `${rule.match}:${rule.pattern}`;
    assert.ok(!seen.has(key), `${label} duplicates ${key}`);
    seen.add(key);
    return defined({ ...rule });
  });
  assert.ok(
    Array.isArray(hostCatalog.localHosts) && hostCatalog.localHosts.length > 0,
    'Provider host catalog must list the local endpoint hosts',
  );
  assert.ok(
    Array.isArray(hostCatalog.localHostSuffixes) && hostCatalog.localHostSuffixes.length > 0,
    'Provider host catalog must list the local endpoint host suffixes',
  );
  return {
    rules,
    localHosts: [...hostCatalog.localHosts],
    localHostSuffixes: [...hostCatalog.localHostSuffixes],
  };
}

function declaredDataRetention(governance, provider) {
  const entry = governance[provider];
  assert.ok(entry, `Provider ${provider} has no governance record in provider-governance.json`);
  return entry.dataRetentionClass;
}

function routeId(provider, modelKey) {
  return `${provider}/${modelKey}`;
}

function derivedCacheClass(model) {
  if (model.cached_write !== undefined || model.cached_write_1h !== undefined) {
    return CACHE_CLASS.providerExplicitPromptCache;
  }
  if (model.cached_input !== undefined) return CACHE_CLASS.providerImplicitPromptCache;
  return CACHE_CLASS.noProviderCache;
}

function derivedCommercialStatus(harness) {
  return harness.trustModes.includes(MANAGED_CLOUD_TRUST_MODE)
    ? COMMERCIAL_STATUS.agiDirect
    : COMMERCIAL_STATUS.customerByok;
}

function normalizeRoutePricing(label, pricing) {
  assert.ok(
    pricing && typeof pricing === 'object' && !Array.isArray(pricing),
    `${label} pricing must be an object`,
  );
  const unknown = Object.keys(pricing).filter((key) => !ROUTE_PRICING_FIELDS.includes(key));
  assert.deepEqual(unknown, [], `${label} pricing has unsupported keys: ${unknown.join(', ')}`);
  for (const field of ['inputPerMillion', 'outputPerMillion', 'cacheReadPerMillion']) {
    assert.ok(
      typeof pricing[field] === 'number' && pricing[field] >= 0,
      `${label} pricing.${field} is required and must be a non-negative number`,
    );
  }
  assert.ok(
    typeof pricing.cacheWritePerMillion === 'number' && pricing.cacheWritePerMillion >= 0,
    `${label} pricing.cacheWritePerMillion is required and must be a non-negative number`,
  );
  return defined({
    currency: 'USD',
    unit: 'per_million_tokens',
    inputPerMillion: pricing.inputPerMillion,
    outputPerMillion: pricing.outputPerMillion,
    cacheReadPerMillion: pricing.cacheReadPerMillion,
    cacheWritePerMillion: pricing.cacheWritePerMillion,
    cacheWrite1hPerMillion: pricing.cacheWrite1hPerMillion,
  });
}

function buildModelRoutes({
  modelKey,
  model,
  harnessCatalog,
  routeDeclaration,
  lifecycle,
  modelPricing,
  governance,
}) {
  const harnessId = resolveHarnessId(model);
  const harness = harnessCatalog.harnesses[harnessId];
  if (!harness) {
    throw new Error(`No harness configuration for ${modelKey}: expected ${harnessId}`);
  }
  if (harness.provider !== model.provider) {
    throw new Error(
      `Harness ${harnessId} provider ${harness.provider} does not match ${modelKey} provider ${model.provider}`,
    );
  }

  const selectable = lifecycle.availability === 'live' && lifecycle.deprecated !== true;
  const declaredDefault = routeDeclaration?.defaultRoute ?? {};
  const entries = [
    [
      routeId(model.provider, modelKey),
      {
        modelKey,
        provider: model.provider,
        providerModelId: model.apiModelId ?? model.id ?? modelKey,
        harnessId,
        trustModes: [...harness.trustModes],
        availability: lifecycle.availability,
        selectable,
        isDefault: true,
        cacheClass: declaredDefault.cacheClass ?? derivedCacheClass(model),
        commercialStatus: declaredDefault.commercialStatus ?? derivedCommercialStatus(harness),
        dataRetention: declaredDataRetention(governance, model.provider),
        pricing: modelPricing,
      },
    ],
  ];

  for (const [index, additional] of (routeDeclaration?.additionalRoutes ?? []).entries()) {
    const label = `${modelKey} additionalRoutes[${index}]`;
    const unknown = Object.keys(additional).filter((key) => !ADDITIONAL_ROUTE_FIELDS.includes(key));
    assert.deepEqual(unknown, [], `${label} has unsupported keys: ${unknown.join(', ')}`);
    assert.ok(typeof additional.provider === 'string', `${label}.provider is required`);
    assert.notEqual(
      additional.provider,
      model.provider,
      `${label} must not repeat the canonical provider of ${modelKey}`,
    );
    assert.ok(
      typeof additional.upstreamModelId === 'string' && additional.upstreamModelId.length > 0,
      `${label}.upstreamModelId is required`,
    );
    assert.ok(CACHE_CLASSES.has(additional.cacheClass), `${label}.cacheClass is not a known class`);
    assert.ok(
      COMMERCIAL_STATUSES.has(additional.commercialStatus),
      `${label}.commercialStatus is not a known status`,
    );
    const additionalHarnessId = additional.harnessId ?? resolveHarnessId(additional);
    const additionalHarness = harnessCatalog.harnesses[additionalHarnessId];
    assert.ok(additionalHarness, `${label} references unknown harness ${additionalHarnessId}`);
    assert.equal(
      additionalHarness.provider,
      additional.provider,
      `${label} harness ${additionalHarnessId} does not serve provider ${additional.provider}`,
    );
    const id = routeId(additional.provider, modelKey);
    assert.equal(
      entries.some(([existing]) => existing === id),
      false,
      `${label} duplicates route id ${id}`,
    );
    entries.push([
      id,
      {
        modelKey,
        provider: additional.provider,
        providerModelId: additional.upstreamModelId,
        harnessId: additionalHarnessId,
        trustModes: [...additionalHarness.trustModes],
        availability: lifecycle.availability,
        selectable,
        isDefault: false,
        cacheClass: additional.cacheClass,
        commercialStatus: additional.commercialStatus,
        dataRetention: declaredDataRetention(governance, additional.provider),
        pricing: normalizeRoutePricing(label, additional.pricing),
      },
    ]);
  }

  return entries;
}

function resolveHarnessId(model) {
  if (model.provider === 'managed_cloud') return 'managed-cloud/gateway';
  if (model.modelType === 'embedding') return `${model.provider}/embeddings`;
  if (MEDIA_MODEL_TYPES.has(model.modelType)) return `${model.provider}/media`;
  if (model.provider === 'openai') {
    return model.modelType === 'reasoning' ? 'openai/responses' : 'openai/chat-completions';
  }
  if (model.provider === 'anthropic') return 'anthropic/messages';
  if (model.provider === 'google') return 'google/generate-content';
  if (model.provider === 'open_router') return 'open-router/chat-completions';
  if (model.provider === 'nvidia_nim') return 'nvidia-nim/chat-completions';
  return `${model.provider}/chat-completions`;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const PROSE_DATE_PATTERN = /^(?<month>[A-Z][a-z]+)\s+(?<day>\d{1,2}),\s*(?<year>\d{4})$/u;
const CALENDAR_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const ISO_MONTH_OFFSET = 1;
const ISO_DATE_PAD_WIDTH = 2;
const ISO_DATE_PAD_CHARACTER = '0';
const UNKNOWN_DATE = null;

function padCalendarPart(value) {
  return String(value).padStart(ISO_DATE_PAD_WIDTH, ISO_DATE_PAD_CHARACTER);
}

function isoDayFromProse(value) {
  if (typeof value !== 'string') return UNKNOWN_DATE;
  const trimmed = value.trim();
  if (ISO_DATE_PATTERN.test(trimmed)) return trimmed;
  const parsed = PROSE_DATE_PATTERN.exec(trimmed);
  if (!parsed?.groups) return UNKNOWN_DATE;
  const monthIndex = CALENDAR_MONTHS.indexOf(parsed.groups.month);
  if (monthIndex < 0) return UNKNOWN_DATE;
  const day = Number(parsed.groups.day);
  if (!Number.isInteger(day) || day < 1 || day > 31) return UNKNOWN_DATE;
  return `${parsed.groups.year}-${padCalendarPart(monthIndex + ISO_MONTH_OFFSET)}-${padCalendarPart(day)}`;
}

function assertIsoDateOrUnknown(label, value) {
  assert.ok(
    value === UNKNOWN_DATE || ISO_DATE_PATTERN.test(value),
    `${label} must be an ISO calendar day or null, received ${String(value)}`,
  );
  return value;
}

const UNKNOWN_FAMILY = null;

function resolveModelKeyForTarget(catalog, target) {
  if (catalog.models[target]) return target;
  return Object.keys(catalog.models).find((key) => catalog.models[key].apiModelId === target);
}

function buildModelAliasIndex(catalog) {
  const aliases = {};
  const record = (modelKey, alias) => {
    if (typeof alias !== 'string' || alias.length === 0 || alias === modelKey) return;
    (aliases[modelKey] ??= new Set()).add(alias);
  };
  for (const [modelKey, model] of Object.entries(catalog.models)) {
    record(modelKey, model.apiModelId);
    record(modelKey, model.openRouterSlug);
  }
  for (const provider of Object.values(catalog.providers ?? {})) {
    for (const [alias, target] of Object.entries(provider.canonicalization ?? {})) {
      const modelKey = resolveModelKeyForTarget(catalog, target);
      if (modelKey) record(modelKey, alias);
    }
  }
  return Object.fromEntries(
    Object.entries(aliases).map(([modelKey, values]) => [modelKey, [...values].sort()]),
  );
}

function buildModelFamilyIndex(catalog, familyCatalog) {
  const families = {};
  for (const [familyId, family] of Object.entries(familyCatalog.families)) {
    for (const [modelKey, model] of Object.entries(catalog.models)) {
      if (!matchFamilyMember(family, model, modelKey, familyCatalog.policy)) continue;
      assert.ok(
        families[modelKey] === undefined || families[modelKey] === family.canonicalFamily,
        `${modelKey} matches more than one family slot (${families[modelKey]} and ${familyId})`,
      );
      families[modelKey] = family.canonicalFamily;
    }
  }
  return families;
}

const LIFECYCLE_STAGE_FIELDS = ['stage', 'stagedOn', 'source'];
const NON_LIVE_AVAILABILITY_STAGE_CEILING = LIFECYCLE_STAGE.shadow;
const DEPRECATED_STAGES = new Set([LIFECYCLE_STAGE.deprecated, LIFECYCLE_STAGE.removed]);

function normalizeLifecycleStage(modelKey, model, availability, deprecated) {
  const authored = model.lifecycle;
  assert.ok(
    authored && typeof authored === 'object' && !Array.isArray(authored),
    `${modelKey} must declare a lifecycle block naming the stage it has reached`,
  );
  const unsupported = Object.keys(authored).filter((key) => !LIFECYCLE_STAGE_FIELDS.includes(key));
  assert.deepEqual(
    unsupported,
    [],
    `${modelKey} lifecycle has unsupported keys: ${unsupported.join(', ')}`,
  );
  assert.ok(
    isLifecycleStage(authored.stage),
    `${modelKey} lifecycle.stage ${String(authored.stage)} is not one of the canonical stages`,
  );
  assert.ok(
    typeof authored.source === 'string' && authored.source.length > 0,
    `${modelKey} lifecycle.stage ${authored.stage} must name the source that justifies it`,
  );
  const stagedOn = assertIsoDateOrUnknown(`${modelKey} lifecycle.stagedOn`, authored.stagedOn);
  assert.ok(stagedOn !== UNKNOWN_DATE, `${modelKey} lifecycle.stagedOn must be a calendar day`);
  assert.ok(
    availability === 'live' || stageAtOrBefore(authored.stage, NON_LIVE_AVAILABILITY_STAGE_CEILING),
    `${modelKey} availability is ${availability}, so it may not sit past lifecycle stage ${NON_LIVE_AVAILABILITY_STAGE_CEILING}, found ${authored.stage}`,
  );
  assert.equal(
    DEPRECATED_STAGES.has(authored.stage),
    deprecated,
    `${modelKey} lifecycle.stage ${authored.stage} disagrees with deprecated=${deprecated}`,
  );
  return { stage: authored.stage, stagedOn, stageSource: authored.source };
}

export function normalizeLifecycle(modelKey, model) {
  const unavailable = model.availability && model.availability !== 'live';
  const deprecated = model.deprecated === true || model.status === 'deprecated';
  const availability = unavailable ? model.availability : 'live';
  const deprecatedOn = assertIsoDateOrUnknown(
    `${modelKey} lifecycle.deprecatedOn`,
    typeof model.deprecation_date === 'string' ? model.deprecation_date.trim() : UNKNOWN_DATE,
  );
  return {
    ...defined({
      status: deprecated ? 'deprecated' : (model.status ?? 'active'),
      availability,
      unavailableReason: model.unavailableReason,
      released: model.released,
      deprecationDate: model.deprecation_date,
      deprecated,
    }),
    releasedOn: assertIsoDateOrUnknown(
      `${modelKey} lifecycle.releasedOn`,
      isoDayFromProse(model.released),
    ),
    deprecatedOn,
    ...normalizeLifecycleStage(modelKey, model, availability, deprecated),
  };
}

const INTRINSIC_CAPABILITY_NAMES = [
  'textInput',
  'imageInput',
  'audioInput',
  'videoInput',
  'textOutput',
  'imageOutput',
  'audioOutput',
  'videoOutput',
  'streaming',
  'structuredOutput',
  'functionCalling',
  'reasoning',
  'imageEditing',
  'realtime',
  'reranking',
  'toolSchemaSupport',
];

const ROUTE_DEPENDENT_CAPABILITY_NAMES = [
  'computerUse',
  'agentic',
  'webSearch',
  'deepResearch',
  'codeExecution',
  'promptCaching',
];

const CAPABILITY_CLASSES = {
  intrinsic: INTRINSIC_CAPABILITY_NAMES,
  routeDependent: ROUTE_DEPENDENT_CAPABILITY_NAMES,
};

const CAPABILITY_NAMES = [...INTRINSIC_CAPABILITY_NAMES, ...ROUTE_DEPENDENT_CAPABILITY_NAMES];

const COMPAT_CAPABILITY_SOURCES = {
  streaming: 'streaming',
  tools: 'functionCalling',
  vision: 'imageInput',
  json: 'structuredOutput',
  thinking: 'reasoning',
  computerUse: 'computerUse',
  agentic: 'agentic',
  imageGen: 'imageOutput',
  videoGen: 'videoOutput',
  search: 'webSearch',
  research: 'deepResearch',
  codeExecution: 'codeExecution',
  caching: 'promptCaching',
};

const TEXTLESS_OUTPUT_MODEL_TYPES = ['embedding', 'image', 'video', 'tts'];
const TRANSCRIPTION_MODEL_TYPE = 'stt';
const IMAGE_MODEL_TYPE = 'image';
const VIDEO_MODEL_TYPE = 'video';
const SPEECH_MODEL_TYPE = 'tts';
const UNKNOWN_CAPABILITY = null;

function modalitySet(value) {
  return Array.isArray(value) ? new Set(value) : null;
}

function declaredCapability(caps, name) {
  return typeof caps[name] === 'boolean' ? caps[name] : UNKNOWN_CAPABILITY;
}

function normalizeCapabilities(model) {
  const caps = model.capabilities ?? {};
  const inputModalities = modalitySet(model.inputModalities);
  const outputModalities = modalitySet(model.outputModalities);
  return {
    textInput: inputModalities
      ? inputModalities.has('text')
      : model.modelType !== TRANSCRIPTION_MODEL_TYPE,
    imageInput: inputModalities ? inputModalities.has('image') : caps.vision === true,
    audioInput: inputModalities
      ? inputModalities.has('audio')
      : model.modelType === TRANSCRIPTION_MODEL_TYPE,
    videoInput: inputModalities ? inputModalities.has('video') : false,
    textOutput: outputModalities
      ? outputModalities.has('text')
      : !TEXTLESS_OUTPUT_MODEL_TYPES.includes(model.modelType),
    imageOutput: outputModalities
      ? outputModalities.has('image')
      : model.modelType === IMAGE_MODEL_TYPE,
    audioOutput: outputModalities
      ? outputModalities.has('audio')
      : model.modelType === SPEECH_MODEL_TYPE,
    videoOutput: outputModalities
      ? outputModalities.has('video')
      : model.modelType === VIDEO_MODEL_TYPE,
    streaming: caps.streaming === true,
    structuredOutput: caps.json === true,
    functionCalling: caps.tools === true,
    reasoning: caps.thinking === true,
    imageEditing: declaredCapability(caps, 'imageEditing'),
    realtime: declaredCapability(caps, 'realtime'),
    reranking: declaredCapability(caps, 'reranking'),
    toolSchemaSupport: declaredCapability(caps, 'toolSchemaSupport'),
    computerUse: caps.computerUse === true,
    agentic: caps.agentic === true,
    webSearch: caps.search === true,
    deepResearch: caps.research === true,
    codeExecution: caps.codeExecution === true,
    promptCaching: caps.caching === true,
  };
}

function projectCompatCapabilities(normalized) {
  return Object.fromEntries(
    Object.entries(COMPAT_CAPABILITY_SOURCES).map(([compatName, capabilityName]) => [
      compatName,
      normalized[capabilityName] === true,
    ]),
  );
}

const BENCHMARK_CONFIDENCES = new Set(['verified', 'aggregated', 'unknown']);
const AGGREGATED_BENCHMARK_CONFIDENCE = 'aggregated';
const UNKNOWN_BENCHMARK_FIELD = null;
const BENCHMARK_SCORE_FIELDS = ['value', 'source', 'version', 'date', 'confidence'];

function normalizeBenchmarkScore(label, name, raw, aggregatorSource) {
  if (typeof raw === 'number') {
    assert.ok(
      typeof aggregatorSource === 'string' && aggregatorSource.length > 0,
      `${label} benchmark ${name} is a bare score with no snapshot source to attribute it to`,
    );
    return {
      value: raw,
      source: aggregatorSource,
      version: UNKNOWN_BENCHMARK_FIELD,
      date: UNKNOWN_BENCHMARK_FIELD,
      confidence: AGGREGATED_BENCHMARK_CONFIDENCE,
    };
  }
  assert.ok(
    raw && typeof raw === 'object' && !Array.isArray(raw),
    `${label} benchmark ${name} must be a score or a sourced score record`,
  );
  const unsupported = Object.keys(raw).filter((key) => !BENCHMARK_SCORE_FIELDS.includes(key));
  assert.deepEqual(
    unsupported,
    [],
    `${label} benchmark ${name} has unsupported keys: ${unsupported.join(', ')}`,
  );
  assert.ok(
    typeof raw.value === 'number' && Number.isFinite(raw.value),
    `${label} benchmark ${name} must carry a finite value`,
  );
  assert.ok(
    typeof raw.source === 'string' && raw.source.length > 0,
    `${label} benchmark ${name} must name the source it was read from`,
  );
  assert.ok(
    BENCHMARK_CONFIDENCES.has(raw.confidence),
    `${label} benchmark ${name} confidence ${String(raw.confidence)} is not a known value`,
  );
  return {
    value: raw.value,
    source: raw.source,
    version: raw.version ?? UNKNOWN_BENCHMARK_FIELD,
    date: assertIsoDateOrUnknown(
      `${label} benchmark ${name} date`,
      raw.date ?? UNKNOWN_BENCHMARK_FIELD,
    ),
    confidence: raw.confidence,
  };
}

function normalizeBenchmarks(modelKey, benchmarks, aggregatorSource) {
  return Object.fromEntries(
    Object.entries(benchmarks ?? {}).map(([name, raw]) => [
      name,
      normalizeBenchmarkScore(modelKey, name, raw, aggregatorSource),
    ]),
  );
}

function positiveIntegerOrUndefined(value) {
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function normalizeVideoGeneration(modelKey, video) {
  if (video === undefined) return undefined;
  const label = `${modelKey} videoGeneration`;
  assert.ok(
    video && typeof video === 'object' && !Array.isArray(video),
    `${label} must be an object`,
  );
  const allowedKeys = ['durationSecs', 'outputSizes', 'supportsAudio', 'supportsSeed', 'pricing'];
  assert.equal(
    Object.keys(video).filter((key) => !allowedKeys.includes(key)).length,
    0,
    `${label} has unsupported keys`,
  );
  assert.ok(
    Array.isArray(video.durationSecs) && video.durationSecs.length > 0,
    `${label}.durationSecs must be non-empty`,
  );
  assert.equal(
    new Set(video.durationSecs).size,
    video.durationSecs.length,
    `${label}.durationSecs must be unique`,
  );
  for (const duration of video.durationSecs) {
    assert.ok(
      Number.isInteger(duration) && duration > 0,
      `${label}.durationSecs must contain positive integers`,
    );
  }
  assert.ok(
    Array.isArray(video.outputSizes) && video.outputSizes.length > 0,
    `${label}.outputSizes must be non-empty`,
  );
  const tuples = new Set();
  for (const [index, output] of video.outputSizes.entries()) {
    const outputLabel = `${label}.outputSizes[${index}]`;
    const allowedOutputKeys = ['aspectRatio', 'durationSecs', 'height', 'resolution', 'width'];
    assert.equal(
      Object.keys(output).filter((key) => !allowedOutputKeys.includes(key)).length,
      0,
      `${outputLabel} has unsupported keys`,
    );
    assert.ok(
      typeof output.resolution === 'string' && output.resolution.length > 0,
      `${outputLabel}.resolution is required`,
    );
    assert.ok(
      typeof output.aspectRatio === 'string' && output.aspectRatio.length > 0,
      `${outputLabel}.aspectRatio is required`,
    );
    assert.ok(
      Number.isInteger(output.width) && output.width > 0,
      `${outputLabel}.width must be a positive integer`,
    );
    assert.ok(
      Number.isInteger(output.height) && output.height > 0,
      `${outputLabel}.height must be a positive integer`,
    );
    if (output.durationSecs !== undefined) {
      assert.ok(
        Array.isArray(output.durationSecs) && output.durationSecs.length > 0,
        `${outputLabel}.durationSecs must be non-empty when present`,
      );
      assert.equal(
        new Set(output.durationSecs).size,
        output.durationSecs.length,
        `${outputLabel}.durationSecs must be unique`,
      );
      for (const duration of output.durationSecs) {
        assert.ok(
          Number.isInteger(duration) && duration > 0,
          `${outputLabel}.durationSecs must contain positive integers`,
        );
        assert.ok(
          video.durationSecs.includes(duration),
          `${outputLabel}.durationSecs must be a subset of ${label}.durationSecs`,
        );
      }
    }
    const tuple = `${output.resolution}\u0000${output.aspectRatio}`;
    assert.ok(
      !tuples.has(tuple),
      `${label} repeats output tuple ${output.resolution}/${output.aspectRatio}`,
    );
    tuples.add(tuple);
  }
  assert.equal(typeof video.supportsAudio, 'boolean', `${label}.supportsAudio must be boolean`);
  if (video.supportsSeed !== undefined) {
    assert.equal(typeof video.supportsSeed, 'boolean', `${label}.supportsSeed must be boolean`);
  }
  if (video.pricing !== undefined) {
    const pricingKeys = [
      'unit',
      'framesPerSecond',
      'pixelsPerToken',
      'usdPerToken',
      'usdPerTokenWithoutAudio',
      'usdPerTokenWithVideoInput',
    ];
    assert.equal(
      Object.keys(video.pricing).filter((key) => !pricingKeys.includes(key)).length,
      0,
      `${label}.pricing has unsupported keys`,
    );
    assert.equal(video.pricing.unit, 'video_tokens', `${label}.pricing.unit must be video_tokens`);
    for (const field of ['framesPerSecond', 'pixelsPerToken']) {
      assert.ok(
        Number.isInteger(video.pricing[field]) && video.pricing[field] > 0,
        `${label}.pricing.${field} must be a positive integer`,
      );
    }
    for (const field of ['usdPerToken', 'usdPerTokenWithoutAudio', 'usdPerTokenWithVideoInput']) {
      if (video.pricing[field] === undefined) continue;
      assert.ok(
        Number.isFinite(video.pricing[field]) && video.pricing[field] > 0,
        `${label}.pricing.${field} must be positive`,
      );
    }
  }
  return video;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizePricingSchedule(modelKey, schedule) {
  if (schedule === undefined) return undefined;
  assert.ok(
    Array.isArray(schedule) && schedule.length > 0,
    `${modelKey} pricingSchedule must be a non-empty array when present`,
  );
  const normalizedSchedule = schedule.map((entry, index) => {
    const label = `${modelKey} pricingSchedule[${index}]`;
    assert.ok(
      entry.effectiveFrom !== undefined || entry.effectiveUntil !== undefined,
      `${label} must declare effectiveFrom, effectiveUntil, or both`,
    );
    for (const bound of ['effectiveFrom', 'effectiveUntil']) {
      if (entry[bound] === undefined) continue;
      assert.ok(ISO_DATE.test(entry[bound]), `${label}.${bound} must be a YYYY-MM-DD date`);
    }
    if (entry.effectiveFrom !== undefined && entry.effectiveUntil !== undefined) {
      assert.ok(
        entry.effectiveFrom <= entry.effectiveUntil,
        `${label} effectiveFrom must not be after effectiveUntil`,
      );
    }
    const normalized = defined({
      effectiveFrom: entry.effectiveFrom,
      effectiveUntil: entry.effectiveUntil,
      note: entry.note,
      inputPerMillion: entry.inputCost,
      outputPerMillion: entry.outputCost,
      cacheReadPerMillion: entry.cached_input,
      cacheWritePerMillion: entry.cached_write,
      cacheWrite1hPerMillion: entry.cached_write_1h,
    });
    const unknownKeys = Object.keys(entry).filter(
      (key) =>
        ![
          'effectiveFrom',
          'effectiveUntil',
          'note',
          'inputCost',
          'outputCost',
          'cached_input',
          'cached_write',
          'cached_write_1h',
        ].includes(key),
    );
    assert.equal(unknownKeys.length, 0, `${label} has unsupported keys: ${unknownKeys.join(', ')}`);
    return normalized;
  });
  assertNoOverlappingPricingWindows(modelKey, normalizedSchedule);
  return normalizedSchedule;
}

const PRICING_TIER_THRESHOLD_BOUNDARIES = new Set(['inclusive', 'exclusive']);

function normalizeInputTokenPricingTier(label, tier) {
  assert.ok(tier && typeof tier === 'object' && !Array.isArray(tier), `${label} must be an object`);
  assert.ok(
    Number.isInteger(tier.thresholdTokens) && tier.thresholdTokens > 0,
    `${label}.thresholdTokens must be a positive integer`,
  );
  if (tier.thresholdBoundary !== undefined) {
    assert.ok(
      PRICING_TIER_THRESHOLD_BOUNDARIES.has(tier.thresholdBoundary),
      `${label}.thresholdBoundary must be inclusive or exclusive when present`,
    );
  }
  for (const field of ['inputCost', 'outputCost']) {
    assert.ok(
      Number.isFinite(tier[field]) && tier[field] >= 0,
      `${label}.${field} must be a non-negative number`,
    );
  }
  for (const field of ['cached_input', 'cached_write', 'cached_write_1h']) {
    if (tier[field] === undefined) continue;
    assert.ok(
      Number.isFinite(tier[field]) && tier[field] >= 0,
      `${label}.${field} must be a non-negative number when present`,
    );
  }
  const unknownKeys = Object.keys(tier).filter(
    (key) =>
      ![
        'thresholdTokens',
        'thresholdBoundary',
        'inputCost',
        'outputCost',
        'cached_input',
        'cached_write',
        'cached_write_1h',
      ].includes(key),
  );
  assert.equal(unknownKeys.length, 0, `${label} has unsupported keys: ${unknownKeys.join(', ')}`);
  return defined({
    thresholdTokens: tier.thresholdTokens,
    thresholdBoundary: tier.thresholdBoundary,
    inputPerMillion: tier.inputCost,
    outputPerMillion: tier.outputCost,
    cacheReadPerMillion: tier.cached_input,
    cacheWritePerMillion: tier.cached_write,
    cacheWrite1hPerMillion: tier.cached_write_1h,
  });
}

export function normalizeInputTokenPricingTiers(modelKey, tiers) {
  if (tiers === undefined) return undefined;
  assert.ok(
    Array.isArray(tiers) && tiers.length > 0,
    `${modelKey} inputTokenPricingTiers must be a non-empty array when present`,
  );
  const normalized = tiers.map((tier, index) =>
    normalizeInputTokenPricingTier(`${modelKey} inputTokenPricingTiers[${index}]`, tier),
  );
  for (let index = 1; index < normalized.length; index += 1) {
    assert.ok(
      normalized[index].thresholdTokens > normalized[index - 1].thresholdTokens,
      `${modelKey} inputTokenPricingTiers thresholds must be strictly increasing`,
    );
  }
  return normalized;
}

/** @deprecated Compiler read compatibility for the former singleton field. */
export function normalizeLongContextPricing(modelKey, tier) {
  if (tier === undefined) return undefined;
  return normalizeInputTokenPricingTier(`${modelKey} longContext`, tier);
}

function assertNoOverlappingPricingWindows(modelKey, schedule) {
  const OPEN_PAST = '0000-01-01';
  const OPEN_FUTURE = '9999-12-31';
  const bounds = schedule.map((entry) => ({
    from: entry.effectiveFrom ?? OPEN_PAST,
    until: entry.effectiveUntil ?? OPEN_FUTURE,
  }));
  const describe = (index) => {
    const entry = schedule[index];
    return `[${index}] ${entry.effectiveFrom ?? '(open)'}..${entry.effectiveUntil ?? '(open)'}`;
  };
  for (let i = 0; i < bounds.length; i += 1) {
    for (let j = i + 1; j < bounds.length; j += 1) {
      const overlaps = bounds[i].from <= bounds[j].until && bounds[j].from <= bounds[i].until;
      assert.ok(
        !overlaps,
        `${modelKey} pricingSchedule windows must not overlap: ${describe(i)} intersects ` +
          `${describe(j)}. Both bounds are inclusive UTC calendar days and consumers take the ` +
          `FIRST covering window, so overlapping windows make the billed price depend on ` +
          `authoring order instead of on the date.`,
      );
    }
  }
}

function formatRoutingSlotLabel(slotId) {
  return slotId
    .split('_')
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
    .join(' ');
}

const SLOT_CANDIDATE_FIELDS = {
  shadow: ['modelKey', 'dailyRequestCap'],
  canary: ['modelKey', 'trafficFraction'],
};

function resolveSlotCandidates(slot) {
  return defined({
    shadow: slot.shadow === undefined ? undefined : { ...slot.shadow },
    canary: slot.canary === undefined ? undefined : { ...slot.canary },
  });
}

function resolveAutoPolicy(autoPolicy, catalog) {
  return {
    ...autoPolicy,
    slots: Object.fromEntries(
      Object.entries(autoPolicy.slots).map(([slotId, slot]) => {
        const hasModelKey = typeof slot.modelKey === 'string' && slot.modelKey.length > 0;
        const hasProviderTask = slot.providerTask !== undefined;
        assert.notEqual(
          hasModelKey,
          hasProviderTask,
          `Routing slot ${slotId} must declare exactly one of modelKey or providerTask`,
        );
        const candidates = resolveSlotCandidates(slot);
        if (hasModelKey) return [slotId, { modelKey: slot.modelKey, ...candidates }];

        const { provider, task } = slot.providerTask ?? {};
        assert.equal(
          typeof provider,
          'string',
          `Routing slot ${slotId}.providerTask.provider must be a string`,
        );
        assert.equal(
          typeof task,
          'string',
          `Routing slot ${slotId}.providerTask.task must be a string`,
        );
        const providerConfig = catalog.providers?.[provider];
        assert.ok(providerConfig, `Routing slot ${slotId} references unknown provider ${provider}`);
        const modelKey = providerConfig.taskRouting?.[task];
        assert.ok(
          modelKey,
          `Routing slot ${slotId} references missing provider task ${provider}.${task}`,
        );
        return [slotId, { modelKey, ...candidates }];
      }),
    ),
  };
}

function normalizeAutoPolicy(autoPolicy) {
  return {
    ...autoPolicy,
    slots: Object.fromEntries(
      Object.entries(autoPolicy.slots).map(([slotId, slot]) => {
        const label = formatRoutingSlotLabel(slotId);
        return [
          slotId,
          {
            ...slot,
            label,
            description: `Shared ${label.toLowerCase()} route. Model and provider are selected by the canonical registry.`,
          },
        ];
      }),
    ),
  };
}

function validateAutoPolicy(autoPolicy, models, capabilities) {
  const aliasKeys = Object.keys(autoPolicy.aliases).sort();
  const compatibilityAliases = [...AUTO_POLICY_MODEL_IDS].sort();
  assert.deepEqual(
    aliasKeys,
    compatibilityAliases,
    'Routing policy aliases must match the compatibility Auto aliases',
  );
  assert.ok(autoPolicy.aliases[autoPolicy.defaultAlias], 'defaultAlias must name an Auto alias');
  assert.ok(autoPolicy.slots[autoPolicy.fallbackSlot], 'fallbackSlot must name a routing slot');

  for (const [slotId, slot] of Object.entries(autoPolicy.slots)) {
    assert.ok(
      models[slot.modelKey],
      `Routing slot ${slotId} references unknown model ${slot.modelKey}`,
    );
    validateSlotLifecycle(slotId, slot, models);
  }
  for (const [taskType, task] of Object.entries(autoPolicy.tasks)) {
    for (const capability of task.requiredCapabilities) {
      assert.ok(
        Object.hasOwn(capabilities[Object.values(autoPolicy.slots)[0].modelKey], capability),
        `Routing task ${taskType} references unknown capability ${capability}`,
      );
    }
    for (const [profile, slots] of Object.entries(task.preferredSlots)) {
      assert.ok(autoPolicy.profileOrder.includes(profile), `Unknown routing profile ${profile}`);
      for (const slotId of slots) {
        assert.ok(
          autoPolicy.slots[slotId],
          `Routing task ${taskType} references unknown slot ${slotId}`,
        );
      }
    }
  }
  for (const [tier, slots] of Object.entries(autoPolicy.tierAllowedSlots)) {
    for (const slotId of slots) {
      assert.ok(autoPolicy.slots[slotId], `Tier ${tier} references unknown routing slot ${slotId}`);
    }
  }
  validateAutoTaskFamilies(autoPolicy, capabilities);
}

const SERVING_STAGES = new Set([LIFECYCLE_STAGE.promoted, LIFECYCLE_STAGE.canary]);
const MINIMUM_CANARY_FRACTION = 0;
const MAXIMUM_CANARY_FRACTION = 1;

/**
 * A slot is a promise that traffic lands on something that earned it. The
 * primary must be promoted, a canary must be a canary and sit beside a promoted
 * primary so a pull always has somewhere to land, and a shadow must declare the
 * ceiling on what it may spend before it is allowed to mirror anything.
 */
export function validateSlotLifecycle(slotId, slot, models) {
  const stage = models[slot.modelKey].lifecycle.stage;
  assert.ok(
    SERVING_STAGES.has(stage),
    `Routing slot ${slotId} serves ${slot.modelKey} at lifecycle stage ${stage}; a slot may serve only ${[...SERVING_STAGES].join(' or ')}`,
  );

  if (slot.canary !== undefined) {
    const unsupported = Object.keys(slot.canary).filter(
      (key) => !SLOT_CANDIDATE_FIELDS.canary.includes(key),
    );
    assert.deepEqual(
      unsupported,
      [],
      `Routing slot ${slotId} canary has unsupported keys: ${unsupported.join(', ')}`,
    );
    assert.ok(
      models[slot.canary.modelKey],
      `Routing slot ${slotId} canary references unknown model ${slot.canary.modelKey}`,
    );
    assert.equal(
      models[slot.canary.modelKey].lifecycle.stage,
      LIFECYCLE_STAGE.canary,
      `Routing slot ${slotId} canary ${slot.canary.modelKey} is not at lifecycle stage ${LIFECYCLE_STAGE.canary}`,
    );
    assert.equal(
      stage,
      LIFECYCLE_STAGE.promoted,
      `Routing slot ${slotId} has a canary but no promoted sibling to pull back to; ${slot.modelKey} is ${stage}`,
    );
    assert.ok(
      typeof slot.canary.trafficFraction === 'number' &&
        slot.canary.trafficFraction > MINIMUM_CANARY_FRACTION &&
        slot.canary.trafficFraction < MAXIMUM_CANARY_FRACTION,
      `Routing slot ${slotId} canary trafficFraction must sit strictly between ${MINIMUM_CANARY_FRACTION} and ${MAXIMUM_CANARY_FRACTION}`,
    );
  }

  if (slot.shadow !== undefined) {
    const unsupported = Object.keys(slot.shadow).filter(
      (key) => !SLOT_CANDIDATE_FIELDS.shadow.includes(key),
    );
    assert.deepEqual(
      unsupported,
      [],
      `Routing slot ${slotId} shadow has unsupported keys: ${unsupported.join(', ')}`,
    );
    assert.ok(
      models[slot.shadow.modelKey],
      `Routing slot ${slotId} shadow references unknown model ${slot.shadow.modelKey}`,
    );
    assert.equal(
      models[slot.shadow.modelKey].lifecycle.stage,
      LIFECYCLE_STAGE.shadow,
      `Routing slot ${slotId} shadow ${slot.shadow.modelKey} is not at lifecycle stage ${LIFECYCLE_STAGE.shadow}`,
    );
    assert.ok(
      Number.isInteger(slot.shadow.dailyRequestCap) && slot.shadow.dailyRequestCap > 0,
      `Routing slot ${slotId} shadow must declare a positive dailyRequestCap before it may mirror anything`,
    );
  }
}

function validateAutoTaskFamilies(autoPolicy, capabilities) {
  const taskFamilies = autoPolicy.taskFamilies;
  if (taskFamilies === undefined) return;

  const capabilityNames = Object.keys(Object.values(capabilities)[0] ?? {});
  for (const [familyId, family] of Object.entries(taskFamilies)) {
    assert.ok(familyId.length > 0, 'Task family ids must be non-empty');
    assert.ok(
      Array.isArray(family.appliesToTaskTypes) && family.appliesToTaskTypes.length > 0,
      `Task family ${familyId} must declare at least one canonical task type`,
    );
    for (const taskType of family.appliesToTaskTypes) {
      assert.ok(
        autoPolicy.tasks[taskType],
        `Task family ${familyId} references unknown routing task ${taskType}`,
      );
    }
    assert.ok(
      family.riskLabel === 'low' || family.riskLabel === 'high',
      `Task family ${familyId} riskLabel must be 'low' or 'high'`,
    );

    const floor = family.qualityFloor ?? {};
    if (floor.minimumSlotBand !== undefined) {
      assert.ok(
        autoPolicy.profileOrder.includes(floor.minimumSlotBand),
        `Task family ${familyId} minimumSlotBand ${floor.minimumSlotBand} is not a routing profile`,
      );
    }
    for (const capability of floor.requiredCapabilities ?? []) {
      assert.ok(
        capabilityNames.includes(capability),
        `Task family ${familyId} references unknown capability ${capability}`,
      );
    }
    if (floor.minimumContextTokens !== undefined) {
      assert.ok(
        Number.isInteger(floor.minimumContextTokens) && floor.minimumContextTokens > 0,
        `Task family ${familyId} minimumContextTokens must be a positive integer`,
      );
    }
    for (const [benchmark, minimum] of Object.entries(floor.minimumBenchmarkScores ?? {})) {
      assert.ok(
        typeof minimum === 'number' && minimum >= 0,
        `Task family ${familyId} benchmark floor ${benchmark} must be a non-negative number`,
      );
    }
  }
}

function normalizeHarnesses(harnessCatalog) {
  const normalized = {};
  for (const [harnessId, harness] of Object.entries(harnessCatalog.harnesses)) {
    const unknown = Object.keys(harness).filter((key) => !HARNESS_FIELDS.includes(key));
    assert.deepEqual(
      unknown,
      [],
      `Harness ${harnessId} has unsupported keys: ${unknown.join(', ')}`,
    );
    const protocol = harness.protocol ?? HARNESS_PROTOCOL.providerNative;
    assert.ok(
      HARNESS_PROTOCOLS.has(protocol),
      `Harness ${harnessId} protocol ${protocol} is not a known wire protocol`,
    );
    const hostPolicy = harness.hostPolicy ?? HARNESS_HOST_POLICY.allowlistOnly;
    assert.ok(
      HARNESS_HOST_POLICIES.has(hostPolicy),
      `Harness ${harnessId} hostPolicy ${hostPolicy} is not a known policy`,
    );
    if (protocol === HARNESS_PROTOCOL.providerNative) {
      assert.equal(
        harness.baseUrl,
        undefined,
        `Harness ${harnessId} declares a baseUrl without naming the wire protocol it speaks`,
      );
      assert.equal(
        harness.apiKeyEnv,
        undefined,
        `Harness ${harnessId} declares an apiKeyEnv without naming the wire protocol it speaks`,
      );
    } else {
      assert.ok(
        typeof harness.baseUrl === 'string' && harness.baseUrl.length > 0,
        `Harness ${harnessId} declares protocol ${protocol} without a baseUrl to dispatch to`,
      );
      assert.equal(
        new URL(harness.baseUrl).protocol,
        HTTPS_URL_PROTOCOL,
        `Harness ${harnessId} baseUrl must be https`,
      );
      assert.ok(
        typeof harness.apiKeyEnv === 'string' && API_KEY_ENV_PATTERN.test(harness.apiKeyEnv),
        `Harness ${harnessId} declares protocol ${protocol} without an apiKeyEnv naming its credential`,
      );
    }
    assert.ok(
      hostPolicy === HARNESS_HOST_POLICY.allowlistOnly || harness.baseUrl !== undefined,
      `Harness ${harnessId} declares hostPolicy ${hostPolicy} with no baseUrl host to admit`,
    );
    normalized[harnessId] = defined({ ...harness, protocol, hostPolicy });
  }
  return normalized;
}

function buildRuntimeProfiles(harnessCatalog) {
  const harnessGroups = harnessCatalog.harnessGroups ?? {};
  const runtimeProfiles = harnessCatalog.runtimeProfiles ?? {};

  for (const [groupId, harnessIds] of Object.entries(harnessGroups)) {
    assert.ok(Array.isArray(harnessIds), `Harness group ${groupId} must be an array`);
    assert.equal(
      new Set(harnessIds).size,
      harnessIds.length,
      `Harness group ${groupId} must not contain duplicate harness IDs`,
    );
    for (const harnessId of harnessIds) {
      assert.ok(
        harnessCatalog.harnesses[harnessId],
        `Harness group ${groupId} references unknown harness ${harnessId}`,
      );
    }
  }

  const normalizedProfiles = {};
  for (const [profileId, profile] of Object.entries(runtimeProfiles)) {
    const groupIds = profile.allowedHarnessGroups ?? [];
    const allowedHarnessIds = [];
    for (const groupId of groupIds) {
      const harnessIds = harnessGroups[groupId];
      assert.ok(harnessIds, `Runtime profile ${profileId} references unknown group ${groupId}`);
      allowedHarnessIds.push(...harnessIds);
    }
    const uniqueHarnessIds = [...new Set(allowedHarnessIds)];
    for (const harnessId of uniqueHarnessIds) {
      const harness = harnessCatalog.harnesses[harnessId];
      assert.ok(
        harness.trustModes.includes(profile.trustMode),
        `Runtime profile ${profileId} trust mode ${profile.trustMode} is incompatible with ${harnessId}`,
      );
    }

    if (profile.surface === 'web') {
      assert.equal(profile.trustMode, 'managed_cloud', 'Web runtime profiles must be cloud-only');
    }
    if (profile.surface === 'mobile' || profile.surface === 'chrome') {
      assert.notEqual(
        profile.trustMode,
        'byok',
        `${profile.surface} runtime profiles must not expose BYOK`,
      );
    }
    if (profileId === 'chrome/managed-chat') {
      assert.equal(profile.trustMode, 'managed_cloud', 'Chrome chat must be Managed Cloud only');
      assert.equal(profile.executionMode, 'cloud', 'Chrome chat executes through AGI Cloud');
    }
    if (profileId === 'chrome/browser-task') {
      assert.equal(profile.trustMode, 'local', 'Chrome browser mechanics stay local');
      assert.equal(
        uniqueHarnessIds.length,
        0,
        'Chrome browser mechanics must not admit an inference harness',
      );
    }

    const { allowedHarnessGroups: _allowedHarnessGroups, ...publicProfile } = profile;
    normalizedProfiles[profileId] = {
      ...publicProfile,
      features: profile.features ?? {},
      allowedHarnessIds: uniqueHarnessIds,
    };
  }
  return normalizedProfiles;
}

function buildNormalizedRegistry(
  catalog,
  harnessCatalog,
  modelRouteCatalog,
  routingPolicies,
  familyCatalog,
  governanceCatalog,
  benchmarkSource,
  hostCatalog,
  defaultsCatalog,
  computePricingCatalog,
) {
  const governance = normalizeProviderGovernance(governanceCatalog);
  const computePricing = normalizeProviderComputePricing(computePricingCatalog);
  const endpointHosts = normalizeProviderHosts(hostCatalog);
  const models = {};
  const providerModelKeys = {};
  const routes = {};
  const pricing = {};
  const limits = {};
  const capabilities = {};
  const benchmarks = {};
  const aliasIndex = buildModelAliasIndex(catalog);
  const familyIndex = buildModelFamilyIndex(catalog, familyCatalog);

  for (const [modelKey, model] of Object.entries(catalog.models)) {
    if (AUTO_POLICY_MODEL_IDS.has(modelKey)) {
      throw new Error(
        `${modelKey} is an Auto routing profile and must live in routing-policies.json, not models.curation.json`,
      );
    }

    assert.ok(
      model.inputTokenPricingTiers === undefined || model.longContext === undefined,
      `${modelKey} must not declare both inputTokenPricingTiers and legacy longContext`,
    );

    const lifecycle = normalizeLifecycle(modelKey, model);
    const videoGeneration = normalizeVideoGeneration(modelKey, model.videoGeneration);
    if (
      model.modelType === 'image' &&
      model.imageApi === 'gemini' &&
      lifecycle.availability === 'live' &&
      lifecycle.deprecated !== true
    ) {
      assert.ok(
        GENERATED_IMAGE_MIME_TYPES.has(model.imageOutputMimeType),
        `${modelKey} is a live Gemini image model and must declare a supported imageOutputMimeType`,
      );
    }
    models[modelKey] = {
      identity: {
        ...defined({
          key: modelKey,
          displayName: model.name,
          provider: model.provider,
          providerModelId: model.apiModelId ?? model.id ?? modelKey,
          openRouterSlug: model.openRouterSlug,
          kind: model.modelType,
          familyPartner: model.variantPartner,
          openWeight: model.openWeight,
          license: model.license,
          commercialRestrictions: model.commercialRestrictions,
        }),
        aliases: aliasIndex[modelKey] ?? [],
        family: familyIndex[modelKey] ?? UNKNOWN_FAMILY,
      },
      lifecycle,
      evidenceRefs: Array.isArray(model.evidenceRefs) ? model.evidenceRefs : [],
    };
    (providerModelKeys[model.provider] ??= []).push(modelKey);
    pricing[modelKey] = defined({
      currency: 'USD',
      unit: videoGeneration?.pricing
        ? 'video_tokens'
        : model.videoPerSecondCost
          ? 'per_second'
          : model.imagePerImageCost
            ? 'per_image'
            : 'per_million_tokens',
      inputPerMillion: model.inputCost,
      outputPerMillion: model.outputCost,
      cacheReadPerMillion: model.cached_input,
      cacheWritePerMillion: model.cached_write,
      cacheWrite1hPerMillion: model.cached_write_1h,
      imagePerImage: model.imagePerImageCost,
      videoPerSecond: model.videoPerSecondCost,
      videoPerSecondByResolution: model.videoPerSecondCostByResolution,
      videoTokenFormula: videoGeneration?.pricing,
      promoExpiresAt: model.promo_expires_at,
      postPromoPrices: model.post_promo_prices,
      schedule: normalizePricingSchedule(modelKey, model.pricingSchedule),
      inputTokenPricingTiers:
        model.inputTokenPricingTiers !== undefined
          ? normalizeInputTokenPricingTiers(modelKey, model.inputTokenPricingTiers)
          : model.longContext !== undefined
            ? [normalizeLongContextPricing(modelKey, model.longContext)]
            : undefined,
    });
    for (const [id, route] of buildModelRoutes({
      modelKey,
      model,
      harnessCatalog,
      routeDeclaration: modelRouteCatalog.models?.[modelKey],
      governance,
      lifecycle,
      modelPricing: pricing[modelKey],
    })) {
      assert.equal(routes[id], undefined, `Duplicate route id ${id}`);
      routes[id] = route;
    }
    limits[modelKey] = defined({
      contextTokens: positiveIntegerOrUndefined(model.contextWindow),
      maxInputTokens: positiveIntegerOrUndefined(model.maxInputTokens),
      maxOutputTokens: positiveIntegerOrUndefined(model.maxOutputTokens),
      knowledgeCutoff: model.knowledgeCutoff,
      embeddingDimensions: positiveIntegerOrUndefined(model.embeddingDimensions),
      videoGeneration: videoGeneration
        ? {
            durationSecs: videoGeneration.durationSecs,
            outputSizes: videoGeneration.outputSizes,
            supportsAudio: videoGeneration.supportsAudio,
            supportsSeed: videoGeneration.supportsSeed,
          }
        : undefined,
    });
    capabilities[modelKey] = normalizeCapabilities(model);
    assert.deepEqual(
      Object.keys(capabilities[modelKey]).sort(),
      [...CAPABILITY_NAMES].sort(),
      `${modelKey} must carry the whole capability vocabulary`,
    );
    benchmarks[modelKey] = normalizeBenchmarks(modelKey, model.benchmarks, benchmarkSource);
  }

  const providerDefaults = normalizeProviderDefaults(defaultsCatalog, catalog, capabilities);
  assertAmbiguousCapabilitiesAreResolved(defaultsCatalog, catalog, capabilities, providerDefaults);

  const evidence = (catalog.verificationLog ?? []).map((entry, index) => ({
    id: `verification/${entry.date ?? 'unknown'}/${index + 1}`,
    ...entry,
  }));
  const resolvedAutoPolicy = resolveAutoPolicy(
    resolveFamilyRefsDeep(routingPolicies.auto, familyCatalog),
    catalog,
  );
  validateAutoPolicy(resolvedAutoPolicy, models, capabilities);
  const autoPolicy = normalizeAutoPolicy(resolvedAutoPolicy);
  const runtimeProfiles = buildRuntimeProfiles(harnessCatalog);
  const familySnapshot = {
    models: catalog.models,
    providers: catalog.providers,
    capabilities,
    pricing,
    limits,
    benchmarks,
    retiredModelKeys: new Set(readJson(RETIRED_MODELS_JSON).retiredModelIds),
  };
  validateFamilyCatalog(familyCatalog, familySnapshot);

  return {
    $schema: '../schema/registry.schema.json',
    schemaVersion: 1,
    models,
    providerModelKeys,
    routes,
    harnesses: normalizeHarnesses(harnessCatalog),
    runtimeProfiles,
    capabilities,
    capabilityClasses: CAPABILITY_CLASSES,
    governance,
    providerDefaults,
    computePricing,
    endpointHosts,
    pricing,
    limits,
    benchmarks,
    evidence,
    families: buildFamilyView(familyCatalog, familySnapshot, familyCatalog.policy),
    policies: {
      auto: autoPolicy,
      legacyTiers: catalog.tierAllowedModels,
    },
  };
}

const TYPESCRIPT_REGISTRY_MODULE = `/* This file is generated by @agiworkforce/model-registry. */\nimport registry from './registry.json';\n\nexport const modelRegistry = registry;\nexport type ModelRegistry = typeof modelRegistry;\nexport type ModelKey = keyof ModelRegistry['models'];\nexport type ProviderId = keyof ModelRegistry['providerModelKeys'];\nexport type RouteId = keyof ModelRegistry['routes'];\nexport type HarnessId = keyof ModelRegistry['harnesses'];\nexport type RuntimeProfileId = keyof ModelRegistry['runtimeProfiles'];\n\nexport type RouteCacheClass =\n  | 'provider_implicit_prompt_cache'\n  | 'provider_explicit_prompt_cache'\n  | 'gateway_prompt_cache'\n  | 'gateway_response_cache'\n  | 'no_provider_cache';\n\nexport type RouteCommercialStatus =\n  | 'agi_direct'\n  | 'customer_byok'\n  | 'authorized_marketplace'\n  | 'free_commercial'\n  | 'experimental_only'\n  | 'blocked';\n\nexport type RouteDataRetention =\n  | 'zero_retention'\n  | 'provider_default'\n  | 'conditional'\n  | 'unknown';\n\ninterface RoutePricingRecord {\n  currency: string;\n  unit: string;\n  inputPerMillion?: number;\n  outputPerMillion?: number;\n  cacheReadPerMillion?: number;\n  cacheWritePerMillion?: number;\n  cacheWrite1hPerMillion?: number;\n}\n\ninterface RouteRecord {\n  modelKey: string;\n  provider: string;\n  providerModelId: string;\n  harnessId: string;\n  trustModes: readonly string[];\n  isDefault: boolean;\n  cacheClass: RouteCacheClass;\n  commercialStatus: RouteCommercialStatus;\n  dataRetention: RouteDataRetention;\n  pricing: RoutePricingRecord;\n}\n\nexport interface RoutePriceSheet {\n  routeId: string;\n  modelKey: string;\n  provider: string;\n  providerModelId: string;\n  harnessId: string;\n  isDefault: boolean;\n  cacheClass: RouteCacheClass;\n  commercialStatus: RouteCommercialStatus;\n  dataRetention: RouteDataRetention;\n  currency: string;\n  unit: string;\n  inputPerMillion: number | null;\n  outputPerMillion: number | null;\n  cacheReadPerMillion: number | null;\n  cacheWritePerMillion: number | null;\n  cacheWrite1hPerMillion: number | null;\n}\n\nconst routeRecords = registry.routes as unknown as Readonly<Record<string, RouteRecord>>;\n\nfunction toPriceSheet(routeId: string, route: RouteRecord): RoutePriceSheet {\n  const { pricing } = route;\n  return {\n    routeId,\n    modelKey: route.modelKey,\n    provider: route.provider,\n    providerModelId: route.providerModelId,\n    harnessId: route.harnessId,\n    isDefault: route.isDefault,\n    cacheClass: route.cacheClass,\n    commercialStatus: route.commercialStatus,\n    dataRetention: route.dataRetention,\n    currency: pricing.currency,\n    unit: pricing.unit,\n    inputPerMillion: pricing.inputPerMillion ?? null,\n    outputPerMillion: pricing.outputPerMillion ?? null,\n    cacheReadPerMillion: pricing.cacheReadPerMillion ?? null,\n    cacheWritePerMillion: pricing.cacheWritePerMillion ?? null,\n    cacheWrite1hPerMillion: pricing.cacheWrite1hPerMillion ?? null,\n  };\n}\n\nexport function getRoutePricing(routeId: string): RoutePriceSheet | null {\n  const route = routeRecords[routeId];\n  return route ? toPriceSheet(routeId, route) : null;\n}\n\nexport function getRoutePricingForModel(modelKey: string): RoutePriceSheet[] {\n  return Object.entries(routeRecords)\n    .filter(([, route]) => route.modelKey === modelKey)\n    .map(([routeId, route]) => toPriceSheet(routeId, route));\n}\n\nexport type CacheTokenBillingClass = 'additional_to_input' | 'included_in_input' | 'unknown';\n\ninterface ProviderGovernanceRecord {\n  cacheTokenBillingClass?: CacheTokenBillingClass;\n}\n\nconst governanceRecords = registry.governance as unknown as Readonly<\n  Record<string, ProviderGovernanceRecord>\n>;\n\nexport function getProviderCacheTokenBillingClass(providerId: string): CacheTokenBillingClass {\n  return governanceRecords[providerId]?.cacheTokenBillingClass ?? 'unknown';\n}\n\nexport type ComputePricingUnit = 'usd_per_vcpu_second';\n\nexport interface ProviderComputePricing {\n  unit: ComputePricingUnit;\n  ratePerUnit: number;\n}\n\nconst computePricingRecords = registry.computePricing as unknown as Readonly<\n  Record<string, ProviderComputePricing>\n>;\n\nexport function getProviderComputePricing(providerId: string): ProviderComputePricing | null {\n  return computePricingRecords[providerId] ?? null;\n}\nexport type HarnessProtocol =\n  | 'openai_chat'\n  | 'openai_responses'\n  | 'anthropic_messages'\n  | 'gemini_native'\n  | 'provider_native';\n\nexport type HarnessHostPolicy = 'allowlist_only' | 'registry_declared';\n\ninterface HarnessRecord {\n  provider: string;\n  apiFamily: string;\n  adapter: string;\n  trustModes: readonly string[];\n  protocol: HarnessProtocol;\n  hostPolicy: HarnessHostPolicy;\n  baseUrl?: string;\n  apiKeyEnv?: string;\n}\n\nexport interface ProtocolHarness {\n  harnessId: string;\n  provider: string;\n  apiFamily: string;\n  protocol: Exclude<HarnessProtocol, 'provider_native'>;\n  baseUrl: string;\n  apiKeyEnv: string;\n  hostPolicy: HarnessHostPolicy;\n  trustModes: readonly string[];\n}\n\nexport interface ProtocolRoute extends ProtocolHarness {\n  routeId: string;\n  modelKey: string;\n  providerModelId: string;\n  cacheClass: RouteCacheClass;\n  commercialStatus: RouteCommercialStatus;\n}\n\nconst PROVIDER_NATIVE_PROTOCOL = 'provider_native' satisfies HarnessProtocol;\nconst REGISTRY_DECLARED_HOST_POLICY = 'registry_declared' satisfies HarnessHostPolicy;\n\nconst harnessRecords = registry.harnesses as unknown as Readonly<Record<string, HarnessRecord>>;\n\nfunction toProtocolHarness(harnessId: string, harness: HarnessRecord): ProtocolHarness | null {\n  const { protocol, baseUrl, apiKeyEnv } = harness;\n  if (protocol === PROVIDER_NATIVE_PROTOCOL || !baseUrl || !apiKeyEnv) return null;\n  return {\n    harnessId,\n    provider: harness.provider,\n    apiFamily: harness.apiFamily,\n    protocol,\n    baseUrl,\n    apiKeyEnv,\n    hostPolicy: harness.hostPolicy,\n    trustModes: harness.trustModes,\n  };\n}\n\nexport function getProtocolHarness(harnessId: string): ProtocolHarness | null {\n  const harness = harnessRecords[harnessId];\n  return harness ? toProtocolHarness(harnessId, harness) : null;\n}\n\nexport function listProtocolRoutes(): ProtocolRoute[] {\n  return Object.entries(routeRecords).flatMap(([routeId, route]) => {\n    const harness = getProtocolHarness(route.harnessId);\n    if (!harness) return [];\n    return [\n      {\n        ...harness,\n        routeId,\n        modelKey: route.modelKey,\n        provider: route.provider,\n        providerModelId: route.providerModelId,\n        cacheClass: route.cacheClass,\n        commercialStatus: route.commercialStatus,\n        trustModes: route.trustModes,\n      },\n    ];\n  });\n}\n\nexport const REGISTRY_DECLARED_PROVIDER_HOSTS: readonly string[] = [\n  ...new Set(\n    Object.values(harnessRecords)\n      .filter((harness) => harness.hostPolicy === REGISTRY_DECLARED_HOST_POLICY && harness.baseUrl)\n      .map((harness) => new URL(harness.baseUrl as string).hostname.toLowerCase()),\n  ),\n];\n\nexport type EndpointHostMatch = 'host' | 'hostSuffix' | 'domain' | 'baseUrl';\n\nexport interface EndpointHostRule {\n  match: EndpointHostMatch;\n  pattern: string;\n  endpointClass: string;\n  longTtlPromptCache: boolean;\n  hostPattern?: string;\n}\n\ninterface EndpointHostRecords {\n  rules: readonly EndpointHostRule[];\n  localHosts: readonly string[];\n  localHostSuffixes: readonly string[];\n}\n\nconst endpointHostRecords = registry.endpointHosts as unknown as EndpointHostRecords;\n\nexport const REGISTRY_ENDPOINT_HOST_RULES: readonly EndpointHostRule[] = endpointHostRecords.rules;\n\nexport const REGISTRY_LOCAL_ENDPOINT_HOSTS: readonly string[] = endpointHostRecords.localHosts;\n\nexport const REGISTRY_LOCAL_ENDPOINT_HOST_SUFFIXES: readonly string[] =\n  endpointHostRecords.localHostSuffixes;\n\nexport const INTRINSIC_CAPABILITY_NAMES = ${JSON.stringify(INTRINSIC_CAPABILITY_NAMES)} as const;\n\nexport const ROUTE_DEPENDENT_CAPABILITY_NAMES = ${JSON.stringify(ROUTE_DEPENDENT_CAPABILITY_NAMES)} as const;\n\nexport type IntrinsicCapabilityName = (typeof INTRINSIC_CAPABILITY_NAMES)[number];\n\nexport type RouteDependentCapabilityName = (typeof ROUTE_DEPENDENT_CAPABILITY_NAMES)[number];\n\nexport type ModelCapabilityName = IntrinsicCapabilityName | RouteDependentCapabilityName;\n\nexport type ModelCapabilityValue = boolean | null;\n\nexport type NormalizedModelCapabilities = Readonly<Record<ModelCapabilityName, ModelCapabilityValue>>;\n\n\nexport default registry;\n`;
const RUST_REGISTRY_MODULE_SOURCE = `// This file is generated by @agiworkforce/model-registry.\npub const MODEL_REGISTRY_JSON: &str = include_str!("model_registry.json");\n`;

function yamlSingleQuoted(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function buildSkillSpectorProviderRegistry(catalog, providerId) {
  const provider = catalog.providers?.[providerId];
  assert.ok(provider?.defaultModel, `${providerId} provider defaultModel is required`);
  const routedModelIds = [
    ...new Set([provider.defaultModel, ...Object.values(provider.taskRouting ?? {})]),
  ];
  const lines = [
    '# This file is generated by @agiworkforce/model-registry.',
    '# Edit packages/ai/model-registry/catalog/models.curation.json, then run pnpm sync:models.',
    `default_model: ${yamlSingleQuoted(provider.defaultModel)}`,
    'models:',
  ];
  for (const modelId of routedModelIds) {
    const model = catalog.models?.[modelId];
    assert.equal(
      model?.provider,
      providerId,
      `${providerId} route ${modelId} must resolve to its owning provider`,
    );
    assert.ok(
      ['chat', 'code', 'reasoning', 'multimodal'].includes(model.modelType),
      `${providerId} analyzer route ${modelId} must be chat-capable`,
    );
    assert.ok(Number.isInteger(model.contextWindow) && model.contextWindow > 0);
    assert.ok(Number.isInteger(model.maxOutputTokens) && model.maxOutputTokens > 0);
    lines.push(
      `  ${yamlSingleQuoted(modelId)}:`,
      `    context_length: ${model.contextWindow}`,
      `    max_output_tokens: ${model.maxOutputTokens}`,
    );
  }
  return `${lines.join('\n')}\n`;
}

async function buildNormalizedArtifacts(catalog, familyCatalog, syncedSnapshot) {
  const harnessCatalog = readJson(HARNESSES_JSON);
  const modelRouteCatalog = readJson(MODEL_ROUTES_JSON);
  const routingPolicies = readJson(ROUTING_POLICIES_JSON);
  const governanceCatalog = readJson(PROVIDER_GOVERNANCE_JSON);
  const computePricingCatalog = readJson(PROVIDER_COMPUTE_PRICING_JSON);
  assert.equal(routingPolicies.schemaVersion, 1, 'Unsupported routing policy schema version');
  assert.equal(modelRouteCatalog.schemaVersion, 1, 'Unsupported model route schema version');
  assert.equal(familyCatalog.schemaVersion, 1, 'Unsupported model family schema version');
  assert.equal(
    governanceCatalog.schemaVersion,
    1,
    'Unsupported provider governance schema version',
  );
  assert.equal(
    computePricingCatalog.schemaVersion,
    1,
    'Unsupported provider compute pricing schema version',
  );
  const registry = buildNormalizedRegistry(
    catalog,
    harnessCatalog,
    modelRouteCatalog,
    routingPolicies,
    familyCatalog,
    governanceCatalog,
    syncedSnapshot.source,
    readJson(PROVIDER_HOSTS_JSON),
    readJson(PROVIDER_DEFAULTS_JSON),
    computePricingCatalog,
  );
  const schema = readJson(REGISTRY_SCHEMA_JSON);
  const validate = new Ajv({ allErrors: true, strict: true }).compile(schema);
  if (!validate(registry)) {
    throw new Error(
      `Normalized model registry failed schema validation:\n${JSON.stringify(validate.errors, null, 2)}`,
    );
  }
  return {
    registry,
    json: await formatJson(registry, REGISTRY_JSON),
    typescript: await formatTypescript(TYPESCRIPT_REGISTRY_MODULE, REGISTRY_TS),
    rustJson: await formatJson(registry, RUST_REGISTRY_JSON),
    rustModule: RUST_REGISTRY_MODULE_SOURCE,
    skillSpectorProviderYamls: Object.fromEntries(
      Object.keys(SKILLSPECTOR_PROVIDER_REGISTRY_YAMLS).map((providerId) => [
        providerId,
        buildSkillSpectorProviderRegistry(catalog, providerId),
      ]),
    ),
  };
}

function ensureGeneratedDirectories() {
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  fs.mkdirSync(RUST_GENERATED_DIR, { recursive: true });
  fs.mkdirSync(RUST_ROUTING_GENERATED_DIR, { recursive: true });
  for (const file of Object.values(SKILLSPECTOR_PROVIDER_REGISTRY_YAMLS)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
}

function writeText(file, contents) {
  fs.writeFileSync(file, contents);
}

function checkGeneratedArtifact(file, expected) {
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== expected) {
    console.error(`[sync] ✗ GENERATED drift: ${path.relative(ROOT, file)} is missing or stale.`);
    console.error('       Run `pnpm sync:models` and commit the result.');
    process.exitCode = 1;
    return false;
  }
  return true;
}

function lifecycleStages(registry) {
  return Object.fromEntries(
    Object.entries(registry.models).map(([modelKey, model]) => [modelKey, model.lifecycle.stage]),
  );
}

async function generate() {
  const curation = readJson(CURATION_JSON);
  const synced = readJson(SYNCED_JSON);
  const familyCatalog = loadFamilyCatalog(CATALOG_DIR);
  const catalog = buildCatalog(curation, synced, familyCatalog, readJson(PROVIDER_DEFAULTS_JSON));
  await writeJson(MODELS_JSON, catalog);
  const artifacts = await buildNormalizedArtifacts(catalog, familyCatalog, synced);
  ensureGeneratedDirectories();
  writeText(REGISTRY_JSON, artifacts.json);
  writeText(REGISTRY_TS, artifacts.typescript);
  writeText(RUST_REGISTRY_JSON, artifacts.rustJson);
  writeText(RUST_REGISTRY_MODULE, artifacts.rustModule);
  writeText(RUST_ROUTING_REGISTRY_JSON, artifacts.rustJson);
  writeText(RUST_ROUTING_REGISTRY_MODULE, artifacts.rustModule);
  for (const [providerId, file] of Object.entries(SKILLSPECTOR_PROVIDER_REGISTRY_YAMLS)) {
    writeText(file, artifacts.skillSpectorProviderYamls[providerId]);
  }
  console.log(
    `[sync] generate → ${Object.keys(catalog.models).length} compatibility models + ` +
      `${Object.keys(artifacts.registry.models).length} normalized models written`,
  );
  console.log(`[sync] lifecycle → ${formatStageCensus(lifecycleStages(artifacts.registry))}`);
  return catalog;
}

async function check() {
  const curation = readJson(CURATION_JSON);
  const synced = readJson(SYNCED_JSON);
  const familyCatalog = loadFamilyCatalog(CATALOG_DIR);
  const built = buildCatalog(curation, synced, familyCatalog, readJson(PROVIDER_DEFAULTS_JSON));
  const regenerated = await formatJson(built, MODELS_JSON);
  const committed = fs.readFileSync(MODELS_JSON, 'utf8');

  try {
    assert.deepStrictEqual(built, JSON.parse(committed));
  } catch {
    console.error('[sync] ✗ DATA drift: regenerated catalog differs from committed models.json.');
    console.error('       Run `pnpm sync:models` and commit the result.');
    process.exitCode = 1;
    return;
  }
  if (regenerated !== committed) {
    console.error('[sync] ✗ FORMAT drift: byte output differs from committed models.json.');
    console.error('       Run `pnpm sync:models` and commit the result.');
    process.exitCode = 1;
    return;
  }
  const artifacts = await buildNormalizedArtifacts(built, familyCatalog, synced);
  const generatedOk = [
    checkGeneratedArtifact(REGISTRY_JSON, artifacts.json),
    checkGeneratedArtifact(REGISTRY_TS, artifacts.typescript),
    checkGeneratedArtifact(RUST_REGISTRY_JSON, artifacts.rustJson),
    checkGeneratedArtifact(RUST_REGISTRY_MODULE, artifacts.rustModule),
    checkGeneratedArtifact(RUST_ROUTING_REGISTRY_JSON, artifacts.rustJson),
    checkGeneratedArtifact(RUST_ROUTING_REGISTRY_MODULE, artifacts.rustModule),
    ...Object.entries(SKILLSPECTOR_PROVIDER_REGISTRY_YAMLS).map(([providerId, file]) =>
      checkGeneratedArtifact(file, artifacts.skillSpectorProviderYamls[providerId]),
    ),
  ].every(Boolean);
  if (!generatedOk) return;
  console.log('[sync] ✓ models.json is in sync with curation + synced inputs.');
}

function mapDevModel(devModel) {
  const out = {};
  if (devModel.limit?.context != null) out.contextWindow = devModel.limit.context;
  if (devModel.cost?.input != null) out.inputCost = devModel.cost.input;
  if (devModel.cost?.output != null) out.outputCost = devModel.cost.output;
  if (devModel.cost?.cache_read != null) out.cached_input = devModel.cost.cache_read;
  if (devModel.cost?.cache_write != null) out.cached_write = devModel.cost.cache_write;
  return out;
}

function deltaTrips(baseline, next, threshold) {
  const trips = [];
  for (const field of ['inputCost', 'outputCost', 'contextWindow']) {
    const a = baseline[field];
    const b = next[field];
    if (a == null || b == null || a === 0) continue;
    const delta = Math.abs(b - a) / a;
    if (delta > threshold) trips.push({ field, from: a, to: b, delta });
  }
  return trips;
}

async function refresh(threshold) {
  const curation = readJson(CURATION_JSON);
  const synced = readJson(SYNCED_JSON);
  const dev = await loadModelsDev();

  const aaKey = process.env.ARTIFICIAL_ANALYSIS_API_KEY;
  if (!aaKey) {
    console.warn(
      '[sync] ARTIFICIAL_ANALYSIS_API_KEY not set, benchmarks/speed kept from snapshot.',
    );
  }

  const tripped = [];
  let refreshed = 0;
  for (const id of Object.keys(synced.models)) {
    const cur = curation.models[id];
    if (!cur) continue;
    const devModel = devLookup(dev, cur);
    if (!devModel) continue;
    const next = mapDevModel(devModel);
    const baseline = synced.models[id];
    const trips = deltaTrips(baseline, next, threshold);
    if (trips.length) {
      tripped.push({ id, trips });
      continue;
    }
    synced.models[id] = { ...baseline, ...next };
    refreshed += 1;
  }

  if (tripped.length) {
    console.error(
      `\n[sync] ⚠ sanity gate tripped for ${tripped.length} model(s) (> ${threshold * 100}%):`,
    );
    for (const { id, trips } of tripped) {
      for (const t of trips) {
        console.error(
          `   ${id}.${t.field}: ${t.from} → ${t.to} (${(t.delta * 100).toFixed(0)}% change)`,
        );
      }
    }
    console.error(
      '\n   These were NOT auto-applied. Verify against the provider, then either update\n' +
        '   the baseline in models.synced.json or pin via curation costOverride, and re-run.',
    );
  }

  await writeJson(SYNCED_JSON, synced);
  console.log(`[sync] refresh → ${refreshed} model(s) updated, ${tripped.length} held for review`);
  await generate();
}

async function main() {
  const args = process.argv.slice(2);
  const deltaArg = args.find((a) => a.startsWith('--delta='));
  const threshold = deltaArg ? Number(deltaArg.split('=')[1]) : 0.3;

  if (args.includes('extract')) return extract();
  if (args.includes('--check')) return check();
  if (args.includes('--refresh')) return refresh(threshold);
  return generate();
}

export const FAMILY_CATALOG_DIR = CATALOG_DIR;

export function loadFamilySnapshot() {
  const curation = readJson(CURATION_JSON);
  const synced = readJson(SYNCED_JSON);
  const familyCatalog = loadFamilyCatalog(CATALOG_DIR);
  const catalog = buildCatalog(curation, synced, familyCatalog, readJson(PROVIDER_DEFAULTS_JSON));
  const registry = buildNormalizedRegistry(
    catalog,
    readJson(HARNESSES_JSON),
    readJson(MODEL_ROUTES_JSON),
    readJson(ROUTING_POLICIES_JSON),
    familyCatalog,
    readJson(PROVIDER_GOVERNANCE_JSON),
    synced.source,
    readJson(PROVIDER_HOSTS_JSON),
    readJson(PROVIDER_DEFAULTS_JSON),
    readJson(PROVIDER_COMPUTE_PRICING_JSON),
  );
  return {
    familyCatalog,
    snapshot: {
      models: catalog.models,
      providers: catalog.providers,
      capabilities: registry.capabilities,
      pricing: registry.pricing,
      limits: registry.limits,
      benchmarks: registry.benchmarks,
      retiredModelKeys: new Set(readJson(RETIRED_MODELS_JSON).retiredModelIds),
    },
  };
}

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isEntrypoint) {
  main().catch((err) => {
    console.error('[sync] fatal:', err);
    process.exitCode = 1;
  });
}
