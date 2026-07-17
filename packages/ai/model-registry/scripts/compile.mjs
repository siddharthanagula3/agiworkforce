#!/usr/bin/env node
/**
 * compile.mjs — single-source-of-truth compiler for the model registry.
 *
 * The compatibility catalog (`packages/contracts/types/src/models.json`) is a GENERATED,
 * committed artifact assembled from two inputs owned by this package:
 *
 *   - `catalog/models.curation.json` — the ONLY hand-edited file. Per model it carries
 *     identity + routing/display metadata (id, apiModelId, name, provider,
 *     modelType, qualityTier, bestFor, quality, …) and curation-owned policy
 *     fields (promo_expires_at/post_promo_prices, deprecation_date, tokenizer
 *     drift, supersedes, …). For models NOT present upstream (image/video/audio,
 *     self-hosted, brand-new) it also carries escape-hatch overrides
 *     (costOverride / contextOverride / capabilitiesOverride / benchmarkOverride
 *     / speedOverride / releasedOverride). Plus the top-level sections
 *     (version, lastUpdated, verificationLog, providers, tierAllowedModels,
 *     modelPresets, providersInOrder) verbatim.
 *
 *   - `catalog/models.synced.json` — a committed snapshot of UPSTREAM-derived fields
 *     (contextWindow, inputCost, outputCost, cached_input, capabilities,
 *     benchmarks, speed, released) for the models that exist on models.dev.
 *     Refreshed by `--refresh` (and the weekly cron); never hand-edited.
 *
 * Generation = merge(curation, synced) → models.json, with curation overrides
 * winning over the synced snapshot, emitted in a single canonical key order and
 * prettier-formatted so the output is byte-stable.
 *
 * Subcommands / flags:
 *   extract     One-time bootstrap: split the CURRENT models.json into
 *               curation.json + synced.json (values copied verbatim; upstream
 *               membership decided via models.dev). Produces a lossless split.
 *   (default)   generate: merge committed inputs → write models.json.
 *   --check     generate in-memory; deep-equal AND byte-compare against the
 *               committed models.json; exit 1 on any drift. Fully OFFLINE +
 *               deterministic — safe for CI.
 *   --refresh   fetch live models.dev (+ Artificial Analysis when
 *               ARTIFICIAL_ANALYSIS_API_KEY is set) → rebuild synced.json for
 *               matched models, gated by a price-delta sanity check, then
 *               generate. This is the cron / maintenance path.
 *   --delta=N   price-delta gate threshold (fraction, default 0.30 = 30%).
 *
 * Pure Node ESM; the only runtime dep is prettier (already a repo dependency).
 */

import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import Ajv from 'ajv';
import prettier from 'prettier';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_DIR = path.resolve(SCRIPT_DIR, '..');
// model-registry lives at packages/ai/model-registry (T-wave 2026-07-16), so
// repo root is three levels up; types moved to packages/contracts/types.
const ROOT = path.resolve(REGISTRY_DIR, '..', '..', '..');
const TYPES_DIR = path.join(ROOT, 'packages', 'contracts', 'types', 'src');
const MODELS_JSON = path.join(TYPES_DIR, 'models.json');
const CATALOG_DIR = path.join(REGISTRY_DIR, 'catalog');
const CURATION_JSON = path.join(CATALOG_DIR, 'models.curation.json');
const SYNCED_JSON = path.join(CATALOG_DIR, 'models.synced.json');
const HARNESSES_JSON = path.join(CATALOG_DIR, 'harnesses.json');
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

const MODELS_DEV_URL = 'https://models.dev/api.json';
const AA_URL = 'https://artificialanalysis.ai/api/v2/data/llms/models';

// Fields whose source of truth is an upstream snapshot. Everything else on a
// model is curation-owned. Order here is also the canonical emit order for
// these fields (see CANONICAL_ORDER).
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

