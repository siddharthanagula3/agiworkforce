#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  collectReachable,
  collectWorkspacePackageAliases,
  createResolver,
  isTestPath,
  listSourceFiles,
  toRepoRelative,
} from './lib/module-graph.mjs';
import { checkBaselineCeiling } from './lib/module-reachability-ratchet.mjs';

const root = process.cwd();
const errors = [];

const rustTargets = [
  {
    label: 'CLI Rust crate',
    sourceRoot: 'apps/cli/src',
    knownUnreachable: [],
  },
  {
    label: 'Desktop Tauri Rust crate',
    sourceRoot: 'apps/desktop/src-tauri/src',
    knownUnreachable: [],
  },
];

function relativePath(fullPath) {
  return path.relative(root, fullPath).split(path.sep).join('/');
}

function readText(fullPath) {
  return fs.readFileSync(fullPath, 'utf8');
}

function exists(fullPath) {
  return fs.existsSync(fullPath);
}

function walkFiles(dir, predicate, files = []) {
  if (!exists(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'target' || entry.name === '.git') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, predicate, files);
      continue;
    }
    if (predicate(fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
}

function stripRustComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function rustModuleDeclarations(source) {
  const stripped = stripRustComments(source);
  const declarations = [];
  const pattern =
    /(?:^|\n)\s*(?:#\[[^\]]+\]\s*)*(?:pub(?:\([^)]*\))?\s+)?mod\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/g;
  let match;

  while ((match = pattern.exec(stripped)) !== null) {
    declarations.push(match[1]);
  }

  return declarations;
}

function rustPathAttribute(source, moduleName) {
  const stripped = stripRustComments(source);
  const pattern = new RegExp(
    String.raw`#\[\s*path\s*=\s*"([^"]+)"\s*\]\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+${moduleName}\s*;`,
    'm',
  );
  return stripped.match(pattern)?.[1] ?? null;
}

function resolveRustModule(currentFile, moduleName) {
  const currentDir = path.dirname(currentFile);
  const currentBase = path.basename(currentFile);
  const moduleDir = ['lib.rs', 'main.rs', 'mod.rs'].includes(currentBase)
    ? currentDir
    : path.join(currentDir, path.basename(currentFile, '.rs'));
  const source = readText(currentFile);
  const pathOverride = rustPathAttribute(source, moduleName);
  const candidates = pathOverride
    ? [path.resolve(currentDir, pathOverride)]
    : [path.join(moduleDir, `${moduleName}.rs`), path.join(moduleDir, moduleName, 'mod.rs')];

  return candidates.find((candidate) => exists(candidate)) ?? null;
}

function rustEntrypoints(sourceRoot) {
  const absoluteRoot = path.join(root, sourceRoot);
  const roots = ['lib.rs', 'main.rs']
    .map((fileName) => path.join(absoluteRoot, fileName))
    .filter(exists);
  const binRoot = path.join(absoluteRoot, 'bin');

  for (const file of walkFiles(binRoot, (candidate) => candidate.endsWith('.rs'))) {
    roots.push(file);
  }

  return roots;
}

function checkRustTarget({ label, sourceRoot, knownUnreachable }) {
  const absoluteRoot = path.join(root, sourceRoot);
  if (!exists(absoluteRoot)) return;

  const allRustFiles = new Set(
    walkFiles(absoluteRoot, (file) => file.endsWith('.rs')).map((file) => path.normalize(file)),
  );
  const reachable = new Set();
  const stack = rustEntrypoints(sourceRoot);

  if (stack.length === 0) {
    errors.push(`${label}: no Rust entrypoint found under ${sourceRoot}`);
    return;
  }

  while (stack.length > 0) {
    const file = path.normalize(stack.pop());
    if (reachable.has(file)) continue;
    reachable.add(file);

    for (const moduleName of rustModuleDeclarations(readText(file))) {
      const resolved = resolveRustModule(file, moduleName);
      if (!resolved) {
        errors.push(`${relativePath(file)} declares mod ${moduleName}; but no module file exists`);
        continue;
      }
      stack.push(path.normalize(resolved));
    }
  }

  const unreachable = [...allRustFiles]
    .filter((file) => !reachable.has(file))
    .map(relativePath)
    .sort();

  const known = new Set(knownUnreachable);
  const unexpected = unreachable.filter((file) => !known.has(file));
  const staleKnown = knownUnreachable.filter((file) => !unreachable.includes(file));

  if (staleKnown.length > 0) {
    errors.push(
      `${label}: known unreachable baseline is stale; remove fixed/deleted path(s):\n` +
        staleKnown.map((file) => `  - ${file}`).join('\n'),
    );
  }

  if (unexpected.length > 0) {
    errors.push(
      `${label}: ${unexpected.length} Rust file(s) are not reachable from lib.rs/main.rs/bin roots:\n` +
        unexpected.map((file) => `  - ${file}`).join('\n'),
    );
  }
}

const tsTargets = [
  {
    label: 'Desktop renderer',
    sourceRoot: 'apps/desktop/src',
    entries: ['apps/desktop/src/Main.tsx'],
    aliases: (repoRoot) => {
      const desktopSrc = path.join(repoRoot, 'apps/desktop/src');
      return {
        '@/*': desktopSrc,
        '@components/*': path.join(desktopSrc, 'components'),
        '@stores/*': path.join(desktopSrc, 'stores'),
        '@hooks/*': path.join(desktopSrc, 'hooks'),
        '@utils/*': path.join(desktopSrc, 'utils'),
        '@styles/*': path.join(desktopSrc, 'styles'),
        '@types/*': path.join(desktopSrc, 'types'),
        '@assets/*': path.join(desktopSrc, 'assets'),
        '@lib/*': path.join(desktopSrc, 'lib'),
      };
    },
    knownUnreachable: [],
    maxKnownUnreachable: 0,
  },
];

function checkTsTarget({
  label,
  sourceRoot,
  entries,
  aliases,
  knownUnreachable,
  maxKnownUnreachable,
}) {
  errors.push(...checkBaselineCeiling({ label, knownUnreachable, ceiling: maxKnownUnreachable }));

  const absoluteRoot = path.join(root, sourceRoot);
  if (!exists(absoluteRoot)) return;

  const presentEntries = entries.map((entry) => path.join(root, entry)).filter((e) => exists(e));
  if (presentEntries.length === 0) {
    errors.push(`${label}: no entry point found (looked for ${entries.join(', ')})`);
    return;
  }

  const resolve = createResolver({
    ...aliases(root),
    ...collectWorkspacePackageAliases(root),
  });

  const reachable = new Set();
  for (const file of collectReachable(presentEntries, resolve)) {
    reachable.add(path.resolve(file));
  }

  const allFiles = listSourceFiles(absoluteRoot)
    .map((file) => path.resolve(file))
    .filter((file) => !isTestPath(toRepoRelative(root, file)));

  const unreachable = allFiles
    .filter((file) => !reachable.has(file))
    .map((file) => toRepoRelative(root, file))
    .sort();

  const known = new Set(knownUnreachable);
  const unexpected = unreachable.filter((file) => !known.has(file));
  const staleKnown = knownUnreachable.filter((file) => !unreachable.includes(file));

  if (staleKnown.length > 0) {
    errors.push(
      `${label}: known unreachable baseline is stale; remove wired/deleted path(s):\n` +
        staleKnown.map((file) => `  - ${file}`).join('\n'),
    );
  }

  if (unexpected.length > 0) {
    errors.push(
      `${label}: ${unexpected.length} module(s) are not reachable from ${entries.join(', ')}:\n` +
        unexpected.map((file) => `  - ${file}`).join('\n'),
    );
  }
}

for (const target of rustTargets) {
  checkRustTarget(target);
}

for (const target of tsTargets) {
  checkTsTarget(target);
}

if (errors.length > 0) {
  console.error('Module reachability check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Module reachability check passed for Rust crate roots and TypeScript surfaces.');
