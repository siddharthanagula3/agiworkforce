#!/usr/bin/env node
/**
 * AP-09: Lock-vs-build drift detection
 *
 * Reads lock files from the user's Claude memory locks directory, extracts any
 * model ID or version references, and compares them against:
 *   - packages/contracts/types/src/models.json  (canonical model catalog)
 *   - apps/desktop/src-tauri/Cargo.toml  (binary version)
 *
 * Exit 0 = aligned (or locks dir absent — skips gracefully in CI)
 * Exit 2 = drift warnings found (non-blocking; informational only)
 *
 * NOTE: Lock files live in ~/.claude/projects/.../memory/locks/ (user home,
 * outside the repo). CI runners will not have this directory; the script exits 0
 * (skip) when the directory is absent. Run locally to audit drift.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../');
const MODELS_JSON = resolve(ROOT, 'packages/contracts/types/src/models.json');
const CARGO_TOML = resolve(ROOT, 'apps/desktop/src-tauri/Cargo.toml');

// Where Claude memory locks live (user home — not in repo)
const LOCKS_DIR = join(
  homedir(),
  '.claude/projects/-Users-siddhartha-Desktop-agiworkforce/memory/locks',
);

// Regex patterns for model ID references in lock markdown.
// Greedy suffix so we capture the full ID (e.g. gemini-3.5-flash-lite, not just gemini-3.1).
// The negative lookahead (?!-\w) prevents partial-version captures: we want the longest match.
// sonar model IDs are short: sonar, sonar-pro, sonar-reasoning, sonar-deep-research.
// Exclude sonar-[word]-[word] patterns that look like ESLint rule names (e.g. sonar-naming-convention).
const MODEL_ID_RE =
  /\b(claude-[\w.-]+-[\d.]+[\w-]*|gpt-[\d.]+[\w.-]*|gemini-[\d.]+[\w.-]*|deepseek-[\w.-]+-[\w.-]+|qwen[\w.-]+-[\w.-]+|grok-[\d.]+[\w.-]*|kimi-[\w.]+-[\d.]+[\w-]*|mistral-[\w.]+-[\d]+[\w-]*|glm-[\d.]+[\w.-]*|sonar(?:-(?:pro|reasoning(?:-pro)?|deep-research))?)\b/g;

function readModelsJson() {
  if (!existsSync(MODELS_JSON)) return new Set();
  const raw = JSON.parse(readFileSync(MODELS_JSON, 'utf8'));
  const ids = new Set(Object.keys(raw.models || {}));
  // Also collect defaultModel values from providers
  for (const p of Object.values(raw.providers || {})) {
    if (p.defaultModel) ids.add(p.defaultModel);
    for (const v of Object.values(p.taskRouting || {})) ids.add(v);
  }
  return ids;
}

function readCargoVersion() {
  if (!existsSync(CARGO_TOML)) return null;
  const src = readFileSync(CARGO_TOML, 'utf8');
  const m = src.match(/^version\s*=\s*"([^"]+)"/m);
  return m ? m[1] : null;
}

function extractModelRefs(text) {
  const refs = new Set();
  for (const m of text.matchAll(MODEL_ID_RE)) {
    refs.add(m[1]);
  }
  return refs;
}

function main() {
  if (!existsSync(LOCKS_DIR)) {
    console.log('AP-09: locks dir absent (expected in CI) — skip.');
    process.exit(0);
  }

  const knownModelIds = readModelsJson();
  const cargoVersion = readCargoVersion();

  const lockFiles = readdirSync(LOCKS_DIR).filter((f) => f.endsWith('.md'));
  if (lockFiles.length === 0) {
    console.log('AP-09: no lock files found — skip.');
    process.exit(0);
  }

  const driftItems = [];

  for (const filename of lockFiles) {
    const filePath = join(LOCKS_DIR, filename);
    const text = readFileSync(filePath, 'utf8');
    const refs = extractModelRefs(text);

    for (const ref of refs) {
      if (!knownModelIds.has(ref)) {
        driftItems.push({
          lockFile: filename,
          ref,
          note: 'model ID not found in packages/contracts/types/src/models.json',
        });
      }
    }
  }

  if (driftItems.length === 0) {
    console.log(
      `AP-09: aligned — all model refs in ${lockFiles.length} lock files match models.json.`,
    );
    if (cargoVersion) {
      console.log(`  Cargo.toml version: ${cargoVersion}`);
    }
    process.exit(0);
  }

  console.warn('AP-09 WARN: lock-vs-build drift detected (non-blocking — informational only).');
  console.warn(
    'These model IDs appear in lock files but are not in packages/contracts/types/src/models.json:',
  );
  console.warn('Either update the lock file or add the model to models.json.\n');

  const grouped = {};
  for (const item of driftItems) {
    if (!grouped[item.lockFile]) grouped[item.lockFile] = [];
    grouped[item.lockFile].push(item.ref);
  }

  for (const [file, refs] of Object.entries(grouped)) {
    console.warn(`  ${file}`);
    for (const ref of refs) {
      console.warn(`    drift: "${ref}" not in models.json`);
    }
  }

  if (cargoVersion) {
    console.warn(`\n  Cargo.toml version: ${cargoVersion}`);
  }

  process.exit(2);
}

main();
