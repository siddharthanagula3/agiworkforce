#!/usr/bin/env node
/**
 * Verify every `--features "crate/feature"` a workflow passes to cargo names a
 * feature that actually exists.
 *
 * WHY. `Clippy (all features)` passed `agiworkforce-desktop/sentry`, and that
 * feature does not exist. Cargo rejects an unknown feature during argument
 * parsing:
 *
 *   error: none of the selected packages contains this feature:
 *          agiworkforce-desktop/sentry
 *
 * so the lane failed on every commit while linting ZERO lines. It stayed
 * invisible for weeks because the job only runs after `check` passes, and
 * `check` was red from 2026-07-21 until it was fixed.
 *
 * That is the shape worth guarding: a gate that dies during argument parsing
 * is indistinguishable from one that has nothing to report. Neither ever says
 * "I linted nothing" — one is simply red, and a permanently red lane stops
 * being read.
 *
 * This is a text check on purpose. It costs milliseconds and needs no cargo,
 * no toolchain and no network, so it runs in the ordinary guard chain rather
 * than only where Rust is installed.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const WORKFLOWS = path.join(root, '.github/workflows');
const SKIP_DIRS = new Set(['node_modules', 'target', 'dist', '.git', '.next']);

/** crate name -> Set of declared feature names, from every Cargo.toml. */
function crateFeatures() {
  const manifests = new Map();

  function walk(dir, depth) {
    if (depth > 4) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.name === 'Cargo.toml') {
        let src;
        try {
          src = fs.readFileSync(full, 'utf8');
        } catch {
          continue;
        }
        const name = /^name\s*=\s*"([^"]+)"/m.exec(src)?.[1];
        if (!name) continue;
        const features = new Set();
        // Capture to the NEXT section header, or end of file. An earlier
        // version ended the capture at /^\[|\s*$/m, whose second alternative
        // matches at the first line end under the m flag — so it captured
        // nothing and every real feature was reported missing. Caught by
        // running this guard against the known-good config before trusting it.
        const block = /^\[features\]\r?\n([\s\S]*?)(?=^\[[A-Za-z]|$(?![\s\S]))/m.exec(src);
        if (block) {
          for (const line of block[1].split('\n')) {
            const key = /^([A-Za-z0-9_-]+)\s*=/.exec(line)?.[1];
            if (key) features.add(key);
          }
        }
        // An optional dependency implicitly declares a feature of the same
        // name, so `dep:foo`-style features are not the only valid values.
        for (const dep of src.matchAll(/^([A-Za-z0-9_-]+)\s*=\s*\{[^}]*optional\s*=\s*true/gm)) {
          features.add(dep[1]);
        }
        manifests.set(name, features);
      }
    }
  }

  walk(root, 0);
  return manifests;
}

const manifests = crateFeatures();
const errors = [];
let referenceCount = 0;

let workflowFiles = [];
try {
  workflowFiles = fs
    .readdirSync(WORKFLOWS)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
} catch {
  console.log('No .github/workflows directory; nothing to check.');
  process.exit(0);
}

for (const file of workflowFiles) {
  const src = fs.readFileSync(path.join(WORKFLOWS, file), 'utf8');
  for (const match of src.matchAll(/--features\s+"([^"]+)"/g)) {
    for (const spec of match[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)) {
      if (!spec.includes('/')) continue; // bare feature: belongs to the current crate
      referenceCount += 1;
      const [crate, feature] = spec.split('/');
      const declared = manifests.get(crate);
      if (!declared) {
        errors.push(
          `${file}: --features names crate '${crate}', which has no Cargo.toml in this workspace.`,
        );
        continue;
      }
      if (!declared.has(feature)) {
        const known = [...declared].sort().join(', ') || '(none)';
        errors.push(
          `${file}: '${crate}' has no feature '${feature}'.\n` +
            `    cargo rejects this during argument parsing, so the step fails ` +
            `without linting or building anything.\n` +
            `    Declared features: ${known}`,
        );
      }
    }
  }
}

if (errors.length > 0) {
  console.error('Workflow cargo-feature check failed:\n');
  for (const error of errors) console.error(`- ${error}\n`);
  process.exit(1);
}

console.log(
  `Workflow cargo-feature check passed (${referenceCount} qualified reference(s) across ` +
    `${workflowFiles.length} workflow(s), against ${manifests.size} crate(s)).`,
);
