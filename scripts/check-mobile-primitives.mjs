#!/usr/bin/env node

// Mobile screens draw text and touch targets through the primitive layer in
// apps/mobile/components/ui (text, button, pressable-box), which carries the
// theme, the type scale, the 44 point target and the accessibility role. A
// screen that imports Text, Pressable or a Touchable straight from
// react-native skips all of it. The modules that do so today are recorded in
// the baseline, which only shrinks; a new one fails.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const MOBILE_ROOT = 'apps/mobile';
export const PRIMITIVE_LAYER = 'apps/mobile/components/ui/';
export const BASELINE_PATH = 'scripts/config/mobile-primitives-baseline.json';
export const RAW_PRIMITIVES = Object.freeze([
  'Text',
  'Pressable',
  'TouchableOpacity',
  'TouchableHighlight',
  'TouchableWithoutFeedback',
]);

const SKIP_DIRECTORY =
  /^(?:\.|node_modules$|dist$|build$|coverage$|__tests__$|__mocks__$|__fixtures__$|e2e$|ios$|android$)/;
const COMPONENT_FILE = /\.tsx$/;
const TEST_FILE = /\.(?:test|spec)\.tsx$/;
const REACT_NATIVE_IMPORT = /import\s*\{([^}]*)\}\s*from\s*['"]react-native['"]/g;

function mobileFiles(repoRoot) {
  const files = [];
  const walk = (relativeDir) => {
    const absolute = path.join(repoRoot, relativeDir);
    if (!existsSync(absolute)) return;
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const relative = `${relativeDir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORY.test(entry.name)) walk(relative);
      } else if (COMPONENT_FILE.test(entry.name) && !TEST_FILE.test(entry.name)) {
        files.push(relative);
      }
    }
  };
  walk(MOBILE_ROOT);
  return files.sort();
}

export function rawPrimitiveImports(source) {
  const found = new Set();
  for (const match of source.matchAll(REACT_NATIVE_IMPORT)) {
    for (const specifier of match[1].split(',')) {
      const name = specifier
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)[0]
        .trim();
      if (RAW_PRIMITIVES.includes(name)) found.add(name);
    }
  }
  return [...found].sort();
}

export function findRawPrimitiveModules(repoRoot = REPO_ROOT) {
  const modules = {};
  for (const file of mobileFiles(repoRoot)) {
    if (file.startsWith(PRIMITIVE_LAYER)) continue;
    const source = readFileSync(path.join(repoRoot, file), 'utf8');
    const raw = rawPrimitiveImports(source);
    if (raw.length > 0) modules[file] = raw;
  }
  return modules;
}

export function loadBaseline(repoRoot = REPO_ROOT) {
  const absolute = path.join(repoRoot, BASELINE_PATH);
  if (!existsSync(absolute)) return { modules: [] };
  return JSON.parse(readFileSync(absolute, 'utf8'));
}

export function checkMobilePrimitives(repoRoot = REPO_ROOT, baseline = loadBaseline(repoRoot)) {
  const failures = [];
  const found = findRawPrimitiveModules(repoRoot);
  const recorded = new Set(baseline.modules ?? []);
  for (const [file, raw] of Object.entries(found)) {
    if (!recorded.has(file)) {
      failures.push(
        `${file} imports ${raw.join(', ')} from react-native. Use Text, Button or PressableBox from ${PRIMITIVE_LAYER} instead.`,
      );
    }
  }
  for (const file of recorded) {
    if (found[file] === undefined) {
      failures.push(
        `${BASELINE_PATH}: ${file} no longer imports a raw primitive. Delete it; this list only shrinks.`,
      );
    }
  }
  return { failures, found };
}

function main() {
  const { failures, found } = checkMobilePrimitives();
  if (failures.length > 0) {
    console.error('Mobile primitive check failed:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(
    `check-mobile-primitives: no new raw react-native Text or touchable imports; ${Object.keys(found).length} recorded module(s) still to move onto ${PRIMITIVE_LAYER}.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
