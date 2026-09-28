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
//
// The same holds from the other side. Every client bundle root (web client
// components, the mobile app, the Chrome extension and the VS Code webview) is
// walked through its static and dynamic imports, and none may reach a Node
// built-in, server-only, a package entry declared for another runtime, or the
// crypto envelope in apps/web/lib/crypto, which stays in the web app because
// no client imports it. A 'use server' module is a reference from the client,
// not bundled code, so the walk stops there.

import { execFileSync } from 'node:child_process';
import { builtinModules } from 'node:module';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const REGISTRY_PATH = 'scripts/config/package-runtimes.json';
export const RUNTIMES = Object.freeze(['universal', 'browser', 'server', 'native', 'asset']);

export const CRYPTO_ENVELOPE_ROOT = 'apps/web/lib/crypto/';

export const CLIENT_BUNDLE_ROOTS = Object.freeze([
  {
    name: 'web client components',
    app: 'apps/web',
    runtime: 'browser',
    tsconfig: 'apps/web/tsconfig.json',
    directive: 'use client',
  },
  {
    name: 'mobile app',
    app: 'apps/mobile',
    runtime: 'native',
    tsconfig: 'apps/mobile/tsconfig.json',
    entries: ['apps/mobile/index.ts'],
    routes: 'apps/mobile/app',
  },
  {
    name: 'Chrome extension',
    app: 'apps/extension',
    runtime: 'browser',
    entries: [
      'apps/extension/src/background.ts',
      'apps/extension/src/content.ts',
      'apps/extension/src/options.ts',
      'apps/extension/src/side_panel.ts',
    ],
  },
  {
    name: 'VS Code webview',
    app: 'apps/extension-vscode',
    runtime: 'browser',
    entries: ['apps/extension-vscode/src/webview/render.ts'],
  },
]);

const NODE_BUILTINS = new Set(builtinModules.filter((name) => !name.startsWith('_')));
const CODE_FILE = /\.(?:tsx?|mts|js|mjs)$/;
const CLIENT_CODE_FILE = /\.(?:tsx?|mts|jsx?|mjs)$/;
const CLIENT_SKIP_DIRECTORY =
  /^(?:\.|node_modules$|\.next$|dist$|build$|out$|coverage$|__tests__$|__mocks__$|e2e$)/;
const CLIENT_SKIP_FILE = /\.(?:test|spec|stories)\.[cm]?[jt]sx?$|\.d\.ts$/;
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs'];
const NATIVE_PLATFORM_SUFFIXES = ['.native', '.ios', '.android', ''];
const STATIC_IMPORT =
  /(?:^|\n)\s*(?:import|export)\s+(type\s+)?(?:[^'"`;]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const CLIENT_IMPORT =
  /(?:^|\n)\s*(?:import|export)\s+(type\s+)?([^'"`;]*?)\s*from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
const LEADING_TRIVIA = String.raw`^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*`;

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

function hasDirective(source, directive) {
  return new RegExp(`${LEADING_TRIVIA}['"]${directive}['"]`).test(source);
}

function isTypeOnlyClause(typeKeyword, clause) {
  if (typeKeyword) return true;
  const named = clause?.trim().match(/^\{([\s\S]*)\}$/);
  if (!named) return false;
  const parts = named[1]
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every((part) => part.startsWith('type '));
}

export function clientImports(source) {
  const found = [];
  for (const match of source.matchAll(CLIENT_IMPORT)) {
    if (match[3] !== undefined) {
      if (!isTypeOnlyClause(match[1], match[2])) found.push(match[3]);
    } else {
      found.push(match[4] ?? match[5]);
    }
  }
  return found;
}

function moduleFiles(base, runtime) {
  if (existsSync(base) && statSync(base).isFile()) return [base];
  const suffixes = runtime === 'native' ? NATIVE_PLATFORM_SUFFIXES : [''];
  for (const stem of [base, path.join(base, 'index')]) {
    const found = [];
    for (const suffix of suffixes) {
      for (const extension of SOURCE_EXTENSIONS) {
        const file = `${stem}${suffix}${extension}`;
        if (existsSync(file) && statSync(file).isFile()) found.push(file);
      }
    }
    if (found.length > 0) return found;
  }
  return [];
}

function appAliases(repoRoot, tsconfig) {
  if (!tsconfig) return [];
  const config = readJson(path.join(repoRoot, tsconfig));
  const base = path.join(repoRoot, path.dirname(tsconfig), config.compilerOptions?.baseUrl ?? '.');
  return Object.entries(config.compilerOptions?.paths ?? {})
    .filter(([pattern, targets]) => pattern.endsWith('/*') && targets[0]?.endsWith('/*'))
    .map(([pattern, targets]) => ({
      prefix: pattern.slice(0, -1),
      dir: path.join(base, targets[0].slice(0, -1)),
    }))
    .sort((left, right) => right.prefix.length - left.prefix.length);
}

function appDependencies(repoRoot, app) {
  const manifest = readJson(path.join(repoRoot, app, 'package.json'));
  return new Set(
    ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].flatMap(
      (field) => Object.keys(manifest[field] ?? {}),
    ),
  );
}

function isNodeBuiltin(specifier, dependencies) {
  if (specifier.startsWith('node:')) return true;
  const name = specifier.split('/')[0];
  return NODE_BUILTINS.has(name) && !dependencies.has(name);
}

function clientSourceFiles(repoRoot, relativeDir) {
  const files = [];
  const walk = (relative) => {
    const absolute = path.join(repoRoot, relative);
    if (!existsSync(absolute)) return;
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!CLIENT_SKIP_DIRECTORY.test(entry.name)) walk(child);
      } else if (CLIENT_CODE_FILE.test(entry.name) && !CLIENT_SKIP_FILE.test(entry.name)) {
        files.push(child);
      }
    }
  };
  walk(relativeDir);
  return files;
}

