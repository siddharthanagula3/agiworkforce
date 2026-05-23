#!/usr/bin/env node
/**
 * AP-08: Hardcoded-fixture-array lint
 *
 * Detects module-level const arrays in UI components (.tsx) whose names match
 * known display-data patterns (SKILLS_LIST, INSTALLED_PLUGINS, CONNECTORS, etc.)
 * when a live store for the same domain exists in apps/desktop/src/stores/.
 *
 * Anti-pattern shape: a UI component (.tsx) declares its own copy of display
 * data instead of reading from the canonical store. Canonical definition files
 * (*Definitions.ts, *Catalog.ts, *-data.ts, *-fixtures.ts) are exempt because
 * they ARE the source of truth that stores read from.
 *
 * Exit 0 = clean, 1 = anti-pattern found.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, relative, basename } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../');
const DESKTOP_SRC = resolve(ROOT, 'apps/desktop/src');
const STORES_DIR = resolve(DESKTOP_SRC, 'stores');

// Patterns that identify display/fixture data arrays by name
const DISPLAY_ARRAY_PATTERNS = [
  /^SKILLS[_A-Z]*$/,
  /^INSTALLED_PLUGINS$/,
  /^CONNECTORS$/,
  /^MODELS$/,
  /^PROVIDERS$/,
  /[A-Z][A-Z0-9]*_LIST$/,
  /[A-Z][A-Z0-9]*_FIXTURES$/,
  /[A-Z][A-Z0-9]*_DATA$/,
];

// Domain keyword → store file name patterns.
// Only map domains where a hardcoded UI copy is genuinely the anti-pattern.
// PROVIDERS is intentionally excluded: a PROVIDERS const in an OAuth/settings
// panel defines app-registration metadata (client IDs, docs URLs), which is
// categorically different from AI model provider lists read from modelStore.
const DOMAIN_TO_STORE = [
  { keywords: ['SKILL', 'SKILLS'], storePattern: /skillMarketplace/i },
  { keywords: ['PLUGIN', 'PLUGINS'], storePattern: /skillMarketplace|plugin/i },
  { keywords: ['CONNECTOR', 'CONNECTORS'], storePattern: /connector/i },
  { keywords: ['MODEL', 'MODELS'], storePattern: /modelStore/i },
];

// Canonical-definition path suffixes — these files ARE the source of truth, not consumers
const CANONICAL_PATH_SUFFIXES = [
  'Definitions.ts',
  'Definitions.tsx',
  'Catalog.ts',
  'Catalog.tsx',
  '-data.ts',
  '-data.tsx',
  '-fixtures.ts',
  '-fixtures.tsx',
  'Constants.ts',
  'Constants.tsx',
];

// Test / mock path segments — always exempt
const EXEMPT_PATH_SEGMENTS = ['__tests__', '__mocks__', '.test.', '.spec.'];

function isCanonicalFile(filePath) {
  const base = basename(filePath);
  return CANONICAL_PATH_SUFFIXES.some((suffix) => base.endsWith(suffix));
}

function isExemptPath(filePath) {
  return EXEMPT_PATH_SEGMENTS.some((seg) => filePath.includes(seg));
}

function getAvailableStores() {
  if (!existsSync(STORES_DIR)) return [];
  return readdirSync(STORES_DIR).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
}

function storeExistsForDomain(varName, storeFiles) {
  for (const { keywords, storePattern } of DOMAIN_TO_STORE) {
    const matchesKeyword = keywords.some((kw) => varName.includes(kw));
    if (!matchesKeyword) continue;
    const storeFile = storeFiles.find((f) => storePattern.test(f));
    if (storeFile) return storeFile;
  }
  return null;
}

function matchesDisplayPattern(varName) {
  return DISPLAY_ARRAY_PATTERNS.some((re) => re.test(varName));
}

// Collect all .tsx files (UI components) — where the anti-pattern lives
function collectTsxFiles(dir) {
  const results = [];
  function walk(current) {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = resolve(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
        results.push(fullPath);
      }
    }
  }
  walk(dir);
  return results;
}

// Extract module-level (not inside function/class) const array declarations
// Heuristic: line starts with "const <NAME>" at column 0 or with "export const <NAME>"
function extractModuleLevelArrayVars(filePath) {
  const src = readFileSync(filePath, 'utf8');
  const lines = src.split('\n');
  const found = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match: (export )?const NAME(: Type)? = [
    const m = line.match(/^(?:export )?const ([A-Z][A-Z0-9_]+)(?::\s*[^=]+)?\s*=\s*\[/);
    if (m) {
      found.push({ varName: m[1], lineNum: i + 1, line: line.trim() });
    }
  }
  return found;
}

function main() {
  const storeFiles = getAvailableStores();
  const tsxFiles = collectTsxFiles(DESKTOP_SRC);

  const violations = [];

  for (const filePath of tsxFiles) {
    if (isExemptPath(filePath)) continue;
    if (isCanonicalFile(filePath)) continue;

    const declarations = extractModuleLevelArrayVars(filePath);
    for (const { varName, lineNum } of declarations) {
      if (!matchesDisplayPattern(varName)) continue;
      const storeFile = storeExistsForDomain(varName, storeFiles);
      if (!storeFile) continue;

      violations.push({
        file: relative(ROOT, filePath),
        line: lineNum,
        varName,
        storeFile,
      });
    }
  }

  if (violations.length === 0) {
    console.log('AP-08: clean — no hardcoded display arrays with live store counterparts found.');
    process.exit(0);
  }

  console.error(
    'AP-08 FAIL: hardcoded display array(s) found in UI components while a live store exists for the same domain.',
  );
  console.error('Wire the component to the store instead of re-declaring the data.\n');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  const ${v.varName} = [...]`);
    console.error(`    → store exists: apps/desktop/src/stores/${v.storeFile}\n`);
  }
  process.exit(1);
}

main();
