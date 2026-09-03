#!/usr/bin/env node
/* global fetch, AbortSignal */

import console from 'node:console';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { loadFamilyCatalog, resolveFamilyRefsDeep } from './families.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(SCRIPT_DIR, '..');
const CATALOG_DIR = path.join(PACKAGE_ROOT, 'catalog');
const CURATION_JSON = path.join(CATALOG_DIR, 'models.curation.json');
const REGISTRY_JSON = path.join(PACKAGE_ROOT, 'generated', 'registry.json');

const LITELLM_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const FETCH_TIMEOUT_MS = 20_000;
const DEFAULT_THRESHOLD = 0.05;
const PER_MILLION = 1_000_000;
const LOG = '[pricing-drift]';

const PRICING = 'pricing';
const LIMITS = 'limits';

const FIELD_MAP = [
  {
    ours: 'inputPerMillion',
    theirs: [
      'input_cost_per_token',
      'input_cost_per_image_token',
      'input_cost_per_audio_token',
      'input_cost_per_video_token',
    ],
    scale: PER_MILLION,
    group: PRICING,
  },
  {
    ours: 'outputPerMillion',
    theirs: [
      'output_cost_per_token',
      'output_cost_per_image_token',
      'output_cost_per_audio_token',
      'output_cost_per_video_token',
      'output_cost_per_reasoning_token',
    ],
    scale: PER_MILLION,
    group: PRICING,
  },
  {
    ours: 'cacheReadPerMillion',
    theirs: ['cache_read_input_token_cost', 'input_cost_per_token_cache_hit'],
    scale: PER_MILLION,
    group: PRICING,
  },
  {
    ours: 'cacheWritePerMillion',
    theirs: ['cache_creation_input_token_cost'],
    scale: PER_MILLION,
    group: PRICING,
  },
  {
    ours: 'cacheWrite1hPerMillion',
    theirs: ['cache_creation_input_token_cost_above_1hr'],
    scale: PER_MILLION,
    group: PRICING,
  },
  { ours: 'maxOutputTokens', theirs: ['max_output_tokens'], scale: 1, group: LIMITS },
];

const INPUT_BUDGET_FIELD = 'inputBudget';
const UPSTREAM_INPUT_BUDGET_FIELD = 'max_input_tokens';

const NON_TOKEN_BILLED_MODES = new Set(['video_generation']);

const FIRST_PARTY = {
  anthropic: ['anthropic'],
  openai: ['openai'],
  google: ['gemini', 'vertex_ai-language-models'],
  xai: ['xai'],
  deepseek: ['deepseek'],
  groq: ['groq'],
  moonshot: ['moonshot'],
  qwen: ['dashscope', 'qwen'],
  zhipu: ['zhipu'],
  minimax: ['minimax'],
  perplexity: ['perplexity'],
  runway: ['runway'],
  open_router: ['openrouter'],
};

const COUNTED_FIELD_SUFFIX = 'Tokens';

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

function argValue(args, flag) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

async function loadUpstream(snapshot) {
  if (snapshot) {
    console.error(`${LOG} reading upstream snapshot ${snapshot}`);
    return readJson(snapshot);
  }
  console.error(`${LOG} fetching ${LITELLM_URL}`);
  const response = await fetch(LITELLM_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`litellm returned HTTP ${response.status}`);
  return response.json();
}

function indexUpstream(upstream) {
  const index = new Map();
  for (const [key, entry] of Object.entries(upstream)) {
    if (!entry || typeof entry !== 'object' || !entry.litellm_provider) continue;
    const bare = key.includes('/') ? key.slice(key.lastIndexOf('/') + 1) : key;
    for (const spelling of new Set([key, bare])) {
      index.set(`${entry.litellm_provider}::${spelling}`, { key, entry });
    }
  }
  return index;
}

function findUpstream(index, provider, modelIds) {
  for (const litellmProvider of FIRST_PARTY[provider] ?? []) {
    for (const id of modelIds) {
      const hit = index.get(`${litellmProvider}::${id}`);
      if (hit) return hit;
    }
  }
  return null;
}

function relativeDrift(ours, theirs) {
  if (ours === theirs) return 0;
  const denominator = Math.max(Math.abs(ours), Math.abs(theirs));
  return denominator === 0 ? 0 : Math.abs(ours - theirs) / denominator;
}

function inputBudgetCandidates(limits) {
  const options = [];
  if (limits.maxInputTokens !== undefined) {
    options.push({ label: 'maxInputTokens', value: limits.maxInputTokens });
  }
  if (limits.contextTokens !== undefined) {
    options.push({ label: 'contextTokens', value: limits.contextTokens });
    if (limits.maxOutputTokens !== undefined) {
      options.push({
        label: 'contextTokens - maxOutputTokens',
        value: limits.contextTokens - limits.maxOutputTokens,
      });
    }
  }
  return options;
}

