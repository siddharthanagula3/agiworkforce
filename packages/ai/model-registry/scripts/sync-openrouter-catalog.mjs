#!/usr/bin/env node
/* global AbortSignal, fetch */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import prettier from 'prettier';

import { openRouterSyncedCatalogPath } from './openrouter-synced-catalog.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_DIR = path.resolve(SCRIPT_DIR, '..');
const CATALOG_DIR = path.join(REGISTRY_DIR, 'catalog');
const CURATION_JSON = path.join(CATALOG_DIR, 'models.curation.json');
const RETIRED_MODELS_JSON = path.join(CATALOG_DIR, 'retired-models.json');
const OUTPUT_JSON = openRouterSyncedCatalogPath(CATALOG_DIR);

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/models';
const OPENROUTER_PROVIDER_ID = 'open_router';
const SYNCED_KEY_PREFIX = 'or-';
const FREE_ID_SUFFIX = ':free';
const DYNAMIC_PRICE_TOKEN = '-1';
const USD_PER_TOKEN_TO_PER_MILLION = 1_000_000;

const QUALITY_TIER_THRESHOLDS = [
  { maxInputPerMillion: 0.5, qualityTier: 'fast', quality: 'fair' },
  { maxInputPerMillion: 5, qualityTier: 'balanced', quality: 'good' },
];
const DEFAULT_QUALITY_TIER = { qualityTier: 'best', quality: 'excellent' };
const DYNAMIC_PRICING_QUALITY_TIER = { qualityTier: 'balanced', quality: 'good' };
const UNKNOWN_SPEED_DEFAULT = 'medium';

const SCHEMA_KNOWN_MODALITIES = new Set(['text', 'image', 'audio', 'video']);

const GPT_MODEL_ID_PATTERN = /\bgpt-[0-9][a-z0-9._-]*\b/giu;

const COMPAT_CAPABILITY_KEYS = [
  'streaming',
  'tools',
  'vision',
  'json',
  'thinking',
  'computerUse',
  'agentic',
  'imageGen',
  'videoGen',
  'search',
  'research',
  'codeExecution',
  'caching',
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function writeJson(file, obj) {
  const cfg = (await prettier.resolveConfig(file)) ?? {};
  const formatted = await prettier.format(JSON.stringify(obj), { ...cfg, parser: 'json', file });
  fs.writeFileSync(file, formatted);
}

async function fetchOpenRouterCatalog(fetchImpl) {
  const res = await fetchImpl(OPENROUTER_ENDPOINT, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    throw new Error(`OpenRouter models endpoint returned HTTP ${res.status}`);
  }
  const body = await res.json();
  if (!Array.isArray(body.data)) {
    throw new Error('OpenRouter models endpoint did not return a data array');
  }
  return body.data;
}

function loadCuratedOpenRouterIdentifiers() {
  const curation = readJson(CURATION_JSON);
  const identifiers = new Set();
  for (const model of Object.values(curation.models)) {
    if (model.provider !== OPENROUTER_PROVIDER_ID) continue;
    if (typeof model.apiModelId === 'string') identifiers.add(model.apiModelId);
    if (typeof model.openRouterSlug === 'string') identifiers.add(model.openRouterSlug);
  }
  return identifiers;
}

function loadRetiredAndGuardedModelIds() {
  const retired = readJson(RETIRED_MODELS_JSON);
  return new Set([
    ...(retired.retiredModelIds ?? []),
    ...(retired.guardedNonCanonicalModelIds ?? []),
  ]);
}

function loadCanonicalGptIdentifiers() {
  const curation = readJson(CURATION_JSON);
  const identifiers = new Set();
  const add = (value) => {
    if (typeof value === 'string' && /^gpt-[0-9]/iu.test(value)) {
      identifiers.add(value.toLowerCase());
    }
  };
  for (const [id, model] of Object.entries(curation.models)) {
    add(id);
    add(model?.id);
    add(model?.apiModelId);
  }
  for (const provider of Object.values(curation.providers ?? {})) {
    add(provider?.defaultModel);
    for (const value of Object.values(provider?.taskRouting ?? {})) add(value);
    for (const [alias, target] of Object.entries(provider?.canonicalization ?? {})) {
      add(alias);
      add(target);
    }
  }
  return identifiers;
}

function staleGptIdentifiers(value, canonicalGptIdentifiers) {
  if (typeof value !== 'string') return [];
  return [...value.matchAll(GPT_MODEL_ID_PATTERN)]
    .map((match) => match[0])
    .filter((id) => !canonicalGptIdentifiers.has(id.toLowerCase()));
}

function bannedCatalogReason(value, retiredAndGuardedIds, canonicalGptIdentifiers) {
  if (typeof value !== 'string') return null;
  if (retiredAndGuardedIds.has(value)) return 'retired';
  if (staleGptIdentifiers(value, canonicalGptIdentifiers).length > 0) return 'stale-gpt';
  return null;
}

function slugToModelKey(openRouterId) {
  const normalized = openRouterId
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  return `${SYNCED_KEY_PREFIX}${normalized}`;
}

function toIsoDate(unixSeconds) {
  if (!Number.isFinite(unixSeconds)) return undefined;
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

const PER_MILLION_DECIMAL_PLACES = 10;

function perMillionFromPerToken(rawValue) {
  if (typeof rawValue !== 'string') return undefined;
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric) || numeric < 0) return undefined;
  return Number((numeric * USD_PER_TOKEN_TO_PER_MILLION).toFixed(PER_MILLION_DECIMAL_PLACES));
}

