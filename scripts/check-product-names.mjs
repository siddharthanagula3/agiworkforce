#!/usr/bin/env node
// Every app shows the product name the registry owns, and no retired spelling of
// a product survives in shipped source. The registry is
// packages/contracts/types/src/product-names.ts; a rename is one edit there plus
// the manifest fields below that cannot import it.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REGISTRY_PATH = 'packages/contracts/types/src/product-names.ts';

export const MANIFEST_FIELDS = [
  { product: 'mobile', file: 'apps/mobile/app.config.js', pattern: /^\s*name:\s*'([^']+)'/m },
  {
    product: 'desktop',
    file: 'apps/desktop/electron-builder.yml',
    pattern: /^productName:\s*(.+)$/m,
  },
  { product: 'extension', file: 'apps/extension/manifest.json', json: ['name'] },
  { product: 'code', file: 'apps/extension-vscode/package.json', json: ['displayName'] },
];

export const RETIRED_SPELLINGS = [
  'AGI Web',
  'AGI for Chrome',
  'AGI for VS Code',
  'AGI Workforce Desktop',
  'AGI Workforce desktop',
  'AGI Workforce for desktop',
  'AGI Workforce CLI',
  'AGI Workforce Mobile',
  'AGI Workforce mobile app',
];

export const SCANNED_ROOTS = [
  'apps/web/app',
  'apps/web/features',
  'apps/web/lib',
  'apps/mobile/app',
  'apps/mobile/src',
  'apps/desktop/src',
  'apps/desktop/electron',
  'apps/extension/src',
  'apps/extension-vscode/src',
  'apps/cli/src',
  'packages/ui',
];

const SOURCE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|rs|swift|json)$/;
const SKIPPED_DIR = new Set(['node_modules', 'dist', '.next', 'build', 'target', '__snapshots__']);

export function readRegistry(root) {
  const source = fs.readFileSync(path.join(root, REGISTRY_PATH), 'utf8');
  const block = source.match(/PRODUCT_NAMES\s*=\s*\{([\s\S]*?)\}/);
  if (!block) throw new Error(`${REGISTRY_PATH}: PRODUCT_NAMES not found`);
  const names = {};
  for (const [, key, value] of block[1].matchAll(/(\w+):\s*'([^']+)'/g)) names[key] = value;
  return names;
}

function readField(root, field) {
  const source = fs.readFileSync(path.join(root, field.file), 'utf8');
  if (field.json) {
    return field.json.reduce((value, key) => value?.[key], JSON.parse(source)) ?? null;
  }
  return (
    source
      .match(field.pattern)?.[1]
      ?.trim()
      .replace(/^['"]|['"]$/g, '') ?? null
  );
}

function* walk(root, relative) {
  const full = path.join(root, relative);
  if (!fs.existsSync(full)) return;
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    if (SKIPPED_DIR.has(entry.name)) continue;
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) yield* walk(root, child);
    else if (SOURCE_FILE.test(entry.name)) yield child;
  }
}

export function runProductNamesCheck(root = REPO_ROOT) {
  const failures = [];
  const names = readRegistry(root);
  for (const field of MANIFEST_FIELDS) {
    const value = readField(root, field);
    if (value !== names[field.product]) {
      failures.push(
        `${field.file}: shows "${value}", the registry names this app "${names[field.product]}"`,
      );
    }
  }
  const retired = new RegExp(
    `\\b(${RETIRED_SPELLINGS.map((s) => s.replace(/ /g, '\\s')).join('|')})\\b`,
  );
  for (const scanned of SCANNED_ROOTS) {
    for (const file of walk(root, scanned)) {
      const lines = fs.readFileSync(path.join(root, file), 'utf8').split('\n');
      lines.forEach((line, index) => {
        const hit = line.match(retired);
        if (hit) failures.push(`${file}:${index + 1}: retired product spelling "${hit[1]}"`);
      });
    }
  }
  return failures;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const failures = runProductNamesCheck();
  if (failures.length > 0) {
    console.error(`check:product-names FAILED:\n${failures.map((f) => `  - ${f}`).join('\n')}`);
    console.error(`Product names live in ${REGISTRY_PATH}; use them, never a retired spelling.`);
    process.exit(1);
  }
  console.log(
    'Product names check passed: every app shows its registry name and no retired spelling remains.',
  );
}