// Curation override keys → which synced field they replace.
const OVERRIDE_KEYS = [
  'costOverride', // { inputCost?, outputCost?, cached_input?, cached_write?, cached_write_1h? }
  'contextOverride', // contextWindow
  'capabilitiesOverride', // capabilities
  'benchmarkOverride', // benchmarks
  'speedOverride', // speed
  'releasedOverride', // released
];

// One canonical per-model key order for the generated catalog. Chosen to match
// the dominant existing ordering so the lift-and-shift diff stays minimal.
const CANONICAL_ORDER = [
  'id',
  'apiModelId',
  'name',
  'provider',
  'modelType',
  'inputModalities',
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
  'supersedes',
  'supersedes_effective_date',
  'supersedes_note',
  'tokenizer_drift_factor',
  'tokenizer_drift_range',
  'tokenizer_drift_warning',
  'imagePerImageCost',
  'imageApi',
  'videoPerSecondCost',
  'videoPerSecondCostByResolution',
  'pricingNote',
];

// Top-level key order of models.json (models sits 5th).
const TOP_LEVEL_ORDER = [
  'version',
  'lastUpdated',
  'verificationLog',
  'providers',
  'models',
  'tierAllowedModels',
  'modelPresets',
  'providersInOrder',
];

// ---------------------------------------------------------------------------
// IO helpers
// ---------------------------------------------------------------------------

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function formatJson(obj, filepath) {
  const cfg = (await prettier.resolveConfig(filepath)) ?? {};
  return prettier.format(JSON.stringify(obj), { ...cfg, parser: 'json', filepath });
}

async function writeJson(file, obj) {
  fs.writeFileSync(file, await formatJson(obj, file));
}

// Drop undefined values; keep nulls (catalog uses null intentionally, e.g.
// deprecation_date: null).
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

// ---------------------------------------------------------------------------
// Upstream loading
// ---------------------------------------------------------------------------

/**
 * Map our catalog provider keys → the canonical models.dev provider key.
 * The join MUST be provider-scoped: models.dev hosts the same model id under
 * dozens of aggregator providers (often with missing or re-marked-up pricing),
 * so matching the first provider that happens to list an id pulls the wrong
 * data. Providers absent from this map (AGI-managed media adapters, nvidia_nim
 * self-hosted, runway) have no first-party models.dev catalog and are treated
 * as non-upstream — their cost/context/caps live in curation overrides.
 */
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

/**
 * Resolve a catalog model against its CANONICAL models.dev provider only.
 * Returns the upstream model object, or null when the model has no first-party
 * models.dev entry that carries pricing (→ curation-override territory).
 */