function rootEntries(repoRoot, root, fail) {
  const entries = [];
  for (const entry of root.entries ?? []) {
    if (existsSync(path.join(repoRoot, entry))) entries.push(entry);
    else fail(`${root.name} names the entry ${entry}, which no longer exists`);
  }
  if (root.routes) {
    const routes = clientSourceFiles(repoRoot, root.routes);
    if (routes.length === 0) fail(`${root.name} has no route files under ${root.routes}`);
    entries.push(...routes);
  }
  if (root.directive) {
    const marked = clientSourceFiles(repoRoot, root.app).filter((file) =>
      hasDirective(readFileSync(path.join(repoRoot, file), 'utf8'), root.directive),
    );
    if (marked.length === 0) fail(`${root.name} found no module marked '${root.directive}'`);
    entries.push(...marked);
  }
  return entries;
}

export function checkClientBundleRoots(
  repoRoot = REPO_ROOT,
  { registry = null, packages = workspacePackages(repoRoot), roots = CLIENT_BUNDLE_ROOTS } = {},
) {
  const failures = [];
  const fail = (message) => failures.push(message);
  const declared = registry ?? readJson(path.join(repoRoot, REGISTRY_PATH)).packages ?? {};
  const byName = new Map(packages.map((entry) => [entry.name, entry]));
  const reported = new Set();

  for (const root of roots) {
    const aliases = appAliases(repoRoot, root.tsconfig);
    const dependencies = appDependencies(repoRoot, root.app);
    const reachedFrom = new Map();
    const stack = [];
    for (const entry of rootEntries(repoRoot, root, fail)) {
      const absolute = path.join(repoRoot, entry);
      if (!reachedFrom.has(absolute)) {
        reachedFrom.set(absolute, entry);
        stack.push(absolute);
      }
    }
    const report = (file, problem) => {
      const where = path.relative(repoRoot, file);
      const key = `${root.name}|${where}|${problem}`;
      if (reported.has(key)) return;
      reported.add(key);
      const entry = reachedFrom.get(file);
      const via = entry === where ? '' : ` (reached from ${entry})`;
      fail(`${root.name}: ${where} ${problem}${via}`);
    };

    while (stack.length > 0) {
      const file = stack.pop();
      const where = path.relative(repoRoot, file);
      if (where.startsWith(CRYPTO_ENVELOPE_ROOT)) {
        report(file, `is the crypto envelope, which must never reach a ${root.runtime} bundle`);
        continue;
      }
      const source = readFileSync(file, 'utf8');
      if (reachedFrom.get(file) !== where && hasDirective(source, 'use server')) continue;
      for (const specifier of clientImports(source)) {
        let targets = [];
        if (specifier.startsWith('.')) {
          targets = moduleFiles(path.resolve(path.dirname(file), specifier), root.runtime);
        } else {
          const alias = aliases.find(({ prefix }) => specifier.startsWith(prefix));
          if (alias) {
            targets = moduleFiles(
              path.join(alias.dir, specifier.slice(alias.prefix.length)),
              root.runtime,
            );
          } else if (isNodeBuiltin(specifier, dependencies)) {
            report(file, `imports the Node built-in ${specifier}`);
          } else if (specifier === 'server-only') {
            report(file, 'imports server-only');
          } else {
            const target = workspaceTarget(specifier, byName);
            const imported = target ? declared[target.workspace.dir]?.[target.subpath] : undefined;
            const incompatible =
              imported === 'server' ||
              (imported === 'native' && root.runtime !== 'native') ||
              (imported === 'browser' && root.runtime === 'native');
            if (incompatible) report(file, `imports ${specifier}, which is declared ${imported}`);
          }
        }
        for (const target of targets) {
          if (!CLIENT_CODE_FILE.test(target) || reachedFrom.has(target)) continue;
          reachedFrom.set(target, reachedFrom.get(file));
          stack.push(target);
        }
      }
    }
  }
  return failures;
}

function main() {
  const failures = [...checkPackageRuntimes(), ...checkClientBundleRoots()];
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
    `check-package-runtimes: ${count} package entry point(s) declare where they run, and each import graph stays inside it; ${CLIENT_BUNDLE_ROOTS.length} client bundle roots reach no server entry, Node built-in or crypto envelope.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
