#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../');
const MODELS_JSON = join(ROOT, 'packages/contracts/types/src/models.json');
const WEB_DIR = join(ROOT, 'apps/web');

const catalog = JSON.parse(readFileSync(MODELS_JSON, 'utf8'));

function normalize(id) {
  return id.replace(/(?<=\d)-(?=\d)/g, '.');
}

const validIdsRaw = new Set();

for (const [key, model] of Object.entries(catalog.models ?? {})) {
  validIdsRaw.add(key);
  if (model.apiModelId) validIdsRaw.add(model.apiModelId);
}

for (const provider of Object.values(catalog.providers ?? {})) {
  if (provider.defaultModel) validIdsRaw.add(provider.defaultModel);
  for (const mid of Object.values(provider.taskRouting ?? {})) validIdsRaw.add(mid);
  for (const canonical of Object.values(provider.canonicalization ?? {})) {
    validIdsRaw.add(canonical);
  }
}

for (const presets of Object.values(catalog.modelPresets ?? {})) {
  for (const p of presets) {
    if (p.value) validIdsRaw.add(p.value);
  }
}

const validNormalized = new Set([...validIdsRaw].map(normalize));

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

const targetFiles = [...new Set([...ANCHOR_FILES, ...marketingPathFiles])];

const MODEL_REGEXES = [
  /\b[a-z][a-z0-9]*(?:[-./][a-z0-9]+)*[-./][0-9][a-z0-9]*(?:[-./][a-z0-9]+)*\b/gi,
];

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

    const trimmed = line.trimStart();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      return;
    }

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
            `  WARN     ${rel}:${lineNum}  "${raw}"  (in catalog but not a current default/preset, may be stale)`,
          );
          staleCount++;
        }
      }
    }
  });
}

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
