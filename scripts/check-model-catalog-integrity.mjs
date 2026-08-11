#!/usr/bin/env node
// check-model-catalog-integrity.mjs
//
// E7 / P1-CATALOG class-guard: the single source of truth for model IDs is
// packages/contracts/types/src/models.json. This guard fails if NON-TEST TypeScript
// shipping code OR hand-maintained doc files (.md/.mdx) reference a model ID
// that is NOT in the canonical catalog (i.e. a removed/ghost/drifted ID). It
// is the durable backstop for the recurring catalog-drift class tracked by the
// current model-registry tests and known-flaws ledger.
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
const CATALOG_OWNER_FILES = new Set([
  ...CATALOG_INPUTS,
  path.join(root, 'packages/platform/local-llm/src/catalog.ts'),
]);
const RETIRED_MODELS = JSON.parse(
  fs.readFileSync(
    path.join(root, 'packages/ai/model-registry/catalog/retired-models.json'),
    'utf8',
  ),
);

// Deprecated, removed, or unverified model IDs that must not appear in selectable
// catalog structures. Notes and canonicalization aliases may mention these IDs
// when documenting/migrating deprecations; provider defaults, task routes, tiers,
// presets, and model entries may not.
const REMOVED_SELECTABLE_MODEL_IDS = new Set([
  ...(RETIRED_MODELS.retiredModelIds ?? []),
  ...(RETIRED_MODELS.guardedNonCanonicalModelIds ?? []),
]);

// Confirmed-removed SELECTABLE model IDs that must not appear in live TS code as
// catalog entries, defaults, or selectable-model references.
// Source: the catalog-owned retired-model registry. OpenAI GPT identifiers are
// also checked generically against the canonical catalog below, so
// deleting a model cannot also delete the guard's knowledge of its spelling.
const DISALLOWED_SUBSTRING = [...REMOVED_SELECTABLE_MODEL_IDS];

// Numeric GPT identifiers that are not present in canonical metadata are stale
// by definition. This intentionally derives the allow-list from the catalog;
// there is no retired-model denylist to update when the provider roster moves.
const GPT_MODEL_ID_PATTERN = /\bgpt-[0-9][a-z0-9._-]*\b/gi;

const ID_CHAR = /[A-Za-z0-9._/-]/;
// True if `id` appears in `line` as a whole token (not part of a longer model id like
// provider model literals. Bounds: adjacent characters must NOT be id-chars.
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
const isTestFile = (f) => /\.(test|spec)\.[cm]?tsx?$/.test(f) || /\.stories\./.test(f);
const isTs = (f) => /\.[cm]?tsx?$/.test(f);
const isMd = (f) => /\.mdx?$/.test(f);
// Historical records are excluded from this legacy guard; the strict repository
// model-literal guard separately inventories comments, snapshots, and docs.
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

let canonicalCatalog;
try {
  canonicalCatalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
} catch (error) {
  console.error(
    `Model-catalog integrity check: failed to parse canonical catalog: ${error.message}`,
  );
  process.exit(1);
}

const canonicalGptIdentifiers = new Set();
function addCanonicalGptIdentifier(value) {
  if (typeof value === 'string' && /^gpt-[0-9]/i.test(value)) {
    canonicalGptIdentifiers.add(value.toLowerCase());
  }
}
for (const [id, model] of Object.entries(canonicalCatalog.models ?? {})) {
  addCanonicalGptIdentifier(id);
  addCanonicalGptIdentifier(model?.id);
  addCanonicalGptIdentifier(model?.apiModelId);
}
for (const provider of Object.values(canonicalCatalog.providers ?? {})) {
  addCanonicalGptIdentifier(provider?.defaultModel);
  for (const value of Object.values(provider?.taskRouting ?? {})) addCanonicalGptIdentifier(value);
  for (const [alias, target] of Object.entries(provider?.canonicalization ?? {})) {
    addCanonicalGptIdentifier(alias);
    addCanonicalGptIdentifier(target);
  }
}

function staleGptIdentifiers(value) {
  if (typeof value !== 'string') return [];
  return [...value.matchAll(GPT_MODEL_ID_PATTERN)]
    .map((match) => match[0])
    .filter((id) => !canonicalGptIdentifiers.has(id.toLowerCase()));
}

const catalogViolations = [];

function recordCatalogValue(file, pathLabel, value) {
  if (
    typeof value === 'string' &&
    (REMOVED_SELECTABLE_MODEL_IDS.has(value) || staleGptIdentifiers(value).length > 0)
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
    if (CATALOG_OWNER_FILES.has(file)) continue;
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const cheapHit =
      DISALLOWED_SUBSTRING.some((id) => containsToken(text, id)) || GPT_MODEL_ID_PATTERN.test(text);
    GPT_MODEL_ID_PATTERN.lastIndex = 0;
    if (!cheapHit) continue;
    const skipComment = kind === 'md' ? isMdCommentLine : isCommentLine;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (skipComment(lines[i])) continue;
      for (const id of DISALLOWED_SUBSTRING) {
        if (containsToken(lines[i], id)) {
          violations.push({
            file: path.relative(root, file),
            line: i + 1,
            id,
            text: lines[i].trim().slice(0, 120),
          });
        }
      }
      for (const id of staleGptIdentifiers(lines[i])) {
        if (containsToken(lines[i], id)) {
          violations.push({
            file: path.relative(root, file),
            line: i + 1,
            id,
            text: lines[i].trim().slice(0, 120),
          });
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error(
    'Model-catalog integrity check FAILED — removed/ghost model references in guarded source files:',
  );
  console.error(
    '(IDs must come from packages/contracts/types/src/models.json; retired GPT identifiers are detected without a static denylist.)\n',
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
