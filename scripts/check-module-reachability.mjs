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
    entries: ['apps/desktop/src/main.tsx'],
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
    knownUnreachable: [
      'apps/desktop/src/api/productivity.ts',
      'apps/desktop/src/constants/index.ts',
      'apps/desktop/src/core/index.ts',
      'apps/desktop/src/data/index.ts',
      'apps/desktop/src/features/agi/IterationProgressPanel.tsx',
      'apps/desktop/src/features/agi/ProgressIndicator.tsx',
      'apps/desktop/src/features/agi/ReflectionInsightCard.tsx',
      'apps/desktop/src/features/agi/index.ts',
      'apps/desktop/src/features/agi/reflectionTypes.ts',
      'apps/desktop/src/features/auth/index.ts',
      'apps/desktop/src/features/browser/BrowserDebugTabs.tsx',
      'apps/desktop/src/features/browser/BrowserReplayViewer.tsx',
      'apps/desktop/src/features/browser/index.ts',
      'apps/desktop/src/features/document/DocumentWorkspace.tsx',
      'apps/desktop/src/features/document/index.ts',
      'apps/desktop/src/features/errors/index.ts',
      'apps/desktop/src/features/execution-sidecar/index.ts',
      'apps/desktop/src/features/execution/BrowserPanel.tsx',
      'apps/desktop/src/features/execution/FilesPanel.tsx',
      'apps/desktop/src/features/execution/ReflectionPanel.tsx',
      'apps/desktop/src/features/execution/TerminalPanel.tsx',
      'apps/desktop/src/features/execution/ThinkingPanel.tsx',
      'apps/desktop/src/features/execution/index.ts',
      'apps/desktop/src/features/git/index.ts',
      'apps/desktop/src/features/index.ts',
      'apps/desktop/src/features/onboarding/OnboardingWelcome.tsx',
      'apps/desktop/src/features/research/index.ts',
      'apps/desktop/src/features/scheduler/index.ts',
      'apps/desktop/src/features/screen-capture/index.ts',
      'apps/desktop/src/features/settings/index.ts',
      'apps/desktop/src/features/simple-mode/SimpleModeToggle.tsx',
      'apps/desktop/src/features/simple-mode/index.ts',
      'apps/desktop/src/features/subscription/SubscriptionGate.tsx',
      'apps/desktop/src/features/subscription/SubscriptionLockDialog.tsx',
      'apps/desktop/src/features/subscription/index.ts',
      'apps/desktop/src/features/voice/VoiceMicButton.tsx',
      'apps/desktop/src/features/voice/index.ts',
      'apps/desktop/src/hooks/useKeyboardShortcuts.ts',
      'apps/desktop/src/hooks/usePromptSuggestions.ts',
      'apps/desktop/src/lib/browserAutomation.ts',
      'apps/desktop/src/lib/messageActivity.ts',
      'apps/desktop/src/lib/retry.ts',
      'apps/desktop/src/lib/skillLoader.ts',
      'apps/desktop/src/lib/streamContentRuntime.ts',
      'apps/desktop/src/lib/tauri-electron/core.ts',
      'apps/desktop/src/lib/tauri-electron/deep-link.ts',
      'apps/desktop/src/lib/tauri-electron/dialog.ts',
      'apps/desktop/src/lib/tauri-electron/process.ts',
      'apps/desktop/src/lib/tauri-electron/shell.ts',
      'apps/desktop/src/lib/tauri-electron/updater.ts',
      'apps/desktop/src/lib/tauri-electron/window.ts',
      'apps/desktop/src/lib/tauri-web/core.ts',
      'apps/desktop/src/lib/tauri-web/deep-link.ts',
      'apps/desktop/src/lib/tauri-web/dialog.ts',
      'apps/desktop/src/lib/tauri-web/event.ts',
      'apps/desktop/src/lib/tauri-web/fs.ts',
      'apps/desktop/src/lib/tauri-web/path.ts',
      'apps/desktop/src/lib/tauri-web/process.ts',
      'apps/desktop/src/lib/tauri-web/shell.ts',
      'apps/desktop/src/lib/tauri-web/updater.ts',
      'apps/desktop/src/lib/tauri-web/window.ts',
      'apps/desktop/src/platform/index.ts',
      'apps/desktop/src/services/applyPatch.ts',
      'apps/desktop/src/services/mcp.ts',
      'apps/desktop/src/stores/promptStashStore.ts',
      'apps/desktop/src/stores/roiStore.ts',
      'apps/desktop/src/types/automation.ts',
      'apps/desktop/src/types/automationEnhanced.ts',
      'apps/desktop/src/types/chatEvents.ts',
      'apps/desktop/src/types/configurator.ts',
      'apps/desktop/src/types/governance.ts',
      'apps/desktop/src/types/marketplace.ts',
      'apps/desktop/src/types/migration.ts',
      'apps/desktop/src/types/pricing.ts',
      'apps/desktop/src/types/roi.ts',
      'apps/desktop/src/ui/AccessibleDialog.tsx',
      'apps/desktop/src/ui/Accordion.tsx',
      'apps/desktop/src/ui/Collapsible.tsx',
      'apps/desktop/src/ui/ContextMenu.tsx',
      'apps/desktop/src/ui/FormField.tsx',
      'apps/desktop/src/ui/HoverCard.tsx',
      'apps/desktop/src/ui/LoadingButton.tsx',
      'apps/desktop/src/ui/ResponsiveContainer.tsx',
      'apps/desktop/src/ui/Table.tsx',
      'apps/desktop/src/ui/index.ts',
      'apps/desktop/src/utils/autoCorrection.ts',
      'apps/desktop/src/utils/fileUtils.ts',
      'apps/desktop/src/utils/permissions.ts',
      'apps/desktop/src/utils/subscriptionGate.ts',
      'apps/desktop/src/utils/tokenCount.ts',
      'apps/desktop/src/utils/validation.ts',
    ],
    maxKnownUnreachable: 91,
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
