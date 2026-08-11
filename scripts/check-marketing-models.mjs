#!/usr/bin/env node
/**
 * AP-03 marketing model-ID drift gate (R27-PARITY Stage 3).
 *
 * Scans apps/web/{lib,components}/**\/*.{ts,tsx} files whose paths contain
 * "marketing", plus three named anchor files, for:
 *   1. Hardcoded model-ID strings that do not exist in packages/contracts/types/src/models.json
 *      ("phantom IDs") — EXIT 1 (blocking).
 *   2. Model IDs present in the catalog but not in the "marketing-safe" set
 *      (defaultModel + modelPresets per provider + all alias/canonical keys)
 *      — EXIT 0 with WARNs (advisory only, non-blocking).
 *
 * Regex scope is provider-neutral: model-shaped, versioned identifiers are
 * compared with the catalog. The repository-wide literal guard separately
 * covers versioned display names and retired family spellings.
 *
 * Exit codes:
 *   0  clean (or advisory-only warnings)
 *   1  phantom model IDs found (not in catalog)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../');
const MODELS_JSON = join(ROOT, 'packages/contracts/types/src/models.json');
const WEB_DIR = join(ROOT, 'apps/web');

// ─── 1. Build the valid ID set from models.json ───────────────────────────

const catalog = JSON.parse(readFileSync(MODELS_JSON, 'utf8'));

/**
 * Normalize a model ID for comparison by converting dashes between numeric
 * version segments to dots. This accepts equivalent provider spellings without
 * embedding a concrete model identifier in the guard.
 */
function normalize(id) {
  return id.replace(/(?<=\d)-(?=\d)/g, '.');
}

// All IDs that are known to the catalog for public/marketing copy. Legacy
// canonicalization aliases are intentionally excluded: they are accepted only
// as backend migration inputs, never as current public model names.
const validIdsRaw = new Set();

// models section (primary definitions and provider wire identifiers)
for (const [key, model] of Object.entries(catalog.models ?? {})) {
  validIdsRaw.add(key);
  if (model.apiModelId) validIdsRaw.add(model.apiModelId);
}

// providers: defaultModel, taskRouting values, canonicalization targets
for (const provider of Object.values(catalog.providers ?? {})) {
  if (provider.defaultModel) validIdsRaw.add(provider.defaultModel);
  for (const mid of Object.values(provider.taskRouting ?? {})) validIdsRaw.add(mid);
  for (const canonical of Object.values(provider.canonicalization ?? {})) {
    validIdsRaw.add(canonical);
  }
}

// modelPresets values
for (const presets of Object.values(catalog.modelPresets ?? {})) {
  for (const p of presets) {
    if (p.value) validIdsRaw.add(p.value);
  }
}

// Build normalized lookup (both raw and normalized forms accepted).
const validNormalized = new Set([...validIdsRaw].map(normalize));

// "Marketing-safe" set: provider defaultModels + modelPreset values — the
// IDs that are current and recommended. Everything else in the catalog is
// valid but advisory if found in marketing copy.
const marketingSafeRaw = new Set();
for (const provider of Object.values(catalog.providers ?? {})) {
  if (provider.defaultModel) marketingSafeRaw.add(provider.defaultModel);
}
for (const presets of Object.values(catalog.modelPresets ?? {})) {
  for (const p of presets) {
    if (p.value) marketingSafeRaw.add(p.value);
  }
}
const marketingSafeNormalized = new Set([...marketingSafeRaw].map(normalize));
const modelFamilyPrefixes = [...validIdsRaw]
  .map((id) => id.toLowerCase().match(/^(.+?)(?=\d)/)?.[1])
  .filter(Boolean);

// ─── 2. Collect target files ───────────────────────────────────────────────

const ANCHOR_FILES = [
  join(WEB_DIR, 'lib/marketing-constants.ts'),
  join(WEB_DIR, 'shared/components/agi/AgiChatDemo.tsx'),
];

function walkDir(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === 'dist') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkDir(full, files);
    } else if (
      (full.endsWith('.ts') || full.endsWith('.tsx')) &&
      relative(ROOT, full).includes('marketing')
    ) {
      files.push(full);
    }
  }
  return files;
}

const marketingPathFiles = walkDir(join(WEB_DIR, 'lib')).concat(
  walkDir(join(WEB_DIR, 'features/marketing')),
);

// Union: anchors + marketing-path files, deduplicated
const targetFiles = [...new Set([...ANCHOR_FILES, ...marketingPathFiles])];

// ─── 3. Regex patterns (versioned only — require at least one separator+digit) ──

const MODEL_REGEXES = [
  /\b[a-z][a-z0-9]*(?:[-./][a-z0-9]+)*[-./][0-9][a-z0-9]*(?:[-./][a-z0-9]+)*\b/gi,
];

// ─── 4. Scan ──────────────────────────────────────────────────────────────

let phantomCount = 0;
let staleCount = 0;

for (const file of targetFiles) {
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    console.warn(`  SKIP (unreadable): ${relative(ROOT, file)}`);
    continue;
  }

  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const rel = relative(ROOT, file);

    // Skip lines inside block comments or single-line comments that are
    // obviously documentation (not code that would feed a model selector).
    const trimmed = line.trimStart();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      return;
    }

    // --- Check regex-matched model IDs ---
    for (const re of MODEL_REGEXES) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        const raw = m[0];
        const norm = normalize(raw);
        if (!modelFamilyPrefixes.some((prefix) => raw.toLowerCase().startsWith(prefix))) continue;

        if (!validNormalized.has(norm)) {
          console.error(`  PHANTOM  ${rel}:${lineNum}  "${raw}"  (not in models.json catalog)`);
          phantomCount++;
        } else if (!marketingSafeNormalized.has(norm)) {
          console.warn(
            `  WARN     ${rel}:${lineNum}  "${raw}"  (in catalog but not a current default/preset — may be stale)`,
          );
          staleCount++;
        }
      }
    }
  });
}

// ─── 5. Report ────────────────────────────────────────────────────────────

console.log('');
console.log(`Scanned ${targetFiles.length} file(s).`);

if (phantomCount > 0) {
  console.error(
    `FAIL: ${phantomCount} phantom model ID(s) found. Update marketing-constants.ts or the source file to use IDs from packages/contracts/types/src/models.json.`,
  );
  process.exit(1);
}

if (staleCount > 0) {
  console.warn(
    `ADVISORY: ${staleCount} model ID(s) exist in catalog but are not current provider defaults or presets. Review if marketing copy is up to date.`,
  );
}

console.log('marketing-models check passed.');
process.exit(0);
