#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const WORKFLOWS = path.join(root, '.github/workflows');
const SKIP_DIRS = new Set(['node_modules', 'target', 'dist', '.git', '.next']);

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
        const block = /^\[features\]\r?\n([\s\S]*?)(?=^\[[A-Za-z]|$(?![\s\S]))/m.exec(src);
        if (block) {
          for (const line of block[1].split('\n')) {
            const key = /^([A-Za-z0-9_-]+)\s*=/.exec(line)?.[1];
            if (key) features.add(key);
          }
        }
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
      if (!spec.includes('/')) continue;
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

let continuationChecked = 0;
for (const file of workflowFiles) {
  const lines = fs.readFileSync(path.join(WORKFLOWS, file), 'utf8').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].replace(/\s+$/, '');
    if (!line.endsWith('\\') || line.endsWith('\\\\')) continue;
    continuationChecked += 1;
    let next = i + 1;
    while (next < lines.length && lines[next].trim() === '') next += 1;
    if (next < lines.length && lines[next].trim().startsWith('#')) {
      errors.push(
        `${file}:${i + 1}: a comment follows a line-continuation backslash.\n` +
          `    The shell joins the lines first, so the comment truncates the command ` +
          `and the rest of it runs as separate commands.\n` +
          `    Move the comment above the \`run:\` key.`,
      );
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
    `${workflowFiles.length} workflow(s), against ${manifests.size} crate(s); ` +
    `${continuationChecked} line continuation(s) checked for comment truncation).`,
);
