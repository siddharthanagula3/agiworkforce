#!/usr/bin/env node
/**
 * sync-models.mjs — single-source-of-truth generator for the model catalog.
 *
 * The model catalog (`packages/types/src/models.json`) is a GENERATED, committed
 * artifact assembled from two committed inputs:
 *
 *   - `models.curation.json` — the ONLY hand-edited file. Per model it carries
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
 *   - `models.synced.json` — a committed snapshot of UPSTREAM-derived fields
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

import prettier from 'prettier';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const TYPES_DIR = path.join(ROOT, 'packages', 'types', 'src');
const MODELS_JSON = path.join(TYPES_DIR, 'models.json');
const CURATION_JSON = path.join(TYPES_DIR, 'models.curation.json');
const SYNCED_JSON = path.join(TYPES_DIR, 'models.synced.json');

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
  'capabilities',
  'benchmarks',
  'speed',
  'released',
];

// Curation override keys → which synced field they replace.
const OVERRIDE_KEYS = [
  'costOverride', // { inputCost?, outputCost?, cached_input?, cached_write? }
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
  'variantPartner',
  'contextWindow',
  'inputCost',
  'outputCost',
  'cached_input',
  'cached_write',
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
 * data. Providers absent from this map (managed_cloud pseudo-models, nvidia_nim
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
      const cost = pick(syncedPart, ['inputCost', 'outputCost', 'cached_input', 'cached_write']);
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
    models[id] = orderKeys(merged);
  }
  const catalog = {};
  for (const key of TOP_LEVEL_ORDER) {
    catalog[key] = key === 'models' ? models : curation[key];
  }
  return catalog;
}

async function generate() {
  const curation = readJson(CURATION_JSON);
  const synced = readJson(SYNCED_JSON);
  const catalog = buildCatalog(curation, synced);
  await writeJson(MODELS_JSON, catalog);
  console.log(`[sync] generate → ${Object.keys(catalog.models).length} models written`);
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