function isDynamicPricing(pricing) {
  return pricing?.prompt === DYNAMIC_PRICE_TOKEN || pricing?.completion === DYNAMIC_PRICE_TOKEN;
}

function deriveCostFields(model) {
  const dynamic = isDynamicPricing(model.pricing);
  if (dynamic) {
    return { costs: { inputCost: 0, outputCost: 0 }, dynamic: true };
  }
  const inputCost = perMillionFromPerToken(model.pricing?.prompt) ?? 0;
  const outputCost = perMillionFromPerToken(model.pricing?.completion) ?? 0;
  const cachedInput = perMillionFromPerToken(model.pricing?.input_cache_read);
  const cachedWrite = perMillionFromPerToken(model.pricing?.input_cache_write);
  const cachedWrite1h = perMillionFromPerToken(model.pricing?.input_cache_write_1h);
  const costs = { inputCost, outputCost };
  if (cachedInput !== undefined) costs.cached_input = cachedInput;
  if (cachedWrite !== undefined) costs.cached_write = cachedWrite;
  if (cachedWrite1h !== undefined) costs.cached_write_1h = cachedWrite1h;
  return { costs, dynamic: false };
}

function deriveInputTokenPricingTiers(model) {
  const overrides = model.pricing?.overrides;
  if (!Array.isArray(overrides) || overrides.length === 0) return undefined;
  const tiers = overrides
    .filter((tier) => Number.isInteger(tier?.min_prompt_tokens))
    .map((tier) => {
      const out = {
        thresholdTokens: tier.min_prompt_tokens,
        inputCost: perMillionFromPerToken(tier.prompt) ?? 0,
        outputCost: perMillionFromPerToken(tier.completion) ?? 0,
      };
      const cachedInput = perMillionFromPerToken(tier.input_cache_read);
      const cachedWrite = perMillionFromPerToken(tier.input_cache_write);
      if (cachedInput !== undefined) out.cached_input = cachedInput;
      if (cachedWrite !== undefined) out.cached_write = cachedWrite;
      return out;
    })
    .sort((left, right) => left.thresholdTokens - right.thresholdTokens);
  return tiers.length > 0 ? tiers : undefined;
}

function deriveCapabilities(model, dynamic) {
  const inputModalities = new Set(model.architecture?.input_modalities ?? []);
  const outputModalities = new Set(model.architecture?.output_modalities ?? []);
  const supportedParameters = new Set(model.supported_parameters ?? []);
  const caps = {
    streaming: true,
    tools: supportedParameters.has('tools'),
    vision: inputModalities.has('image'),
    json:
      supportedParameters.has('response_format') || supportedParameters.has('structured_outputs'),
    thinking: supportedParameters.has('reasoning') || Boolean(model.reasoning),
    computerUse: false,
    agentic: supportedParameters.has('tools'),
    imageGen: outputModalities.has('image'),
    videoGen: outputModalities.has('video'),
    search:
      supportedParameters.has('web_search_options') || model.pricing?.web_search !== undefined,
    research: false,
    codeExecution: false,
    caching: !dynamic && model.pricing?.input_cache_read !== undefined,
  };
  const out = {};
  for (const key of COMPAT_CAPABILITY_KEYS) out[key] = caps[key];
  return out;
}

function deriveQualityTier(effectiveInputCost, dynamic) {
  if (dynamic) return DYNAMIC_PRICING_QUALITY_TIER;
  for (const bucket of QUALITY_TIER_THRESHOLDS) {
    if (effectiveInputCost <= bucket.maxInputPerMillion) {
      return { qualityTier: bucket.qualityTier, quality: bucket.quality };
    }
  }
  return DEFAULT_QUALITY_TIER;
}

