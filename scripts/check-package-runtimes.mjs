#!/usr/bin/env node

// Every entry point a workspace package exports says where it may run:
// universal (web, desktop renderer, mobile and Node), browser, server (Node
// only), native (React Native only) or asset. The declaration lives in
// scripts/config/package-runtimes.json and this check holds each entry's
// static import graph to it, across packages: an entry that may reach a
// browser or a phone must not reach a Node built-in, a server-only module or a
// server entry of another package, and nothing but a native entry may reach
// react-native. A new entry, or a change of where one may run, is a
// declaration somebody writes down rather than a bundle that breaks.

import { execFileSync } from 'node:child_process';
import { builtinModules } from 'node:module';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const REGISTRY_PATH = 'scripts/config/package-runtimes.json';
export const RUNTIMES = Object.freeze(['universal', 'browser', 'server', 'native', 'asset']);

const NODE_BUILTINS = new Set(builtinModules.filter((name) => !name.startsWith('_')));
const CODE_FILE = /\.(?:tsx?|mts|js|mjs)$/;
const STATIC_IMPORT =
  /(?:^|\n)\s*(?:import|export)\s+(type\s+)?(?:[^'"`;]*?\s+from\s+)?['"]([^'"]+)['"]/g;

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function workspacePackages(repoRoot = REPO_ROOT) {
  const listed = execFileSync('git', ['-C', repoRoot, 'ls-files', 'packages/**/package.json'], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter((file) => file && !file.includes('node_modules'));
  return listed.map((file) => {
    const manifest = readJson(path.join(repoRoot, file));
    return { dir: path.dirname(file), name: manifest.name, manifest };
  });
}

export function exportEntries(manifest) {
  let exports = manifest.exports;
  if (exports === undefined && manifest.main) exports = { '.': manifest.main };
  if (typeof exports === 'string') exports = { '.': exports };
  const entries = {};
  for (const [subpath, target] of Object.entries(exports ?? {})) {
    if (!subpath.startsWith('.')) continue;
    const file =
      typeof target === 'string'
        ? target
        : (target?.import ?? target?.default ?? target?.types ?? Object.values(target ?? {})[0]);
    if (typeof file === 'string') entries[subpath] = file;
  }
  return entries;
}

function resolveRelative(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    `${base}.js`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function workspaceTarget(specifier, byName) {
  const parts = specifier.split('/');
  const name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  const workspace = byName.get(name);
  if (!workspace) return null;
  const rest = specifier.slice(name.length);
  return { workspace, subpath: rest ? `.${rest}` : '.' };
}

export function entryReach(repoRoot, entryFile, byName) {
  const reach = { node: [], serverOnly: [], native: [], workspace: [] };
  const seen = new Set();
  const stack = [entryFile];
  while (stack.length > 0) {
    const file = stack.pop();
    if (seen.has(file) || !CODE_FILE.test(file) || !existsSync(file)) continue;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    const where = path.relative(repoRoot, file);
    for (const match of source.matchAll(STATIC_IMPORT)) {
      if (match[1]) continue;
      const specifier = match[2];
      if (specifier.startsWith('.')) {
        const resolved = resolveRelative(file, specifier);
        if (resolved) stack.push(resolved);
      } else if (specifier.startsWith('node:') || NODE_BUILTINS.has(specifier)) {
        reach.node.push(`${where} imports ${specifier}`);
      } else if (specifier === 'server-only') {
        reach.serverOnly.push(`${where} imports server-only`);
      } else if (specifier === 'react-native' || specifier.startsWith('react-native/')) {
        reach.native.push(`${where} imports ${specifier}`);
      } else {
        const target = workspaceTarget(specifier, byName);
        if (target) reach.workspace.push({ ...target, from: where, specifier });
      }
    }
  }
  return reach;
}

export function checkPackageRuntimes(
  repoRoot = REPO_ROOT,
  { registry = null, packages = workspacePackages(repoRoot) } = {},
) {
  const failures = [];
  const fail = (message) => failures.push(message);
  const declared = registry ?? readJson(path.join(repoRoot, REGISTRY_PATH)).packages ?? {};
  const byName = new Map(packages.map((entry) => [entry.name, entry]));
  const runtimeOf = (dir, subpath) => declared[dir]?.[subpath];

  for (const { dir, manifest } of packages) {
    const entries = exportEntries(manifest);
    for (const [subpath, target] of Object.entries(entries)) {
      const runtime = runtimeOf(dir, subpath);
      const label = `${manifest.name}${subpath === '.' ? '' : subpath.slice(1)}`;
      if (runtime === undefined) {
        fail(`${label} (${dir}) declares no runtime in ${REGISTRY_PATH}`);
        continue;
      }
      if (!RUNTIMES.includes(runtime)) {
        fail(`${label} declares the unknown runtime "${runtime}"`);
        continue;
      }
      if (runtime === 'asset') continue;
      const entryFile = path.join(repoRoot, dir, target);
      if (!CODE_FILE.test(target)) {
        fail(`${label} points at ${target}, which is not code, so its runtime is asset`);
        continue;
      }
      const reach = entryReach(repoRoot, entryFile, byName);
      if (runtime !== 'server') {
        for (const hit of reach.node) {
          fail(`${label} is declared ${runtime} but reaches a Node built-in: ${hit}`);
        }
        for (const hit of reach.serverOnly) {
          fail(`${label} is declared ${runtime} but reaches server-only: ${hit}`);
        }
      }
      if (runtime !== 'native') {
        for (const hit of reach.native) {
          fail(`${label} is declared ${runtime} but reaches React Native: ${hit}`);
        }
      }
      for (const edge of reach.workspace) {
        const imported = runtimeOf(edge.workspace.dir, edge.subpath);
        if (imported === undefined) continue;
        const incompatible =
          (imported === 'server' && runtime !== 'server') ||
          (imported === 'native' && runtime !== 'native') ||
          (imported === 'browser' && (runtime === 'universal' || runtime === 'native'));
        if (incompatible) {
          fail(
            `${label} is declared ${runtime} but ${edge.from} imports ${edge.specifier}, which is declared ${imported}`,
          );
        }
      }
    }
  }

  for (const [dir, subpaths] of Object.entries(declared)) {
    const workspace = packages.find((entry) => entry.dir === dir);
    if (!workspace) {
      fail(`${REGISTRY_PATH} declares ${dir}, which is not a workspace package`);
      continue;
    }
    const entries = exportEntries(workspace.manifest);
    for (const subpath of Object.keys(subpaths)) {
      if (entries[subpath] === undefined) {
        fail(`${REGISTRY_PATH} declares ${dir} ${subpath}, which the package no longer exports`);
      }
    }
  }
  return failures;
}

function main() {
  const failures = checkPackageRuntimes();
  if (failures.length > 0) {
    console.error('Package runtime check failed:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  const declared = readJson(path.join(REPO_ROOT, REGISTRY_PATH)).packages;
  const count = Object.values(declared).reduce(
    (sum, subpaths) => sum + Object.keys(subpaths).length,
    0,
  );
  console.log(
    `check-package-runtimes: ${count} package entry point(s) declare where they run, and each import graph stays inside it.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