function devLookup(dev, model) {
  const apiId = model.apiModelId || model.id;
  // `:free` aggregator models are free by definition. Never strip the suffix
  // and inherit the paid variant's pricing — treat them as non-upstream so
  // their 0/0 pricing stays pinned in curation.
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
  // Prefer a fresh fetch; fall back to a /tmp snapshot if offline.
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

// ---------------------------------------------------------------------------
// extract — bootstrap split of the current models.json (lossless, no fetch
// of VALUES; models.dev consulted only to classify upstream membership)
// ---------------------------------------------------------------------------

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
      // Not on models.dev → fold synced-type fields into curation overrides so
      // they remain hand-maintained.
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
    modelPresets: current.modelPresets,
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

// ---------------------------------------------------------------------------
// generate — merge committed inputs → models.json object
// ---------------------------------------------------------------------------

function resolveSyncedFields(cur, up) {
  const co = cur.costOverride ?? {};
  // Effective cached-read price: costOverride > curation top-level > synced upstream.
  // (Some curation entries carry cached_input as a top-level own field rather than
  // inside costOverride; both must count toward caching eligibility.)
  const cachedInput = co.cached_input ?? cur.cached_input ?? up.cached_input;
  const baseCapabilities = cur.capabilitiesOverride ?? up.capabilities;
  // Caching eligibility is catalog-driven: a model supports prompt caching iff
  // it has a cached-read price (cached_input). This avoids string-prefix hacks
  // and keeps the `caching` capability in lockstep with pricing data. An explicit
  // capabilities.caching in curation always wins (allows opt-out / pre-pricing opt-in).
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

function buildCatalog(curation, synced) {
  const models = {};
  for (const [id, cur] of Object.entries(curation.models)) {
    const up = synced.models[id] ?? {};
    const curatedEmit = omit(cur, OVERRIDE_KEYS);
    const merged = { ...curatedEmit, ...resolveSyncedFields(cur, up) };
    assert.ok(
      ['fast', 'balanced', 'best'].includes(merged.qualityTier),
      `${id} has invalid qualityTier ${String(merged.qualityTier)}; expected fast, balanced, or best`,
    );
    models[id] = orderKeys(merged);
  }
  const catalog = {};
  for (const key of TOP_LEVEL_ORDER) {
    catalog[key] = key === 'models' ? models : curation[key];
  }
  return catalog;
}

const AUTO_POLICY_MODEL_IDS = new Set(['auto', 'auto-economy', 'auto-balanced', 'auto-premium']);
const MEDIA_MODEL_TYPES = new Set(['image', 'video', 'audio', 'tts', 'stt']);

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

function normalizeLifecycle(model) {
  const unavailable = model.availability && model.availability !== 'live';
  const deprecated = model.deprecated === true || model.status === 'deprecated';
  return defined({
    status: deprecated ? 'deprecated' : (model.status ?? 'active'),
    availability: unavailable ? model.availability : 'live',
    unavailableReason: model.unavailableReason,
    released: model.released,
    deprecationDate: model.deprecation_date,
    deprecated,
  });
}

function normalizeCapabilities(model) {
  const caps = model.capabilities ?? {};
  const explicitInputModalities = Array.isArray(model.inputModalities)
    ? new Set(model.inputModalities)
    : null;
  return {
    textInput: explicitInputModalities
      ? explicitInputModalities.has('text')
      : model.modelType !== 'stt',
    imageInput: explicitInputModalities
      ? explicitInputModalities.has('image')
      : caps.vision === true,
    audioInput: explicitInputModalities
      ? explicitInputModalities.has('audio')
      : model.modelType === 'stt',
    videoInput: explicitInputModalities ? explicitInputModalities.has('video') : false,
    textOutput: !['embedding', 'image', 'video', 'tts'].includes(model.modelType),
    imageOutput: model.modelType === 'image',
    audioOutput: model.modelType === 'tts',
    videoOutput: model.modelType === 'video',
    streaming: caps.streaming === true,
    structuredOutput: caps.json === true,
    functionCalling: caps.tools === true,
    reasoning: caps.thinking === true,
  };
}

function positiveIntegerOrUndefined(value) {
  return Number.isInteger(value) && value > 0 ? value : undefined;
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

function buildNormalizedRegistry(catalog, harnessCatalog, routingPolicies) {
  const models = {};
  const providerModelKeys = {};
  const routes = {};
  const pricing = {};
  const limits = {};
  const capabilities = {};
  const benchmarks = {};

  for (const [modelKey, model] of Object.entries(catalog.models)) {
    if (AUTO_POLICY_MODEL_IDS.has(modelKey)) {
      throw new Error(
        `${modelKey} is an Auto routing profile and must live in routing-policies.json, not models.curation.json`,
      );
    }

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

    const lifecycle = normalizeLifecycle(model);
    models[modelKey] = {
      identity: defined({
        key: modelKey,
        displayName: model.name,
        provider: model.provider,
        providerModelId: model.apiModelId ?? model.id ?? modelKey,
        kind: model.modelType,
        familyPartner: model.variantPartner,
      }),
      lifecycle,
      evidenceRefs: Array.isArray(model.evidenceRefs) ? model.evidenceRefs : [],
    };
    (providerModelKeys[model.provider] ??= []).push(modelKey);
    routes[`${model.provider}/${modelKey}`] = {
      modelKey,
      provider: model.provider,
      providerModelId: model.apiModelId ?? model.id ?? modelKey,
      harnessId,
      trustModes: [...harness.trustModes],
      availability: lifecycle.availability,
      selectable: lifecycle.availability === 'live' && lifecycle.deprecated !== true,
    };
    pricing[modelKey] = defined({
      currency: 'USD',
      unit: model.videoPerSecondCost
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
      promoExpiresAt: model.promo_expires_at,
      postPromoPrices: model.post_promo_prices,
    });
    limits[modelKey] = defined({
      contextTokens: positiveIntegerOrUndefined(model.contextWindow),
      maxInputTokens: positiveIntegerOrUndefined(model.maxInputTokens),
      maxOutputTokens: positiveIntegerOrUndefined(model.maxOutputTokens),
      knowledgeCutoff: model.knowledgeCutoff,
    });
    capabilities[modelKey] = normalizeCapabilities(model);
    benchmarks[modelKey] = model.benchmarks ?? {};
  }

  const evidence = (catalog.verificationLog ?? []).map((entry, index) => ({
    id: `verification/${entry.date ?? 'unknown'}/${index + 1}`,
    ...entry,
  }));
  validateAutoPolicy(routingPolicies.auto, models, capabilities);
  const runtimeProfiles = buildRuntimeProfiles(harnessCatalog);

  return {
    $schema: '../schema/registry.schema.json',
    schemaVersion: 1,
    models,
    providerModelKeys,
    routes,
    harnesses: harnessCatalog.harnesses,
    runtimeProfiles,
    capabilities,
    pricing,
    limits,
    benchmarks,
    evidence,
    policies: {
      auto: routingPolicies.auto,
      legacyTiers: catalog.tierAllowedModels,
    },
  };
}

const TYPESCRIPT_REGISTRY_MODULE = `/* This file is generated by @agiworkforce/model-registry. */\nimport registry from './registry.json';\n\nexport const modelRegistry = registry;\nexport type ModelRegistry = typeof modelRegistry;\nexport type ModelKey = keyof ModelRegistry['models'];\nexport type ProviderId = keyof ModelRegistry['providerModelKeys'];\nexport type RouteId = keyof ModelRegistry['routes'];\nexport type HarnessId = keyof ModelRegistry['harnesses'];\nexport type RuntimeProfileId = keyof ModelRegistry['runtimeProfiles'];\nexport default registry;\n`;
const RUST_REGISTRY_MODULE_SOURCE = `// This file is generated by @agiworkforce/model-registry.\npub const MODEL_REGISTRY_JSON: &str = include_str!("model_registry.json");\n`;

async function buildNormalizedArtifacts(catalog) {
  const harnessCatalog = readJson(HARNESSES_JSON);
  const routingPolicies = readJson(ROUTING_POLICIES_JSON);
  assert.equal(routingPolicies.schemaVersion, 1, 'Unsupported routing policy schema version');
  const registry = buildNormalizedRegistry(catalog, harnessCatalog, routingPolicies);
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
    typescript: TYPESCRIPT_REGISTRY_MODULE,
    rustJson: await formatJson(registry, RUST_REGISTRY_JSON),
    rustModule: RUST_REGISTRY_MODULE_SOURCE,
  };
}

function ensureGeneratedDirectories() {
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  fs.mkdirSync(RUST_GENERATED_DIR, { recursive: true });
  fs.mkdirSync(RUST_ROUTING_GENERATED_DIR, { recursive: true });
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

async function generate() {
  const curation = readJson(CURATION_JSON);
  const synced = readJson(SYNCED_JSON);
  const catalog = buildCatalog(curation, synced);
  await writeJson(MODELS_JSON, catalog);
  const artifacts = await buildNormalizedArtifacts(catalog);
  ensureGeneratedDirectories();
  writeText(REGISTRY_JSON, artifacts.json);
  writeText(REGISTRY_TS, artifacts.typescript);
  writeText(RUST_REGISTRY_JSON, artifacts.rustJson);
  writeText(RUST_REGISTRY_MODULE, artifacts.rustModule);
  writeText(RUST_ROUTING_REGISTRY_JSON, artifacts.rustJson);
  writeText(RUST_ROUTING_REGISTRY_MODULE, artifacts.rustModule);
  console.log(
    `[sync] generate → ${Object.keys(catalog.models).length} compatibility models + ` +
      `${Object.keys(artifacts.registry.models).length} normalized models written`,
  );
  return catalog;
}

// ---------------------------------------------------------------------------
// check — offline deterministic drift detection for CI
// ---------------------------------------------------------------------------

async function check() {
  const curation = readJson(CURATION_JSON);
  const synced = readJson(SYNCED_JSON);
  const built = buildCatalog(curation, synced);
  const regenerated = await formatJson(built, MODELS_JSON);
  const committed = fs.readFileSync(MODELS_JSON, 'utf8');

  // Deep-equal first (data integrity), then byte-compare (format stability).
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
  const artifacts = await buildNormalizedArtifacts(built);
  const generatedOk = [
    checkGeneratedArtifact(REGISTRY_JSON, artifacts.json),
    checkGeneratedArtifact(REGISTRY_TS, artifacts.typescript),
    checkGeneratedArtifact(RUST_REGISTRY_JSON, artifacts.rustJson),
    checkGeneratedArtifact(RUST_REGISTRY_MODULE, artifacts.rustModule),
    checkGeneratedArtifact(RUST_ROUTING_REGISTRY_JSON, artifacts.rustJson),
    checkGeneratedArtifact(RUST_ROUTING_REGISTRY_MODULE, artifacts.rustModule),
  ].every(Boolean);
  if (!generatedOk) return;
  console.log('[sync] ✓ models.json is in sync with curation + synced inputs.');
}

// ---------------------------------------------------------------------------
// refresh — pull live upstream into synced.json (cron / maintenance path)
// ---------------------------------------------------------------------------

function mapDevModel(devModel) {
  const out = {};
  if (devModel.limit?.context != null) out.contextWindow = devModel.limit.context;
  if (devModel.cost?.input != null) out.inputCost = devModel.cost.input;
  if (devModel.cost?.output != null) out.outputCost = devModel.cost.output;
  if (devModel.cost?.cache_read != null) out.cached_input = devModel.cost.cache_read;
  if (devModel.cost?.cache_write != null) out.cached_write = devModel.cost.cache_write;
  // `released` is intentionally NOT synced: models.dev uses ISO dates while the
  // catalog uses human strings, and the date is informational — syncing it only
  // churns formatting. It stays curation-/seed-owned.
  return out;
}

/**
 * Sanity gate. On a refresh, if an upstream number moves more than `threshold`
 * away from the committed baseline, HALT and report rather than silently
 * accept — drift this large is more likely a units bug or a model-id mismatch
 * than a real change, and silently keeping the local value would entrench
 * whichever side is wrong. Gates price AND context window: a flagship's context
 * silently changing (e.g. 200K→1M) is exactly the kind of drift to surface.
 */
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
      '[sync] ARTIFICIAL_ANALYSIS_API_KEY not set — benchmarks/speed kept from snapshot.',
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
      continue; // halt this model; require adjudication
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

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const deltaArg = args.find((a) => a.startsWith('--delta='));
  const threshold = deltaArg ? Number(deltaArg.split('=')[1]) : 0.3;

  if (args.includes('extract')) return extract();
  if (args.includes('--check')) return check();
  if (args.includes('--refresh')) return refresh(threshold);
  return generate();
}

main().catch((err) => {
  console.error('[sync] fatal:', err);
  process.exitCode = 1;
});
