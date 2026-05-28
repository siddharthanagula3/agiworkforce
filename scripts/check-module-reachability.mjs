#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

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
    knownUnreachable: [
      'apps/desktop/src-tauri/src/automation/computer_use/action_executor.rs',
      'apps/desktop/src-tauri/src/automation/computer_use/anthropic_agent.rs',
      'apps/desktop/src-tauri/src/automation/computer_use/consent.rs',
      'apps/desktop/src-tauri/src/commands/mod.rs',
      'apps/desktop/src-tauri/src/core/agi/checkpoint_integration_example.rs',
      'apps/desktop/src-tauri/src/core/agi/executors/deploy_executor.rs',
      'apps/desktop/src-tauri/src/core/hooks/config.rs',
      'apps/desktop/src-tauri/src/core/hooks/error.rs',
      'apps/desktop/src-tauri/src/core/hooks/event.rs',
      'apps/desktop/src-tauri/src/core/hooks/executor.rs',
      'apps/desktop/src-tauri/src/core/hooks/mod.rs',
      'apps/desktop/src-tauri/src/core/hooks/tests.rs',
      'apps/desktop/src-tauri/src/core/llm/council.rs',
      'apps/desktop/src-tauri/src/core/orchestration/email_trigger_service.rs',
      'apps/desktop/src-tauri/src/core/research/subtask_executor.rs',
      'apps/desktop/src-tauri/src/core/research/swarm_bridge.rs',
      'apps/desktop/src-tauri/src/core/research/swarm_orchestrator.rs',
      'apps/desktop/src-tauri/src/core/research/web_search_config.rs',
      'apps/desktop/src-tauri/src/data/state/draft_manager.rs',
      'apps/desktop/src-tauri/src/features/tasks/examples.rs',
      'apps/desktop/src-tauri/src/features/tests/agi_tests.rs',
      'apps/desktop/src-tauri/src/platform/mod.rs',
      'apps/desktop/src-tauri/src/sys/commands/chat/context_monitor.rs',
    ],
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
  const source = readText(currentFile);
  const pathOverride = rustPathAttribute(source, moduleName);
  const candidates = pathOverride
    ? [path.resolve(currentDir, pathOverride)]
    : [path.join(currentDir, `${moduleName}.rs`), path.join(currentDir, moduleName, 'mod.rs')];

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

for (const target of rustTargets) {
  checkRustTarget(target);
}

if (errors.length > 0) {
  console.error('Module reachability check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Module reachability check passed for Rust crate roots.');