function deriveOpenness(model) {
  const hfId = model.hugging_face_id;
  if (typeof hfId === 'string' && hfId.length > 0) {
    return { openWeight: true };
  }
  return { openWeight: false, license: 'proprietary' };
}

function deriveBestFor(model, { isFree, dynamic }) {
  const tags = ['OpenRouter Catalog'];
  const outputModalities = new Set(model.architecture?.output_modalities ?? []);
  if (outputModalities.has('image')) tags.push('Image Generation');
  if (outputModalities.has('audio')) tags.push('Audio Output');
  if (outputModalities.has('video')) tags.push('Video Generation');
  if (dynamic) tags.push('Dynamic Routing');
  if (isFree) tags.push('Free Tier (BYOK Only)');
  return tags;
}

function deriveUnrepresentedPricingNote(model) {
  const unrepresented = [
    'web_search',
    'audio',
    'audio_output',
    'internal_reasoning',
    'input_audio_cache',
  ].filter((field) => model.pricing?.[field] !== undefined);
  if (unrepresented.length === 0) return '';
  return ` OpenRouter also publishes a per-unit rate for ${unrepresented.join(', ')} on this route; the registry pricing schema has no field for it, so it is not recorded here.`;
}

function transformModel(model, { fetchedAt, isFree, dynamic }) {
  const { costs } = deriveCostFields(model);
  const inputTokenPricingTiers = dynamic ? undefined : deriveInputTokenPricingTiers(model);
  const capabilities = deriveCapabilities(model, dynamic);
  const { qualityTier, quality } = deriveQualityTier(costs.inputCost, dynamic);
  const openness = deriveOpenness(model);
  const released = toIsoDate(model.created);
  const key = slugToModelKey(model.id);

  const entry = {
    id: key,
    apiModelId: model.id,
    openRouterSlug: model.canonical_slug ?? model.id,
    name: model.name.trim(),
    provider: OPENROUTER_PROVIDER_ID,
    modelType: 'chat',
    ...(Array.isArray(model.architecture?.input_modalities)
      ? {
          inputModalities: model.architecture.input_modalities.filter((m) =>
            SCHEMA_KNOWN_MODALITIES.has(m),
          ),
        }
      : {}),
    ...(Array.isArray(model.architecture?.output_modalities)
      ? {
          outputModalities: model.architecture.output_modalities.filter((m) =>
            SCHEMA_KNOWN_MODALITIES.has(m),
          ),
        }
      : {}),
    ...(Number.isInteger(model.context_length) && model.context_length > 0
      ? { contextWindow: model.context_length }
      : {}),
    ...(Number.isInteger(model.top_provider?.max_completion_tokens) &&
    model.top_provider.max_completion_tokens > 0
      ? { maxOutputTokens: model.top_provider.max_completion_tokens }
      : {}),
    ...costs,
    capabilities,
    speed: UNKNOWN_SPEED_DEFAULT,
    quality,
    qualityTier,
    bestFor: deriveBestFor(model, { isFree, dynamic }),
    ...(released ? { released } : {}),
    deprecation_date: typeof model.expiration_date === 'string' ? model.expiration_date : null,
    ...(inputTokenPricingTiers ? { inputTokenPricingTiers } : {}),
    pricingNote:
      `Synced mechanically from ${OPENROUTER_ENDPOINT}, fetched ${fetchedAt}, by ` +
      `scripts/sync-openrouter-catalog.mjs. Not individually hand-verified beyond the ` +
      `endpoint's own published fields.` +
      (dynamic
        ? " OpenRouter publishes prompt/completion prices of -1 for this route: the request bills at the resolved model's own rate, with no router fee. The zero rates recorded here are a placeholder for that dynamic price; meter the model named in the response, never at zero."
        : '') +
      (isFree
        ? ' Zero-rated by OpenRouter ("0"/"0"). This route is BYOK-only: it is intentionally absent from apps/web/config/free-pools.json because the company-funded free lane excludes OpenRouter free variants per docs/research/free-inference-tos-workbook-2026-09-01.md (Pool 5, terms excluded).'
        : '') +
      deriveUnrepresentedPricingNote(model),
    ...openness,
    lifecycle: {
      stage: 'discovered',
      stagedOn: fetchedAt,
      source: `${OPENROUTER_ENDPOINT}#${fetchedAt}`,
    },
  };
  return [key, entry];
}