function closest(options, target) {
  return options
    .map((option) => ({ ...option, drift: relativeDrift(option.value, target) }))
    .sort((a, b) => a.drift - b.drift)[0];
}

function readCuration() {
  const curation = readJson(CURATION_JSON);
  const notes = new Map();
  for (const [key, model] of Object.entries(curation.models ?? {})) {
    if (model?.pricingNote) notes.set(key, model.pricingNote);
  }
  const providers = resolveFamilyRefsDeep(curation.providers ?? {}, loadFamilyCatalog(CATALOG_DIR));
  const pinned = new Set();
  for (const provider of Object.values(providers)) {
    if (provider?.defaultModel) pinned.add(provider.defaultModel);
  }
  return { notes, pinned };
}

function compareInputBudget(entry, limits, threshold) {
  const upstreamBudget = entry[UPSTREAM_INPUT_BUDGET_FIELD];
  if (upstreamBudget === undefined) return null;
  const options = inputBudgetCandidates(limits);
  if (options.length === 0) {
    return { field: INPUT_BUDGET_FIELD, kind: 'missing-ours', theirs: upstreamBudget };
  }
  const best = closest(options, upstreamBudget);
  if (best.drift <= threshold) return null;
  return {
    field: INPUT_BUDGET_FIELD,
    kind: 'drift',
    ours: best.value,
    theirs: upstreamBudget,
    theirsField: `${UPSTREAM_INPUT_BUDGET_FIELD} vs our ${best.label}`,
    drift: best.drift,
  };
}

function compareField(field, entry, ourPricing, ourLimits, threshold, isPinned) {
  const ours = (field.group === PRICING ? ourPricing : ourLimits)[field.ours];
  const candidates = field.theirs
    .filter((name) => entry[name] !== undefined)
    .map((name) => ({ name, value: entry[name] * field.scale }));

  if (ours === undefined && candidates.length > 0) {
    return { field: field.ours, kind: 'missing-ours', theirs: candidates[0].value };
  }
  if (ours !== undefined && candidates.length === 0) {
    return { field: field.ours, kind: 'missing-theirs', ours };
  }
  if (ours === undefined) return null;

  const best = closest(candidates, ours);
  if (best.drift <= threshold) return null;
  return {
    field: field.ours,
    kind: isPinned && ours >= best.value ? 'policy-pinned' : 'drift',
    ours,
    theirs: best.value,
    theirsField: best.name,
    drift: best.drift,
  };
}

function compare(registry, upstream, threshold, curation) {
  const index = indexUpstream(upstream);
  const matched = [];
  const unmatched = [];

  for (const [key, model] of Object.entries(registry.models)) {
    const identity = model.identity ?? {};
    const candidates = [identity.providerModelId, identity.key, key].filter(Boolean);
    const hit = findUpstream(index, identity.provider, candidates);

    if (!hit) {
      unmatched.push({ key, provider: identity.provider });
      continue;
    }

    if (NON_TOKEN_BILLED_MODES.has(hit.entry.mode)) {
      matched.push({
        key,
        upstreamKey: hit.key,
        findings: [],
        skipped: `upstream mode ${hit.entry.mode} does not bill per token`,
      });
      continue;
    }

    const ourPricing = registry.pricing?.[key] ?? {};
    const ourLimits = registry.limits?.[key] ?? {};
    const isPinned = curation.pinned.has(key);
    const findings = [];

    const budget = compareInputBudget(hit.entry, ourLimits, threshold);
    if (budget) findings.push(budget);

    for (const field of FIELD_MAP) {
      const finding = compareField(field, hit.entry, ourPricing, ourLimits, threshold, isPinned);
      if (finding) findings.push(finding);
    }

    matched.push({ key, upstreamKey: hit.key, findings, note: curation.notes.get(key) });
  }

  return { matched, unmatched };
}

const percent = (value) => `${(value * 100).toFixed(1)}%`;
const usd = (value) => `$${Number(value.toFixed(4))}`;
const isCounted = (field) => field.endsWith(COUNTED_FIELD_SUFFIX) || field === INPUT_BUDGET_FIELD;
const amount = (field, value) =>
  isCounted(field) ? `${value.toLocaleString('en-US')} tokens` : `${usd(value)}/Mtok`;

