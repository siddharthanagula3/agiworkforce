#!/usr/bin/env node
// check-model-catalog-integrity.mjs
//
// E7 / P1-CATALOG class-guard: the single source of truth for model IDs is
// packages/contracts/types/src/models.json. This guard fails if NON-TEST TypeScript
// shipping code OR hand-maintained doc files (.md/.mdx) reference a model ID
// that is NOT in the canonical catalog (i.e. a removed/ghost/drifted ID). It
// is the durable backstop for the recurring catalog-drift class tracked by the
// current model-registry tests and known-flaws ledger.
// The specifically retired Opus predecessor is stricter: it is forbidden across
// source, tests, docs, and generated compatibility artifacts in every supported
// spelling, per the founder's latest-family-only policy.
//
// Scope:
//   - .ts/.tsx under apps/ packages/ services/ (excluding tests, specs,
//     __tests__, dist, node_modules, .next, _archive). Comment lines (JSDoc///)
//     are skipped — doc examples are hygiene, not live behavior.
//   - .md/.mdx under apps/ packages/ services/ (same exclusions). HTML comment
//     lines (<!-- ... -->) are skipped for markdown files.
//
// The Rust catalog reads models.json via include_str!, so Rust drift is covered
// by `cargo test` + the Rust ghost-model tests; this guard targets the
// hand-maintained TS and doc sites.
//
// Extend DISALLOWED when curating models.json (remove an ID -> add it here).

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const CATALOG = path.join(root, 'packages/contracts/types/src/models.json');
const CATALOG_INPUTS = [
  CATALOG,
  path.join(root, 'packages/ai/model-registry/catalog/models.curation.json'),
  path.join(root, 'packages/ai/model-registry/catalog/models.synced.json'),
];

// Founder policy keeps only the latest Opus generation selectable. Match the
// retired family generically so the next old spelling cannot bypass a static
// denylist (`claude-opus-4.x`, `claude-opus-4-x`, `opus_4_x`, display labels,
// and the older `claude-3-opus` ordering are all covered).
const RETIRED_OPUS_ID_PATTERN =
  /\b(?:claude-3-opus(?:-[0-9]{8})?|claude-opus-(?:3|4)(?:[.-]\d+)?(?:-[0-9]{8})?)\b/i;
const RETIRED_OPUS_LABEL_PATTERNS = [
  /\b(?:claude[\s._-]+)?opus[\s._-]+(?:3|4)(?:[\s._-]+\d+)?\b/i,
  /\bclaude[\s._-]+(?:3|4)(?:[\s._-]+\d+)?[\s._-]+opus\b/i,
];
const REMOVED_OPUS_PREDECESSOR_PATTERNS = [
  /\b(?:claude[\s._-]+)?opus[\s._-]*4[\s._-]+8\b/i,
  /\bclaude[\s._-]+4[\s._-]+8[\s._-]+opus\b/i,
];

// Deprecated, removed, or unverified model IDs that must not appear in selectable
// catalog structures. Notes and canonicalization aliases may mention these IDs
// when documenting/migrating deprecations; provider defaults, task routes, tiers,
// presets, and model entries may not.
const REMOVED_SELECTABLE_MODEL_IDS = new Set([
  'claude-opus-4.6',
  'claude-opus-4-6',
  'claude-opus-4.7',
  'claude-opus-4-7',
  'claude-opus-4-6-mini',
  'gemini-3-flash-preview',
  'gemini-3-pro-preview',
  'glm-4.7',
  'gpt-5-codex',
  'gpt-5-nano',
  'gpt-5-pro',
  'gpt-5-pro-2026-01',
  'gpt-5.4',
  'gpt-5.4-codex',
  'gpt-5.4-codex-low',
  'gpt-5.4-codex-medium',
  'gpt-5.4-codex-high',
  'gpt-5.4-codex-xhigh',
  'gpt-5.4-pro',
  'grok-4-1-fast',
  'grok-4-1-fast-reasoning',
  'grok-4-1-fast-non-reasoning',
  'sora-2',
  'sora-2-pro',
  'sora-2-2025-10-06',
  'sora-2-2025-12-08',
  'sora-2-pro-2025-10-06',
  // 2026-07-22 curation: retired Qwen/Mistral/Groq/NVIDIA-NIM/OpenRouter roster
  // and renamed gemini-3.5-flash -> gemini-3.6-flash. These IDs may still appear
  // as canonicalization aliases (keys) but must not be selectable anywhere.
  'qwen-turbo',
  'qwen-max',
  'qwen-coder-flash',
  'qwen-coder-plus',
  'mistral-large-3',
  'mistral-medium-3.5',
  'mistral-small-4',
  'codestral-2508',
  'groq-llama-3.1-8b',
  'groq-llama-3.3-70b',
  'nvidia/llama-3.3-70b-instruct',
  'nvidia/nemotron-3-nano-30b-a3b',
  'nvidia/nemotron-3-super-120b-a12b',
  'nvidia/nemotron-3-ultra-550b-a55b',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'google/gemma-4-26b-a4b-it:free',
  'gemini-3.5-flash',
]);