export async function buildSyncedCatalog({ fetchImpl = fetch, now = new Date() } = {}) {
  const fetchedAt = now.toISOString().slice(0, 10);
  const rawModels = await fetchOpenRouterCatalog(fetchImpl);
  const curated = loadCuratedOpenRouterIdentifiers();
  const retiredAndGuardedIds = loadRetiredAndGuardedModelIds();
  const canonicalGptIdentifiers = loadCanonicalGptIdentifiers();

  const models = {};
  let includedCount = 0;
  let skippedCuratedCount = 0;
  let skippedRetiredCount = 0;
  let skippedStaleGptCount = 0;
  let freeCount = 0;

  for (const model of [...rawModels].sort((a, b) => a.id.localeCompare(b.id))) {
    if (curated.has(model.id) || curated.has(model.canonical_slug)) {
      skippedCuratedCount += 1;
      continue;
    }
    const key = slugToModelKey(model.id);
    const reason =
      bannedCatalogReason(key, retiredAndGuardedIds, canonicalGptIdentifiers) ??
      bannedCatalogReason(model.id, retiredAndGuardedIds, canonicalGptIdentifiers);
    if (reason === 'retired') {
      skippedRetiredCount += 1;
      continue;
    }
    if (reason === 'stale-gpt') {
      skippedStaleGptCount += 1;
      continue;
    }
    const isFree = model.id.endsWith(FREE_ID_SUFFIX);
    const dynamic = isDynamicPricing(model.pricing);
    const [, entry] = transformModel(model, { fetchedAt, isFree, dynamic });
    models[key] = entry;
    includedCount += 1;
    if (isFree) freeCount += 1;
  }

  const sortedModels = Object.fromEntries(
    Object.keys(models)
      .sort()
      .map((key) => [key, models[key]]),
  );

  return {
    catalog: {
      source: 'openrouter.ai',
      endpoint: OPENROUTER_ENDPOINT,
      fetchedAt,
      generator: 'packages/ai/model-registry/scripts/sync-openrouter-catalog.mjs',
      notes:
        'Mechanically synced from the live OpenRouter models endpoint. Every id, name, ' +
        "context window, pricing figure and modality is read directly from the endpoint's " +
        'own response, never invented. qualityTier/quality are a mechanical heuristic bucketed ' +
        'on the published prompt price (<=$0.5/M fast, <=$5/M balanced, else best; a dynamically ' +
        'priced router route is bucketed balanced). speed is not published by the endpoint and ' +
        'is recorded as the neutral default "medium" for every entry. Entries already ' +
        'hand-curated in models.curation.json (matched by apiModelId or openRouterSlug) are ' +
        'skipped so this file never duplicates or shadows curated data; ' +
        'mergeOpenRouterSyncedCatalog folds the rest into the compiled catalog additively. ' +
        `${skippedRetiredCount} entr${skippedRetiredCount === 1 ? 'y was' : 'ies were'} skipped ` +
        'because its id or apiModelId exactly matches an entry in ' +
        'packages/ai/model-registry/catalog/retired-models.json (retiredModelIds or ' +
        `guardedNonCanonicalModelIds); ${skippedStaleGptCount} entr${skippedStaleGptCount === 1 ? 'y was' : 'ies were'} ` +
        'skipped because its id or apiModelId matches the gpt-<digit> pattern without already ' +
        'being a canonical GPT identifier in models.curation.json, mirroring the stale-GPT check ' +
        "in scripts/check-model-catalog-integrity.mjs; both are the guard's only supported " +
        'outcome for a banned id, since it scans catalog structures for id/apiModelId membership ' +
        'directly and carries no lifecycle-stage exemption. Re-run to refresh.',
      modelCount: includedCount,
      models: sortedModels,
    },
    stats: {
      fetchedCount: rawModels.length,
      includedCount,
      skippedCuratedCount,
      skippedRetiredCount,
      skippedStaleGptCount,
      freeCount,
    },
  };
}

async function main() {
  const { catalog, stats } = await buildSyncedCatalog();
  await writeJson(OUTPUT_JSON, catalog);
  process.stdout.write(
    `[sync-openrouter] fetched ${stats.fetchedCount} models from ${OPENROUTER_ENDPOINT}\n` +
      `[sync-openrouter] wrote ${stats.includedCount} entries to ${path.relative(process.cwd(), OUTPUT_JSON)} ` +
      `(${stats.freeCount} free variants, ${stats.skippedCuratedCount} skipped as already curated, ` +
      `${stats.skippedRetiredCount} skipped as retired/guarded, ` +
      `${stats.skippedStaleGptCount} skipped as a stale GPT identifier)\n`,
  );
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`[sync-openrouter] failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