function reportDrift(rows) {
  console.log(`VERIFY AGAINST THE PROVIDER'S OWN PRICING PAGE (${rows.length} model(s))`);
  console.log(
    '  litellm is a third-party snapshot. Neither side is presumed right, open the\n' +
      "  provider's page, decide there, and record the date in the row's pricingNote.",
  );
  for (const row of rows) {
    console.log(`  ${row.key}  (upstream key: ${row.upstreamKey})`);
    if (row.note) console.log(`    note: ${row.note}`);
    for (const finding of row.findings.filter((entry) => entry.kind === 'drift')) {
      const via = finding.theirsField === finding.field ? '' : `  [${finding.theirsField}]`;
      console.log(
        `    ${finding.field.padEnd(24)} ours ${amount(finding.field, finding.ours).padEnd(20)}` +
          ` upstream ${amount(finding.field, finding.theirs).padEnd(20)}` +
          ` (${percent(finding.drift)})${via}`,
      );
    }
  }
  console.log('');
}

function reportPinned(rows) {
  console.log(`POLICY-PINNED, EXPECTED DIVERGENCE (${rows.length} model(s)), no action`);
  console.log(
    '  A default route priced at or above the provider list price is the policy working.',
  );
  for (const row of rows) {
    const fields = row.findings
      .filter((finding) => finding.kind === 'policy-pinned')
      .map((finding) => `${finding.field} ours ${usd(finding.ours)} vs ${usd(finding.theirs)}`);
    console.log(`  ${row.key}: ${fields.join('; ')}`);
  }
  console.log('');
}

function reportSkipped(rows) {
  console.log(`NOT TOKEN-BILLED UPSTREAM (${rows.length} model(s)), not compared`);
  for (const row of rows) console.log(`  ${row.key}: ${row.skipped}`);
  console.log('');
}

function reportGaps(rows) {
  console.log(`COVERAGE GAPS (${rows.length} model(s)), one side silent, not a contradiction`);
  for (const row of rows) {
    const ours = row.findings.filter((f) => f.kind === 'missing-ours').map((f) => f.field);
    const theirs = row.findings.filter((f) => f.kind === 'missing-theirs').map((f) => f.field);
    if (ours.length) console.log(`  ${row.key}: absent here, priced upstream → ${ours.join(', ')}`);
    if (theirs.length) {
      console.log(`  ${row.key}: priced here, absent upstream → ${theirs.join(', ')}`);
    }
  }
  console.log('');
}

function reportUnmatched(rows) {
  console.log(`NOT IN UPSTREAM (${rows.length} model(s)), expected for pre-release ids`);
  for (const row of rows) console.log(`  ${row.key} (${row.provider})`);
  console.log('');
}

function report(registry, upstream, threshold, result) {
  const { matched, unmatched } = result;
  const withKind = (kind) => matched.filter((row) => row.findings.some((f) => f.kind === kind));
  const drifted = withKind('drift');
  const pinned = withKind('policy-pinned');
  const skipped = matched.filter((row) => row.skipped);
  const gaps = matched.filter((row) =>
    row.findings.some((f) => f.kind === 'missing-ours' || f.kind === 'missing-theirs'),
  );

  console.log('');
  console.log(`${LOG} registry ${Object.keys(registry.models).length} model(s)`);
  console.log(`${LOG} upstream ${Object.keys(upstream).length} entries`);
  console.log(`${LOG} matched ${matched.length}, unmatched ${unmatched.length}`);
  console.log(`${LOG} threshold ${percent(threshold)}`);
  console.log('');

  if (drifted.length) reportDrift(drifted);
  if (pinned.length) reportPinned(pinned);
  if (skipped.length) reportSkipped(skipped);
  if (gaps.length) reportGaps(gaps);
  if (unmatched.length) reportUnmatched(unmatched);

  console.log(
    drifted.length
      ? `${LOG} ${drifted.length} model(s) to verify against provider pricing pages.`
      : `${LOG} ✓ nothing above ${percent(threshold)} outside policy-pinned routes.`,
  );
  return drifted.length;
}

async function main() {
  const args = process.argv.slice(2);
  const thresholdArg = argValue(args, '--threshold');
  const threshold = thresholdArg === undefined ? DEFAULT_THRESHOLD : Number(thresholdArg);
  const registry = readJson(REGISTRY_JSON);
  const upstream = await loadUpstream(argValue(args, '--snapshot'));
  const curation = readCuration();
  const result = compare(registry, upstream, threshold, curation);

  if (args.includes('--json')) {
    console.log(JSON.stringify({ threshold, ...result }, null, 2));
    return;
  }

  const drifted = report(registry, upstream, threshold, result);
  if (args.includes('--strict') && drifted > 0) process.exitCode = 1;
}

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isEntrypoint) {
  main().catch((error) => {
    console.error(`${LOG} fatal:`, error.message);
    process.exitCode = 2;
  });
}
