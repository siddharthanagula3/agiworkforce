#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export const TAXONOMY_PATH = 'packages/contracts/context/src/context-source.ts';

/**
 * A call site proves the boundary by naming it, or by resolving through the
 * engine, which applies each class's own exclusion before any loader runs.
 */
const TEMPORARY_MARKERS = [
  /\bisTemporary\b/,
  /\btemporaryChat\b/,
  /\bconversationIsTemporary\b/,
  /\bexcludedFromTemporaryChat\b/,
  /\bresolveContext\s*\(/,
];

const POLICY_MARKERS = [
  /\bloadManagedMemoryPolicy\b/,
  /\bManagedMemoryPolicy\b/,
  /\bpolicy\.enabled\b/,
  /\bsearchPastChats\b/,
];

/**
 * The classes the taxonomy excludes from a temporary chat, and the loaders it
 * says produce them. Both come out of the one registry, so a class added there
 * is guarded here without this file changing.
 */
export function guardedLoaders(taxonomySource) {
  const loaders = [];
  const blocks = taxonomySource.split(/\n {2}(?=[a-z_]+: \{\n)/);
  for (const block of blocks) {
    if (!/excludedFromTemporaryChat:\s*true/.test(block)) continue;
    const sourceClass = /^\s*([a-z_]+):\s*\{/.exec(block)?.[1];
    if (!sourceClass) continue;
    for (const match of block.matchAll(/module:\s*'([^']+)',\s*\n\s*loader:\s*'([^']+)'/g)) {
      loaders.push({ sourceClass, module: match[1], loader: match[2] });
    }
  }
  return loaders;
}

function listFiles(directory) {
  const out = [];
  const walk = (current) => {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
        walk(full);
        continue;
      }
      if (!/\.[cm]?tsx?$/.test(entry.name)) continue;
      if (/\.(test|spec)\.[cm]?tsx?$/.test(entry.name)) continue;
      out.push(full);
    }
  };
  walk(directory);
  return out;
}

export function auditCallSite(relativePath, source, loaderNames) {
  const called = loaderNames.filter((name) => new RegExp(`\\b${name}\\s*\\(`).test(source));
  if (called.length === 0) return [];
  const failures = [];
  if (!TEMPORARY_MARKERS.some((marker) => marker.test(source))) {
    failures.push(
      `${relativePath}: calls ${called.join(', ')} and never names the temporary boundary`,
    );
  }
  if (!POLICY_MARKERS.some((marker) => marker.test(source))) {
    failures.push(
      `${relativePath}: calls ${called.join(', ')} and never consults the memory policy`,
    );
  }
  return failures;
}

export function auditRepository(repoRoot) {
  const taxonomyPath = path.join(repoRoot, TAXONOMY_PATH);
  if (!fs.existsSync(taxonomyPath)) {
    return { loaders: [], callSites: 0, failures: [`${TAXONOMY_PATH} is missing`] };
  }
  const loaders = guardedLoaders(fs.readFileSync(taxonomyPath, 'utf8'));
  const loaderNames = [...new Set(loaders.map((entry) => entry.loader))];
  if (loaderNames.length === 0) {
    return { loaders, callSites: 0, failures: ['the taxonomy declares no guarded loader'] };
  }

  const definitionModules = new Set(loaders.map((entry) => entry.module));
  const failures = [];
  let callSites = 0;
  for (const file of listFiles(path.join(repoRoot, 'apps/web'))) {
    const relativePath = path.relative(repoRoot, file);
    const source = fs.readFileSync(file, 'utf8');
    if (!loaderNames.some((name) => source.includes(name))) continue;
    if (definitionModules.has(relativePath)) continue;
    const problems = auditCallSite(relativePath, source, loaderNames);
    if (new RegExp(`\\b(${loaderNames.join('|')})\\s*\\(`).test(source)) callSites += 1;
    failures.push(...problems);
  }
  return { loaders, callSites, failures };
}

function main() {
  const { loaders, callSites, failures } = auditRepository(process.cwd());
  if (failures.length > 0) {
    console.error(`check-context-temporary-boundary:\n  ${failures.join('\n  ')}`);
    process.exit(1);
  }
  if (callSites === 0) {
    console.error('check-context-temporary-boundary: no call site found; the walk would be empty');
    process.exit(1);
  }
  console.log(
    `check-context-temporary-boundary: ${callSites} call site(s) of ${loaders.length} excluded loader(s) name the boundary`,
  );
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main();
}
