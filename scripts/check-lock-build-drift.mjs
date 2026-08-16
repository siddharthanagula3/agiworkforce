#!/usr/bin/env node

import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { loadCanonicalModelIdTokens } from './check-no-hardcoded-model-ids.mjs';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../');
const MODELS_JSON = resolve(ROOT, 'packages/contracts/types/src/models.json');
const CARGO_TOML = resolve(ROOT, 'apps/desktop/src-tauri/Cargo.toml');

const LOCKS_DIR = join(
  homedir(),
  '.claude/projects/-Users-siddhartha-Desktop-agiworkforce/memory/locks',
);

const guardedModelTokens = loadCanonicalModelIdTokens(ROOT).map(({ id }) => id.toLowerCase());
const guardedModelTokenSet = new Set(guardedModelTokens);
const modelFamilyPrefixes = new Set(
  guardedModelTokens
    .map((id) => {
      const separator = id.search(/[-_./]/);
      return separator > 0 ? id.slice(0, separator) : id;
    })
    .filter(Boolean),
);
const IDENTIFIER_TOKEN_RE = /[A-Za-z0-9][A-Za-z0-9._:/-]*/g;

function readModelsJson() {
  if (!existsSync(MODELS_JSON)) return new Set();
  const raw = JSON.parse(readFileSync(MODELS_JSON, 'utf8'));
  const ids = new Set(Object.keys(raw.models || {}));
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
  for (const match of text.matchAll(IDENTIFIER_TOKEN_RE)) {
    const candidate = match[0];
    const lower = candidate.toLowerCase();
    if (guardedModelTokenSet.has(lower)) {
      refs.add(candidate);
      continue;
    }
    for (const prefix of modelFamilyPrefixes) {
      if (
        lower.startsWith(`${prefix}-`) ||
        lower.startsWith(`${prefix}_`) ||
        lower.startsWith(`${prefix}.`) ||
        lower.startsWith(`${prefix}/`)
      ) {
        refs.add(candidate);
        break;
      }
    }
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