// Confirmed-removed SELECTABLE model IDs that must not appear in live TS code as
// catalog entries, defaults, or selectable-model references.
// Source: model curation (older Opus generations -> Opus 5; retired GPT-5.4
// flagship/pro/codex IDs; GPT-5.4 Mini remains a current Free-tier exception).
//
// SCOPE NOTE: this guard deliberately does NOT police `o3` or `gpt-image-1.x`.
// Those can appear in legitimate provider-API/reasoning-detection code even
// when they are not user-selectable catalog entries.
//
// SUBSTRING list: ids that are NEVER a substring of a VALID catalog id -> plain match.
const DISALLOWED_SUBSTRING = [
  'claude-opus-4.6',
  'claude-opus-4-6',
  'claude-opus-4.7',
  'claude-opus-4-7',
  'claude-opus-4-6-mini',
  'gpt-5.4-codex',
  'gpt-5.4-pro',
  'gpt-5-nano',
];
// TOKEN list: removed ids that ARE a prefix of a VALID id (bare `gpt-5.4` vs the valid
// `gpt-5.4-mini`) -> match ONLY as a whole token (bounded by non-id chars).
const DISALLOWED_TOKEN = ['gpt-5.4'];

const ID_CHAR = /[A-Za-z0-9._/-]/;
// True if `id` appears in `line` as a whole token (not part of a longer model id like
// gpt-5.4-mini). Bounds: the chars immediately before/after must NOT be id-chars.
function containsToken(line, id) {
  let from = 0;
  for (;;) {
    const idx = line.indexOf(id, from);
    if (idx === -1) return false;
    const before = idx > 0 ? line[idx - 1] : '';
    const after = idx + id.length < line.length ? line[idx + id.length] : '';
    if ((before === '' || !ID_CHAR.test(before)) && (after === '' || !ID_CHAR.test(after))) {
      return true;
    }
    from = idx + 1;
  }
}

const SCAN_ROOTS = ['apps', 'packages', 'services'];
const SKIP_DIR = new Set([
  'node_modules',
  'dist',
  'dist-web',
  '.next',
  'build',
  'target',
  'coverage',
  '__tests__',
  '__mocks__',
  'tests',
  'test',
  'e2e',
  '_archive',
  '.turbo',
  '.cache',
]);
const RETIREMENT_SKIP_DIR = new Set([
  'node_modules',
  'dist',
  'dist-web',
  '.next',
  'build',
  'target',
  'coverage',
  '.turbo',
  '.cache',
]);
const isTestFile = (f) => /\.(test|spec)\.[cm]?tsx?$/.test(f) || /\.stories\./.test(f);
const isTs = (f) => /\.[cm]?tsx?$/.test(f);
const isMd = (f) => /\.mdx?$/.test(f);
// Historical records (changelogs, release notes) legitimately reference removed IDs
// when documenting their removal ("was gpt-5.4", "no longer pins gpt-5.4"). Scanning
// them is a false positive — the guard targets docs that present CURRENT usage.
const isHistoricalDoc = (f) => /^(CHANGELOG|HISTORY|RELEASES?|CHANGES)([.-]|$)/i.test(f);

function* walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.well-known') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name)) continue;
      yield* walk(full);
    } else if (e.isFile() && isTs(e.name) && !isTestFile(e.name)) {
      yield { file: full, kind: 'ts' };
    } else if (e.isFile() && isMd(e.name) && !isHistoricalDoc(e.name)) {
      yield { file: full, kind: 'md' };
    }
  }
}

// The founder explicitly requires the immediately retired Opus predecessor to
// be absent from the entire source tree — including tests, historical docs,
// generated compatibility artifacts, and non-TypeScript consumers.
function* walkRetirementSources(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.well-known') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (RETIREMENT_SKIP_DIR.has(e.name)) continue;
      yield* walkRetirementSources(full);
    } else if (e.isFile() && /\.(?:mdx?|[cm]?[jt]sx?|rs|json|ya?ml|py|sh)$/.test(e.name)) {
      yield full;
    }
  }
}

// Skip comment lines in TypeScript/TSX (JSDoc examples are not live behavior).
function isCommentLine(line) {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('*/');
}

// Skip HTML comment lines in Markdown (<!-- ... -->).
function isMdCommentLine(line) {
  const t = line.trim();
  return t.startsWith('<!--');
}

if (!fs.existsSync(CATALOG)) {
  console.error(`Model-catalog integrity check: missing canonical catalog at ${CATALOG}`);
  process.exit(1);
}

const catalogViolations = [];

function recordCatalogValue(file, pathLabel, value) {
  if (
    typeof value === 'string' &&
    (REMOVED_SELECTABLE_MODEL_IDS.has(value) || RETIRED_OPUS_ID_PATTERN.test(value))
  ) {
    catalogViolations.push({
      file: path.relative(root, file),
      path: pathLabel,
      id: value,
    });
  }
}

