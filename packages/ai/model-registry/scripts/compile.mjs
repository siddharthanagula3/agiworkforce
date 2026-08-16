#!/usr/bin/env node
/* global AbortSignal, fetch */

import { strict as assert } from 'node:assert';
import console from 'node:console';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import Ajv from 'ajv';
import prettier from 'prettier';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_DIR = path.resolve(SCRIPT_DIR, '..');
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
  'providersInOrder',
];

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
const GENERATED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

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
    for (const field of ['usdPerToken', 'usdPerTokenWithoutAudio']) {
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

function normalizeInputTokenPricingTier(label, tier) {
  assert.ok(tier && typeof tier === 'object' && !Array.isArray(tier), `${label} must be an object`);
  assert.ok(
    Number.isInteger(tier.thresholdTokens) && tier.thresholdTokens > 0,
    `${label}.thresholdTokens must be a positive integer`,
  );
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
        if (hasModelKey) return [slotId, { modelKey: slot.modelKey }];

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
        return [slotId, { modelKey }];
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
    assert.ok(
      model.inputTokenPricingTiers === undefined || model.longContext === undefined,
      `${modelKey} must not declare both inputTokenPricingTiers and legacy longContext`,
    );

    const lifecycle = normalizeLifecycle(model);
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
      identity: defined({
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
    limits[modelKey] = defined({
      contextTokens: positiveIntegerOrUndefined(model.contextWindow),
      maxInputTokens: positiveIntegerOrUndefined(model.maxInputTokens),
      maxOutputTokens: positiveIntegerOrUndefined(model.maxOutputTokens),
      knowledgeCutoff: model.knowledgeCutoff,
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
    benchmarks[modelKey] = model.benchmarks ?? {};
  }

  const evidence = (catalog.verificationLog ?? []).map((entry, index) => ({
    id: `verification/${entry.date ?? 'unknown'}/${index + 1}`,
    ...entry,
  }));
  const resolvedAutoPolicy = resolveAutoPolicy(routingPolicies.auto, catalog);
  validateAutoPolicy(resolvedAutoPolicy, models, capabilities);
  const autoPolicy = normalizeAutoPolicy(resolvedAutoPolicy);
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
      auto: autoPolicy,
      legacyTiers: catalog.tierAllowedModels,
    },
  };
}

const TYPESCRIPT_REGISTRY_MODULE = `/* This file is generated by @agiworkforce/model-registry. */\nimport registry from './registry.json';\n\nexport const modelRegistry = registry;\nexport type ModelRegistry = typeof modelRegistry;\nexport type ModelKey = keyof ModelRegistry['models'];\nexport type ProviderId = keyof ModelRegistry['providerModelKeys'];\nexport type RouteId = keyof ModelRegistry['routes'];\nexport type HarnessId = keyof ModelRegistry['harnesses'];\nexport type RuntimeProfileId = keyof ModelRegistry['runtimeProfiles'];\nexport default registry;\n`;
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
  for (const [providerId, file] of Object.entries(SKILLSPECTOR_PROVIDER_REGISTRY_YAMLS)) {
    writeText(file, artifacts.skillSpectorProviderYamls[providerId]);
  }
  console.log(
    `[sync] generate → ${Object.keys(catalog.models).length} compatibility models + ` +
      `${Object.keys(artifacts.registry.models).length} normalized models written`,
  );
  return catalog;
}

async function check() {
  const curation = readJson(CURATION_JSON);
  const synced = readJson(SYNCED_JSON);
  const built = buildCatalog(curation, synced);
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
  const artifacts = await buildNormalizedArtifacts(built);
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

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isEntrypoint) {
  main().catch((err) => {
    console.error('[sync] fatal:', err);
    process.exitCode = 1;
  });
}
