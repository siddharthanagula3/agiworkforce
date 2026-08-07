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

/**
 * TypeScript reachability targets.
 *
 * This check covered Rust only, which is why the UNWIRED class accumulated
 * almost entirely in TypeScript: the 2026-08-05 audit found ~26 complete
 * components with no mount point, and nothing mechanical could see them. A
 * lexical "the file exists" check reports green for a module no entry point can
 * ever load; a reachability walk from the real entry point cannot.
 *
 * `knownUnreachable` is a RATCHET, matching the Rust targets above and
 * `reference-integrity-allowlist.json`: an entry that stops reproducing fails
 * as stale, so deleting or wiring a module forces its baseline line out in the
 * same commit. The list may only shrink.
 */
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
    // BASELINE seeded 2026-08-06 from the first TypeScript run of this check.
    //
    // These are NOT approved. They are the pre-existing debt this gate exists
    // to drain, captured so the check can go green and then only ratchet down.
    // Each one is a module `main.tsx` cannot reach: either wire it or cut it,
    // and delete its line here in the same commit. Adding a line to this list
    // is a regression and needs a reviewer to say why.
    knownUnreachable: [
      'apps/desktop/src/api/apiManagement.ts',
      'apps/desktop/src/api/automation.ts',
      'apps/desktop/src/api/automationEnhanced.ts',
      'apps/desktop/src/api/backgroundTasks.ts',
      'apps/desktop/src/api/cache.ts',
      'apps/desktop/src/api/chat.ts',
      'apps/desktop/src/api/design.ts',
      'apps/desktop/src/api/email.ts',
      'apps/desktop/src/api/embeddings.ts',
      'apps/desktop/src/api/fileOps.ts',
      'apps/desktop/src/api/index.ts',
      'apps/desktop/src/api/lsp.ts',
      'apps/desktop/src/api/media.ts',
      'apps/desktop/src/api/metrics.ts',
      'apps/desktop/src/api/migration.ts',
      'apps/desktop/src/api/ocr.ts',
      'apps/desktop/src/api/onboarding.ts',
      'apps/desktop/src/api/orchestrator.ts',
      'apps/desktop/src/api/privacy.ts',
      'apps/desktop/src/api/productivity.ts',
      'apps/desktop/src/api/projectMemory.ts',
      'apps/desktop/src/api/screenWatcher.ts',
      'apps/desktop/src/api/taskPersistence.ts',
      'apps/desktop/src/api/teamsApi.ts',
      'apps/desktop/src/api/terminal.ts',
      'apps/desktop/src/api/tutorials.ts',
      'apps/desktop/src/api/undo.ts',
      'apps/desktop/src/api/workflow.ts',
      'apps/desktop/src/components/ui/AccessibleDialog.tsx',
      'apps/desktop/src/components/ui/Accordion.tsx',
      'apps/desktop/src/components/ui/Collapsible.tsx',
      'apps/desktop/src/components/ui/ContextMenu.tsx',
      'apps/desktop/src/components/ui/FormField.tsx',
      'apps/desktop/src/components/ui/HoverCard.tsx',
      'apps/desktop/src/components/ui/LoadingButton.tsx',
      'apps/desktop/src/components/ui/ResponsiveContainer.tsx',
      'apps/desktop/src/components/ui/Table.tsx',
      'apps/desktop/src/components/ui/index.ts',
      'apps/desktop/src/constants/index.ts',
      'apps/desktop/src/constants/timeouts.ts',
      'apps/desktop/src/core/index.ts',
      'apps/desktop/src/data/index.ts',
      'apps/desktop/src/features/agent-collaboration/AgentCollaborationPanel.tsx',
      'apps/desktop/src/features/agent-collaboration/index.ts',
      'apps/desktop/src/features/agi/IterationProgressPanel.tsx',
      'apps/desktop/src/features/agi/ProgressIndicator.tsx',
      'apps/desktop/src/features/agi/ReflectionInsightCard.tsx',
      'apps/desktop/src/features/agi/index.ts',
      'apps/desktop/src/features/agi/reflectionTypes.ts',
      'apps/desktop/src/features/analytics/CostDashboard.tsx',
      'apps/desktop/src/features/analytics/CostSidebarWidget.tsx',
      'apps/desktop/src/features/analytics/UsageDashboard.tsx',
      'apps/desktop/src/features/analytics/index.ts',
      'apps/desktop/src/features/artifacts/ArtifactCategoryFilter.tsx',
      'apps/desktop/src/features/artifacts/ArtifactToolbar.tsx',
      'apps/desktop/src/features/artifacts/ArtifactsGallery.tsx',
      'apps/desktop/src/features/artifacts/index.ts',
      'apps/desktop/src/features/auth/index.ts',
      'apps/desktop/src/features/background-tasks/BackgroundTaskIndicator.tsx',
      'apps/desktop/src/features/background-tasks/BackgroundTasksPanel.tsx',
      'apps/desktop/src/features/background-tasks/index.tsx',
      'apps/desktop/src/features/browser/BrowserDebugTabs.tsx',
      'apps/desktop/src/features/browser/BrowserReplayViewer.tsx',
      'apps/desktop/src/features/browser/index.ts',
      'apps/desktop/src/features/canvas/ArtifactList.tsx',
      'apps/desktop/src/features/canvas/ArtifactPreview.tsx',
      'apps/desktop/src/features/canvas/CanvasContainer.tsx',
      'apps/desktop/src/features/canvas/CanvasPanel.tsx',
      'apps/desktop/src/features/canvas/CodeEditor.tsx',
      'apps/desktop/src/features/canvas/index.ts',
      'apps/desktop/src/features/custom-instructions/CustomInstructionsDialog.tsx',
      'apps/desktop/src/features/custom-instructions/index.ts',
      'apps/desktop/src/features/document/DocumentWorkspace.tsx',
      'apps/desktop/src/features/document/index.ts',
      'apps/desktop/src/features/dynamic-canvas/DynamicCanvas.tsx',
      'apps/desktop/src/features/dynamic-canvas/index.ts',
      'apps/desktop/src/features/editing/ChangeSummary.tsx',
      'apps/desktop/src/features/editing/ConflictResolver.tsx',
      'apps/desktop/src/features/editing/EnhancedDiffViewer.tsx',
      'apps/desktop/src/features/editing/FileTreeWithChanges.tsx',
      'apps/desktop/src/features/editing/index.ts',
      'apps/desktop/src/features/errors/index.ts',
      'apps/desktop/src/features/execution-sidecar/index.ts',
      'apps/desktop/src/features/execution/BrowserPanel.tsx',
      'apps/desktop/src/features/execution/FilesPanel.tsx',
      'apps/desktop/src/features/execution/ReflectionPanel.tsx',
      'apps/desktop/src/features/execution/TerminalPanel.tsx',
      'apps/desktop/src/features/execution/ThinkingPanel.tsx',
      'apps/desktop/src/features/execution/TimeoutWarningBanner.tsx',
      'apps/desktop/src/features/execution/index.ts',
      'apps/desktop/src/features/feedback/FeedbackDialog.tsx',
      'apps/desktop/src/features/feedback/MessageFeedbackButtons.tsx',
      'apps/desktop/src/features/feedback/index.ts',
      'apps/desktop/src/features/file-upload/FileDownloadButton.tsx',
      'apps/desktop/src/features/file-upload/FileDropZone.tsx',
      'apps/desktop/src/features/file-upload/FilePreviewModal.tsx',
      'apps/desktop/src/features/file-upload/FileUploadButton.tsx',
      'apps/desktop/src/features/file-upload/PDFViewer.tsx',
      'apps/desktop/src/features/file-upload/index.tsx',
      'apps/desktop/src/features/git/GitCommitDialog.tsx',
      'apps/desktop/src/features/git/GitDiffViewer.tsx',
      'apps/desktop/src/features/git/GitPanel.tsx',
      'apps/desktop/src/features/git/GitStatusPanel.tsx',
      'apps/desktop/src/features/git/index.ts',
      'apps/desktop/src/features/index.ts',
      'apps/desktop/src/features/layout/BudgetStatusWidget.tsx',
      'apps/desktop/src/features/layout/TitleBar.tsx',
      'apps/desktop/src/features/layout/UserProfile.tsx',
      'apps/desktop/src/features/layout/index.ts',
      'apps/desktop/src/features/mcp/MCPConnectionStatus.tsx',
      'apps/desktop/src/features/mcp/MCPLogsViewer.tsx',
      'apps/desktop/src/features/mcp/MCPServerBrowser.tsx',
      'apps/desktop/src/features/mcp/MCPServerManager.tsx',
      'apps/desktop/src/features/mcp/MCPToolExplorer.tsx',
      'apps/desktop/src/features/mcp/index.tsx',
      'apps/desktop/src/features/media/MediaGenerationProgress.tsx',
      'apps/desktop/src/features/media/model-options.ts',
      'apps/desktop/src/features/memory/MemoryBadge.tsx',
      'apps/desktop/src/features/memory/MemoryBrowserModal.tsx',
      'apps/desktop/src/features/memory/MemoryImportanceIndicator.tsx',
      'apps/desktop/src/features/memory/MemoryViewer.tsx',
      'apps/desktop/src/features/memory/SaveToMemoryButton.tsx',
      'apps/desktop/src/features/memory/index.ts',
      'apps/desktop/src/features/messaging/MessageComposer.tsx',
      'apps/desktop/src/features/messaging/MessageHistory.tsx',
      'apps/desktop/src/features/messaging/MessagingIntegrations.tsx',
      'apps/desktop/src/features/messaging/index.ts',
      'apps/desktop/src/features/notifications/NotificationCenter.tsx',
      'apps/desktop/src/features/notifications/index.ts',
      'apps/desktop/src/features/onboarding/OnboardingWelcome.tsx',
      'apps/desktop/src/features/outcomes/GoalOutcomes.tsx',
      'apps/desktop/src/features/outcomes/OutcomesDashboard.tsx',
      'apps/desktop/src/features/outcomes/index.ts',
      'apps/desktop/src/features/reminders/ReminderCard.tsx',
      'apps/desktop/src/features/reminders/ReminderDialog.tsx',
      'apps/desktop/src/features/reminders/ReminderList.tsx',
      'apps/desktop/src/features/reminders/index.ts',
      'apps/desktop/src/features/research/index.ts',
      'apps/desktop/src/features/roi-dashboard/components/BigStatCard.tsx',
      'apps/desktop/src/features/roi-dashboard/components/ComparisonSection.tsx',
      'apps/desktop/src/features/roi-dashboard/components/CostSavedChart.tsx',
      'apps/desktop/src/features/roi-dashboard/components/ExportReportModal.tsx',
      'apps/desktop/src/features/roi-dashboard/components/LiveIndicator.tsx',
      'apps/desktop/src/features/roi-dashboard/components/MilestoneToast.tsx',
      'apps/desktop/src/features/roi-dashboard/components/RealtimeROIDashboard.tsx',
      'apps/desktop/src/features/roi-dashboard/components/RecentActivityFeed.tsx',
      'apps/desktop/src/features/roi-dashboard/components/TimeSavedChart.tsx',
      'apps/desktop/src/features/roi-dashboard/components/index.ts',
      'apps/desktop/src/features/roi-dashboard/roiStore.ts',
      'apps/desktop/src/features/scheduler/JobCreationDialog.tsx',
      'apps/desktop/src/features/scheduler/SchedulerPanel.tsx',
      'apps/desktop/src/features/scheduler/index.ts',
      'apps/desktop/src/features/schedules/ScheduleEditor.tsx',
      'apps/desktop/src/features/screen-capture/CapturePreview.tsx',
      'apps/desktop/src/features/screen-capture/OCRViewer.tsx',
      'apps/desktop/src/features/screen-capture/index.ts',
      'apps/desktop/src/features/settings/FontSelector.tsx',
      'apps/desktop/src/features/settings/MCPToolsSettings.tsx',
      'apps/desktop/src/features/settings/TeamAccountSettings.tsx',
      'apps/desktop/src/features/settings/index.ts',
      'apps/desktop/src/features/settings/tabs/Skills/index.tsx',
      'apps/desktop/src/features/simple-mode/SimpleModeToggle.tsx',
      'apps/desktop/src/features/simple-mode/index.ts',
      'apps/desktop/src/features/subscription/SubscriptionGate.tsx',
      'apps/desktop/src/features/subscription/SubscriptionLockDialog.tsx',
      'apps/desktop/src/features/subscription/index.ts',
      'apps/desktop/src/features/teams/TeamActivityLog.tsx',
      'apps/desktop/src/features/teams/TeamInvitation.tsx',
      'apps/desktop/src/features/teams/TeamMemberList.tsx',
      'apps/desktop/src/features/teams/TeamSettings.tsx',
      'apps/desktop/src/features/voice/VoiceMicButton.tsx',
      'apps/desktop/src/features/voice/index.ts',
      'apps/desktop/src/features/workflows/WorkflowBuilder.tsx',
      'apps/desktop/src/features/workflows/WorkflowPanel.tsx',
      'apps/desktop/src/features/workflows/index.ts',
      'apps/desktop/src/hooks/useApiPromptCompletion.ts',
      'apps/desktop/src/hooks/useBackgroundTasks.ts',
      'apps/desktop/src/hooks/useExtensionEvents.ts',
      'apps/desktop/src/hooks/useGit.ts',
      'apps/desktop/src/hooks/useGlobalSearch.ts',
      'apps/desktop/src/hooks/useKeyboardShortcuts.ts',
      'apps/desktop/src/hooks/useLSP.ts',
      'apps/desktop/src/hooks/useOCR.ts',
      'apps/desktop/src/hooks/usePromptSuggestions.ts',
      'apps/desktop/src/hooks/useScheduler.ts',
      'apps/desktop/src/hooks/useTTS.ts',
      'apps/desktop/src/hooks/useTerminal.ts',
      'apps/desktop/src/hooks/useWorkflows.ts',
      'apps/desktop/src/integrations/index.ts',
      'apps/desktop/src/integrations/realtime/index.ts',
      'apps/desktop/src/integrations/realtime/presenceBridge.ts',
      'apps/desktop/src/lib/browserAutomation.ts',
      'apps/desktop/src/lib/byok-vault.ts',
      'apps/desktop/src/lib/friendlyErrors.ts',
      'apps/desktop/src/lib/messageActivity.ts',
      'apps/desktop/src/lib/newChatReset.ts',
      'apps/desktop/src/lib/retry.ts',
      'apps/desktop/src/lib/skillLoader.ts',
      'apps/desktop/src/lib/streamContentRuntime.ts',
      'apps/desktop/src/lib/tauri-electron/bridgeContract.ts',
      'apps/desktop/src/lib/tauri-electron/core.ts',
      'apps/desktop/src/lib/tauri-electron/deep-link.ts',
      'apps/desktop/src/lib/tauri-electron/dialog.ts',
      'apps/desktop/src/lib/tauri-electron/notification.ts',
      'apps/desktop/src/lib/tauri-electron/process.ts',
      'apps/desktop/src/lib/tauri-electron/shell.ts',
      'apps/desktop/src/lib/tauri-electron/updater.ts',
      'apps/desktop/src/lib/tauri-electron/window.ts',
      'apps/desktop/src/lib/tauri-web/core.ts',
      'apps/desktop/src/lib/tauri-web/deep-link.ts',
      'apps/desktop/src/lib/tauri-web/dialog.ts',
      'apps/desktop/src/lib/tauri-web/event.ts',
      'apps/desktop/src/lib/tauri-web/fs.ts',
      'apps/desktop/src/lib/tauri-web/notification.ts',
      'apps/desktop/src/lib/tauri-web/path.ts',
      'apps/desktop/src/lib/tauri-web/process.ts',
      'apps/desktop/src/lib/tauri-web/shell.ts',
      'apps/desktop/src/lib/tauri-web/updater.ts',
      'apps/desktop/src/lib/tauri-web/window.ts',
      'apps/desktop/src/lib/toolMatcher.ts',
      'apps/desktop/src/platform/index.ts',
      'apps/desktop/src/services/analyticsQueries.ts',
      'apps/desktop/src/services/applyPatch.ts',
      'apps/desktop/src/services/mcp.ts',
      'apps/desktop/src/services/templateService.ts',
      'apps/desktop/src/services/websocketClient.ts',
      'apps/desktop/src/stores/analyticsStore.ts',
      'apps/desktop/src/stores/bridge/stateBridge.ts',
      'apps/desktop/src/stores/cacheStore.ts',
      'apps/desktop/src/stores/calendarStore.ts',
      'apps/desktop/src/stores/chatPreferencesStore.ts',
      'apps/desktop/src/stores/editingStore.ts',
      'apps/desktop/src/stores/filesystemStore.ts',
      'apps/desktop/src/stores/mcp/index.ts',
      'apps/desktop/src/stores/mediaGenerationStore.ts',
      'apps/desktop/src/stores/notificationStore.ts',
      'apps/desktop/src/stores/promptStashStore.ts',
      'apps/desktop/src/stores/roiStore.ts',
      'apps/desktop/src/stores/schedulesStore.ts',
      'apps/desktop/src/stores/teamStore.ts',
      'apps/desktop/src/stores/templateStore.ts',
      'apps/desktop/src/stores/thinkingStore.ts',
      'apps/desktop/src/stores/windowStore.ts',
      'apps/desktop/src/stores/workflowStore.ts',
      'apps/desktop/src/types/automation.ts',
      'apps/desktop/src/types/automationEnhanced.ts',
      'apps/desktop/src/types/calendar.ts',
      'apps/desktop/src/types/chatEvents.ts',
      'apps/desktop/src/types/configurator.ts',
      'apps/desktop/src/types/email.ts',
      'apps/desktop/src/types/governance.ts',
      'apps/desktop/src/types/marketplace.ts',
      'apps/desktop/src/types/media.ts',
      'apps/desktop/src/types/migration.ts',
      'apps/desktop/src/types/pricing.ts',
      'apps/desktop/src/types/roi.ts',
      'apps/desktop/src/types/teams.ts',
      'apps/desktop/src/types/templates.ts',
      'apps/desktop/src/types/workflow.ts',
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
      'apps/desktop/src/utils/credits.ts',
      'apps/desktop/src/utils/fileUtils.ts',
      'apps/desktop/src/utils/permissions.ts',
      'apps/desktop/src/utils/subscriptionGate.ts',
      'apps/desktop/src/utils/tokenCount.ts',
      'apps/desktop/src/utils/validation.ts',
    ],
  },
];

function checkTsTarget({ label, sourceRoot, entries, aliases, knownUnreachable }) {
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

  // Tests and their fixtures are entry points in their own right (vitest loads
  // them directly), so they are never "unreachable" in the sense this guards.
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