for (const file of CATALOG_INPUTS) {
  if (!fs.existsSync(file)) continue;
  const rel = path.relative(root, file);
  let catalog;
  try {
    catalog = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`Model-catalog integrity check: failed to parse ${rel}: ${error.message}`);
    process.exit(1);
  }

  for (const [id, model] of Object.entries(catalog.models ?? {})) {
    recordCatalogValue(file, `models.${id}`, id);
    recordCatalogValue(file, `models.${id}.id`, model?.id);
    recordCatalogValue(file, `models.${id}.apiModelId`, model?.apiModelId);
  }

  for (const [providerId, provider] of Object.entries(catalog.providers ?? {})) {
    recordCatalogValue(file, `providers.${providerId}.defaultModel`, provider?.defaultModel);
    for (const [task, modelId] of Object.entries(provider?.taskRouting ?? {})) {
      recordCatalogValue(file, `providers.${providerId}.taskRouting.${task}`, modelId);
    }
    for (const [alias, target] of Object.entries(provider?.canonicalization ?? {})) {
      // Canonicalization keys are non-selectable legacy inputs used to migrate
      // previous chats/config forward. Only the target must be a current,
      // selectable-safe ID.
      recordCatalogValue(file, `providers.${providerId}.canonicalization.${alias}`, target);
    }
  }

  for (const [tier, modelIds] of Object.entries(catalog.tierAllowedModels ?? {})) {
    if (!Array.isArray(modelIds)) continue;
    for (const modelId of modelIds) recordCatalogValue(file, `tierAllowedModels.${tier}`, modelId);
  }

  for (const [providerId, presets] of Object.entries(catalog.modelPresets ?? {})) {
    if (!Array.isArray(presets)) continue;
    for (const preset of presets) {
      recordCatalogValue(file, `modelPresets.${providerId}`, preset?.value);
    }
  }
}

if (catalogViolations.length > 0) {
  console.error(
    'Model-catalog integrity check FAILED — deprecated/removed IDs in selectable catalog structures:\n',
  );
  for (const v of catalogViolations) {
    console.error(`- ${v.file}  ${v.path}  [${v.id}]`);
  }
  console.error(`\n${catalogViolations.length} catalog violation(s).`);
  process.exit(1);
}

const violations = [];
for (const scanRoot of SCAN_ROOTS) {
  for (const { file, kind } of walk(path.join(root, scanRoot))) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const cheapHit =
      DISALLOWED_SUBSTRING.some((id) => text.includes(id)) ||
      DISALLOWED_TOKEN.some((id) => text.includes(id)) ||
      (kind === 'ts' && RETIRED_OPUS_LABEL_PATTERNS.some((pattern) => pattern.test(text)));
    if (!cheapHit) continue;
    const skipComment = kind === 'md' ? isMdCommentLine : isCommentLine;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (skipComment(lines[i])) continue;
      for (const id of DISALLOWED_SUBSTRING) {
        if (lines[i].includes(id)) {
          violations.push({
            file: path.relative(root, file),
            line: i + 1,
            id,
            text: lines[i].trim().slice(0, 120),
          });
        }
      }
      for (const id of DISALLOWED_TOKEN) {
        if (containsToken(lines[i], id)) {
          violations.push({
            file: path.relative(root, file),
            line: i + 1,
            id,
            text: lines[i].trim().slice(0, 120),
          });
        }
      }
      if (kind === 'ts') {
        for (const pattern of RETIRED_OPUS_LABEL_PATTERNS) {
          const match = lines[i].match(pattern);
          if (match) {
            violations.push({
              file: path.relative(root, file),
              line: i + 1,
              id: match[0],
              text: lines[i].trim().slice(0, 120),
            });
          }
        }
      }
    }
  }
}

for (const file of walkRetirementSources(root)) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (!REMOVED_OPUS_PREDECESSOR_PATTERNS.some((pattern) => pattern.test(text))) continue;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const pattern of REMOVED_OPUS_PREDECESSOR_PATTERNS) {
      const match = lines[i].match(pattern);
      if (match) {
        violations.push({
          file: path.relative(root, file),
          line: i + 1,
          id: match[0],
          text: lines[i].trim().slice(0, 120),
        });
      }
    }
  }
}

if (violations.length > 0) {
  console.error(
    'Model-catalog integrity check FAILED — removed/ghost model references in guarded source files:',
  );
  console.error(
    '(IDs must come from packages/contracts/types/src/models.json — fix the site or update DISALLOWED if the ID was re-added.)\n',
  );
  for (const v of violations) {
    console.error(`- ${v.file}:${v.line}  [${v.id}]  ${v.text}`);
  }
  console.error(`\n${violations.length} violation(s).`);
  process.exit(1);
}

console.log(
  'Model-catalog integrity check passed (no removed/ghost model references in guarded source files).',
);
