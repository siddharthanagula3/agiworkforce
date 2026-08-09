#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const errors = [];
const ignoredParts = new Set([
  'node_modules',
  'dist',
  'ios',
  '.expo',
  '.cache',
  'coverage',
  'build',
  'out',
  'target',
  '.git',
  '.next',
  '.turbo',
]);

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function walk(relativeDir, files = []) {
  const absoluteDir = path.join(root, relativeDir);
  if (!fs.existsSync(absoluteDir)) return files;

  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    if (ignoredParts.has(entry.name)) continue;
    const relativePath = path.posix.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      walk(relativePath, files);
      continue;
    }
    files.push(relativePath);
  }

  return files;
}

function requireIncludes(relativePath, expected) {
  if (!exists(relativePath)) {
    errors.push(`Missing required structure doc: ${relativePath}`);
    return;
  }

  const body = readText(relativePath);
  if (!body.includes(expected)) {
    errors.push(`${relativePath} must include ${JSON.stringify(expected)}`);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function workspaceTextFiles() {
  const output = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
  });
  const textExtensions = new Set([
    '.cjs',
    '.css',
    '.html',
    '.js',
    '.json',
    '.jsx',
    '.md',
    '.mjs',
    '.rs',
    '.scss',
    '.sh',
    '.toml',
    '.ts',
    '.tsx',
    '.txt',
    '.yaml',
    '.yml',
  ]);
  const textBasenames = new Set(['CODEOWNERS', 'Dockerfile', 'pnpm-lock.yaml']);

  return [...new Set(output.split('\n'))]
    .filter(Boolean)
    .filter(exists)
    .filter(
      (file) => textExtensions.has(path.extname(file)) || textBasenames.has(path.basename(file)),
    );
}

const completedPackageRenames = [
  {
    retiredPath: ['packages', 'runtime'].join('/'),
    canonicalPath: 'packages/client/client-runtime',
    retiredPackage: ['@agiworkforce', 'runtime'].join('/'),
    canonicalPackage: '@agiworkforce/client-runtime',
    requiredExports: ['.', './node', './state', './queue', './offline-queue', './offline-sync'],
  },
  {
    retiredPath: ['packages', 'api'].join('/'),
    canonicalPath: 'packages/client/desktop-command-client',
    retiredPackage: ['@agiworkforce', 'api'].join('/'),
    canonicalPackage: '@agiworkforce/desktop-command-client',
    requiredExports: ['.'],
  },
];

const trackedTextFiles = workspaceTextFiles();

// T-wave regrouping moved shared packages under stable domain groups. A plain
// existence check is insufficient for names such as `packages/ui`: that old
// package path now exists as a grouping directory, so stale comments and docs
// can look valid while pointing developers at the wrong owner. Scan active
// operational sources and current docs, while preserving point-in-time plans,
// decisions, research, and changelog history.
const activeOperationalFiles = trackedTextFiles.filter((file) => {
  if (file === 'scripts/check-structure-conventions.mjs') return false;

  if (
    file === 'AGENTS.md' ||
    file === 'CLAUDE.md' ||
    file === 'PLAN.md' ||
    file === 'README.md' ||
    file === 'TODO.md'
  ) {
    return true;
  }

  return [
    '.github/',
    'apps/',
    'crates/',
    'infrastructure/',
    'packages/',
    'scripts/',
    'services/',
    'tools/',
    'docs/agent-context/',
    'docs/current/',
    'docs/design/',
    'docs/engineering/',
    'docs/enterprise/',
    'docs/launch/',
    'docs/marketing/',
    'docs/surfaces/',
  ].some((prefix) => file.startsWith(prefix));
});

const completedPackageRegroupMoves = [
  ['packages/types', 'packages/contracts/types'],
  ['packages/model-registry', 'packages/ai/model-registry'],
  ['packages/providers', 'packages/ai/providers'],
  ['packages/llm-runtime', 'packages/ai/provider-runtime'],
  ['packages/llm-normalize', 'packages/ai/provider-protocol'],
  ['packages/routing', 'packages/ai/routing'],
  ['packages/search', 'packages/ai/search'],
  ['packages/cloud-contracts', 'packages/contracts/cloud-contracts'],
  ['packages/compliance', 'packages/contracts/compliance'],
  ['packages/licensing', 'packages/contracts/licensing'],
  ['packages/trust-boundaries', 'packages/contracts/trust-boundaries'],
  ['packages/client-runtime', 'packages/client/client-runtime'],
  ['packages/desktop-command-client', 'packages/client/desktop-command-client'],
  ['packages/sync', 'packages/client/sync'],
  ['packages/design-tokens', 'packages/ui/design-tokens'],
  ['packages/ui/src', 'packages/ui/ui/src'],
  ['packages/unified-chat', 'packages/ui/unified-chat'],
  ['packages/mcp', 'packages/tools/mcp'],
  ['packages/skills', 'packages/tools/skills'],
  ['packages/apply-patch', 'packages/tools/apply-patch'],
  ['packages/browser-tool', 'packages/tools/browser-tool'],
  ['packages/artifacts', 'packages/platform/artifacts'],
  ['packages/data-layer', 'packages/platform/data-layer'],
  ['packages/local-llm', 'packages/platform/local-llm'],
  ['packages/utils', 'packages/platform/utils'],
];

for (const [retiredPath, canonicalPath] of completedPackageRegroupMoves) {
  const pattern = new RegExp(`${escapeRegExp(retiredPath)}(?![-\\w])`, 'i');
  for (const file of activeOperationalFiles) {
    if (pattern.test(readText(file))) {
      errors.push(
        `${file} contains stale pre-regroup package path ${retiredPath}; use ${canonicalPath}.`,
      );
    }
  }
}

const completedPackageRegroupRenames = [
  ['@agiworkforce/llm-runtime', '@agiworkforce/provider-runtime'],
  ['@agiworkforce/llm-normalize', '@agiworkforce/provider-protocol'],
];

for (const [retiredPackage, canonicalPackage] of completedPackageRegroupRenames) {
  const pattern = new RegExp(`${escapeRegExp(retiredPackage)}(?![-\\w])`, 'i');
  for (const file of activeOperationalFiles) {
    if (pattern.test(readText(file))) {
      errors.push(
        `${file} contains stale pre-regroup package name ${retiredPackage}; use ${canonicalPackage}.`,
      );
    }
  }
}

for (const rename of completedPackageRenames) {
  if (exists(rename.retiredPath)) {
    errors.push(
      `Interrupted package rename: ${rename.retiredPath} still exists; only ${rename.canonicalPath} is allowed.`,
    );
  }

  const canonicalManifestPath = `${rename.canonicalPath}/package.json`;
  if (!exists(canonicalManifestPath)) {
    errors.push(`Interrupted package rename: missing ${canonicalManifestPath}.`);
    continue;
  }

  const canonicalManifest = JSON.parse(readText(canonicalManifestPath));
  if (canonicalManifest.name !== rename.canonicalPackage) {
    errors.push(
      `${canonicalManifestPath} must be named ${rename.canonicalPackage}, found ${String(canonicalManifest.name)}.`,
    );
  }

  const actualExports =
    typeof canonicalManifest.exports === 'string'
      ? ['.']
      : Object.keys(canonicalManifest.exports ?? {});
  for (const requiredExport of rename.requiredExports) {
    if (!actualExports.includes(requiredExport)) {
      errors.push(`${canonicalManifestPath} lost required compatibility export ${requiredExport}.`);
    }
  }

  const retiredMarkers = [rename.retiredPath, rename.retiredPackage].map((marker) => ({
    marker,
    pattern: new RegExp(`${escapeRegExp(marker)}(?![-\\w])`, 'i'),
  }));
  for (const file of trackedTextFiles) {
    const lowerFile = file.toLowerCase();
    const retiredPathPrefix = `${rename.retiredPath.toLowerCase()}/`;
    const canonicalPathPrefix = `${rename.canonicalPath.toLowerCase()}/`;
    if (lowerFile.startsWith(retiredPathPrefix)) {
      errors.push(`${file} remains under retired or case-variant path ${rename.retiredPath}.`);
    }
    if (lowerFile.startsWith(canonicalPathPrefix) && !file.startsWith(`${rename.canonicalPath}/`)) {
      errors.push(`${file} uses incorrect path casing; expected ${rename.canonicalPath}/...`);
    }

    const body = readText(file);
    for (const retiredMarker of retiredMarkers) {
      if (retiredMarker.pattern.test(body)) {
        errors.push(
          `${file} contains stale reference to completed package rename marker ${retiredMarker.marker}.`,
        );
      }
    }
  }

  const lockfile = readText('pnpm-lock.yaml').toLowerCase();
  const retiredRelativeLink = ['link:', '..', '/', rename.retiredPath.split('/').at(-1)].join('');
  if (lockfile.includes(retiredRelativeLink)) {
    errors.push(`pnpm-lock.yaml contains stale package link ${retiredRelativeLink}.`);
  }
}

// The orphan apps/web/src skeleton was deleted in the W8 dead-code sweep
// (2026-07-15). Web product code lives in apps/web/{app,features,components,
// lib}; a reappearing src/ tree is a structure regression.
if (exists('apps/web/src')) {
  errors.push('apps/web/src was deleted in W8 and must not reappear (use apps/web/features)');
}

if (exists('apps/web/.feature-migration')) {
  errors.push(
    'Temporary Web feature migration directory must not exist: apps/web/.feature-migration',
  );
}

if (exists('.github/workflows/cli-release.yml')) {
  errors.push(
    'Duplicate CLI release workflow must stay removed; use .github/workflows/release-cli.yml.',
  );
}

const forbiddenFeatureMarkers = [
  'src/features/',
  'Barrel re-export',
  'Do not add new code here',
  'Migrated from apps/web/features',
];

for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (entry.name.includes('\\')) {
    errors.push(`Root entry contains a backslash and must be renamed or removed: ${entry.name}`);
  }
}

if (exists('docs/planning')) {
  errors.push(
    'Use docs/plans for active plans or docs/archive for historical plans; docs/planning is retired.',
  );
}

const retiredTopLevelDocs = [
  'ARCHITECTURE.md',
  'BILLION_DOLLAR_PLAYBOOK.md',
  'HANDOFF.md',
  'HOSTING.md',
  'OWNERSHIP.md',
  'PERFORMANCE.md',
  'PRD-APPENDIX-A-DATA-MODELS.md',
  'PRD-APPENDIX-B-API-CONTRACTS.md',
  'PRD-APPENDIX-C-MONOREPO-LAYOUT.md',
  'PRD-APPENDIX-D-SCALING-OBSERVABILITY-COMPLIANCE.md',
  'PRD-MOBILE.md',
  'PRD-RESOLUTIONS-AND-AUDIT.md',
  'PRD.md',
  'PRICING.md',
  'ROADMAP.md',
  'SCALING.md',
  'VISION.md',
  'cli-binary-size-2026-05-15.md',
];

for (const docName of retiredTopLevelDocs) {
  const retiredPath = `docs/${docName}`;
  if (exists(retiredPath)) {
    errors.push(`Retired top-level doc must stay archived, not active: ${retiredPath}`);
  }
}

const activeReferencePaths = [
  'README.md',
  'ONBOARDING.md',
  'AGI_WORKFORCE.md',
  'docs/README.md',
  ...walk('docs/current'),
  ...walk('docs/surfaces'),
  ...walk('docs/decisions'),
  ...walk('docs/engineering'),
  ...walk('docs/enterprise'),
  ...walk('docs/marketing'),
  ...walk('docs/design'),
  ...walk('docs/research'),
  'apps/mobile/README.md',
  'packages/platform/data-layer/README.md',
  ...walk('packages/platform/data-layer/src'),
  ...walk('packages/ui/unified-chat/src'),
  'apps/web/app/api/me/route.ts',
  'apps/desktop/src-tauri/src/sys/commands/migration.rs',
  'apps/extension/THREAT_MODEL.md',
  'apps/mobile/src/features/onboarding/components/ByokConsentModal.tsx',
].filter((file, index, all) => exists(file) && all.indexOf(file) === index);

for (const file of activeReferencePaths) {
  if (!/\.(md|ts|tsx|rs)$/.test(file)) continue;
  const body = readText(file);
  for (const docName of retiredTopLevelDocs) {
    for (const marker of [`docs/${docName}`, `../${docName}`, `/docs/${docName}`]) {
      if (body.includes(marker)) {
        errors.push(
          `${file} references retired active doc path ${marker}; use docs/current or docs/archive/2026-05-21-docs-consolidation instead.`,
        );
      }
    }
  }
}

const retiredMobileFeaturePaths = [
  'apps/mobile/components/agents',
  'apps/mobile/components/auth',
  'apps/mobile/components/chat',
  'apps/mobile/components/Composer',
  'apps/mobile/components/companion',
  'apps/mobile/components/connectors',
  'apps/mobile/components/drawer',
  'apps/mobile/components/edge-cases',
  'apps/mobile/components/image',
  'apps/mobile/components/integrations',
  'apps/mobile/components/messaging',
  'apps/mobile/components/model-picker',
  'apps/mobile/components/onboarding',
  'apps/mobile/components/Paywall',
  'apps/mobile/components/paywall',
  'apps/mobile/components/settings',
  'apps/mobile/components/shared',
  'apps/mobile/components/sidebar',
  'apps/mobile/components/voice',
  'apps/mobile/components/waitlist/CloudWaitlistSheet.tsx',
  'apps/mobile/services/waitlist.ts',
  'apps/mobile/stores/waitlistStore.ts',
  'apps/mobile/components/projects/ProjectCard.tsx',
  'apps/mobile/components/billing/UpsellCard.tsx',
  'apps/mobile/services/billing.ts',
  'apps/mobile/components/schedules/QuickSchedule.tsx',
  'apps/mobile/components/schedules/RecurrencePicker.tsx',
  'apps/mobile/components/schedules/ScheduleCard.tsx',
  'apps/mobile/components/schedules/ScheduleForm.tsx',
  'apps/mobile/components/schedules/ScheduleRunHistory.tsx',
  'apps/mobile/services/schedules.ts',
  'apps/mobile/stores/scheduleStore.ts',
  'apps/mobile/services/messaging.ts',
  'apps/mobile/services/tts.ts',
  'apps/mobile/services/voice.ts',
  'apps/mobile/services/voiceInput.ts',
  'apps/mobile/services/voiceOutput.ts',
  'apps/mobile/stores/messagingStore.ts',
  'apps/mobile/services/modelCatalog.ts',
  'apps/mobile/services/tierGuard.ts',
  'apps/mobile/stores/modelStore.ts',
  'apps/mobile/stores/projectStore.ts',
  'apps/mobile/services/deviceIntegrations.ts',
  'apps/mobile/services/healthData.ts',
  'apps/mobile/services/healthKitPermission.ts',
  'apps/mobile/services/healthKitQuery.ts',
  'apps/mobile/stores/integrationStore.ts',
  'apps/mobile/services/imagegen.ts',
  'apps/mobile/services/ocr.ts',
  'apps/mobile/services/vision.ts',
  'apps/mobile/hooks/useBiometricGate.ts',
  'apps/mobile/services/ageGate.ts',
  'apps/mobile/stores/authStore.ts',
  'apps/mobile/stores/tierStore.ts',
  'apps/mobile/services/contextBudgeter.ts',
  'apps/mobile/services/memory.ts',
  'apps/mobile/services/memoryCompactor.ts',
  'apps/mobile/services/memoryImport.ts',
  'apps/mobile/services/ragChunker.ts',
  'apps/mobile/services/ragIndex.ts',
  'apps/mobile/stores/memoryStore.ts',
  'apps/mobile/services/skills.ts',
  'apps/mobile/stores/skillsStore.ts',
  'apps/mobile/hooks/useTheme.ts',
  'apps/mobile/hooks/useVoicePlayback.ts',
  'apps/mobile/lib/theme.ts',
  'apps/mobile/lib/voicePresets.ts',
];

for (const retiredMobileFeaturePath of retiredMobileFeaturePaths) {
  if (!exists(retiredMobileFeaturePath)) continue;

  const absoluteRetiredPath = path.join(root, retiredMobileFeaturePath);
  if (fs.statSync(absoluteRetiredPath).isFile()) {
    errors.push(`Retired Mobile feature path must stay removed: ${retiredMobileFeaturePath}`);
    continue;
  }

  for (const file of walk(retiredMobileFeaturePath)) {
    errors.push(`Retired Mobile feature path must stay removed: ${file}`);
  }
}

for (const file of walk('apps/web/features')) {
  // These markers target apps/web's own retired src/features/ layout. A web
  // feature doc may still legitimately cite another surface's real path — the
  // CLI genuinely lives at apps/cli/src/features/… — so drop other-app paths
  // before scanning rather than forcing docs to obscure a true location.
  const body = readText(file).replace(
    /apps\/(?:cli|desktop|mobile|extension|extension-vscode)\/\S*/g,
    '',
  );
  for (const marker of forbiddenFeatureMarkers) {
    if (body.includes(marker)) {
      errors.push(`${file} contains stale split-feature marker: ${marker}`);
    }
  }
}

const mobileFeatureForbiddenImports = [
  '@/components/agents/',
  '@/components/auth/',
  '@/components/chat/',
  '@/components/Composer/',
  '@/components/companion/',
  '@/components/connectors/',
  '@/components/drawer/',
  '@/components/edge-cases/',
  '@/components/image/',
  '@/components/integrations/',
  '@/components/messaging/',
  '@/components/model-picker/',
  '@/components/onboarding/',
  '@/components/Paywall/',
  '@/components/paywall/',
  '@/components/settings/',
  '@/components/shared/',
  '@/components/sidebar/',
  '@/components/voice/',
  '../components/agents/',
  '../components/auth/',
  '../components/chat/',
  '../components/Composer/',
  '../components/companion/',
  '../components/connectors/',
  '../components/drawer/',
  '../components/edge-cases/',
  '../components/image/',
  '../components/integrations/',
  '../components/messaging/',
  '../components/model-picker/',
  '../components/onboarding/',
  '../components/Paywall/',
  '../components/paywall/',
  '../components/settings/',
  '../components/shared/',
  '../components/sidebar/',
  '../components/voice/',
  '@/components/waitlist/CloudWaitlistSheet',
  '@/services/waitlist',
  '@/stores/waitlistStore',
  '../services/waitlist',
  '../stores/waitlistStore',
  '@/components/projects/ProjectCard',
  '../components/projects/ProjectCard',
  '@/components/billing/UpsellCard',
  '../components/billing/UpsellCard',
  '@/services/billing',
  '../services/billing',
  '@/components/schedules/QuickSchedule',
  '@/components/schedules/RecurrencePicker',
  '@/components/schedules/ScheduleCard',
  '@/components/schedules/ScheduleForm',
  '@/components/schedules/ScheduleRunHistory',
  '@/services/schedules',
  '@/stores/scheduleStore',
  '../services/schedules',
  '../stores/scheduleStore',
  '@/services/messaging',
  '@/services/tts',
  '@/services/voice',
  '@/services/voiceInput',
  '@/services/voiceOutput',
  '@/stores/messagingStore',
  '../services/messaging',
  '../services/tts',
  '../services/voice',
  '../services/voiceInput',
  '../services/voiceOutput',
  '../stores/messagingStore',
  '@/services/modelCatalog',
  '@/services/tierGuard',
  '@/stores/modelStore',
  '../services/modelCatalog',
  '../services/tierGuard',
  '../stores/modelStore',
  '@/stores/projectStore',
  '../stores/projectStore',
  '@/services/deviceIntegrations',
  '@/services/healthData',
  '@/services/healthKitPermission',
  '@/services/healthKitQuery',
  '@/stores/integrationStore',
  '../services/deviceIntegrations',
  '../services/healthData',
  '../services/healthKitPermission',
  '../services/healthKitQuery',
  '../stores/integrationStore',
  '@/services/imagegen',
  '@/services/ocr',
  '@/services/vision',
  '../services/imagegen',
  '../services/ocr',
  '../services/vision',
  '@/hooks/useBiometricGate',
  '@/services/ageGate',
  '@/stores/authStore',
  '../hooks/useBiometricGate',
  '../services/ageGate',
  '../stores/authStore',
  '@/stores/tierStore',
  '../stores/tierStore',
  '@/services/contextBudgeter',
  '@/services/memory',
  '@/services/memoryCompactor',
  '@/services/memoryImport',
  '@/services/ragChunker',
  '@/services/ragIndex',
  '@/stores/memoryStore',
  '../services/contextBudgeter',
  '../services/memory',
  '../services/memoryCompactor',
  '../services/memoryImport',
  '../services/ragChunker',
  '../services/ragIndex',
  '../stores/memoryStore',
  '@/services/skills',
  '@/stores/skillsStore',
  '../services/skills',
  '../stores/skillsStore',
  '@/hooks/useTheme',
  '@/hooks/useVoicePlayback',
  '@/lib/theme',
  '@/lib/voicePresets',
  '../hooks/useTheme',
  '../hooks/useVoicePlayback',
  '../lib/theme',
  '../lib/voicePresets',
];

const retiredDesktopFeatureShimPaths = [
  // SCALE-PURE-003: the Phase 5 reorg moved this hook to
  // src/features/updates/useUpdater.ts and left a `export * from` forwarder
  // behind so old import paths kept resolving. Its one caller
  // (features/settings/UpdateSettings.tsx) now imports the real module, the
  // forwarder is deleted, and this line stops it coming back.
  'apps/desktop/src/hooks/useUpdater.ts',
  'apps/desktop/src/components/Analytics/index.ts',
  'apps/desktop/src/components/Errors/ErrorToast.tsx',
  'apps/desktop/src/components/ErrorBoundary.tsx',
  'apps/desktop/src/components/Feedback/index.ts',
  'apps/desktop/src/components/Layout/UserProfile.tsx',
  'apps/desktop/src/components/Layout/index.ts',
  'apps/desktop/src/components/Notifications/index.ts',
  'apps/desktop/src/components/OfflineIndicator.tsx',
  'apps/desktop/src/components/Onboarding/index.ts',
  'apps/desktop/src/components/ResourceMonitor/index.ts',
  'apps/desktop/src/components/StatusBanner.tsx',
  'apps/desktop/src/components/Updates/index.tsx',
];

// SCALE-PURE-003: forwarding modules the Extension reorg left at the old paths.
// Each was a one-line `export * from` onto the real module under
// `src/features/**`, so the app carried two import paths for one
// implementation. `src/pairing.ts` was the inverse — the implementation stayed
// at the retired path and `features/native-bridge/pairing.ts` forwarded to it —
// and moved into the feature directory when its forwarder was removed.
const retiredExtensionShimPaths = [
  'apps/extension/src/inPagePanel/launcher.ts',
  'apps/extension/src/inPagePanel/panel.ts',
  'apps/extension/src/inPagePanel/panelStyles.ts',
  'apps/extension/src/pairing.ts',
  'apps/extension/src/platform-prompts.ts',
  'apps/extension/src/sendQueue.ts',
];

// Only markers that cannot collide with a legitimate path are listed. Bare
// `'./pairing'` and `'./sendQueue'` are excluded on purpose: those are how
// `src/features/native-bridge/index.ts` re-exports its own directory, which is
// a barrel rather than a second path to one module. Re-creating either deleted
// file is caught by retiredExtensionShimPaths above instead.
const extensionForbiddenImports = [
  './inPagePanel/launcher',
  './inPagePanel/panel',
  './platform-prompts',
  '/src/pairing',
];

const retiredDesktopComponentDomains = [
  'AGI',
  'Agent',
  'AgentCollaboration',
  'AgentStatusMonitor',
  'Artifacts',
  'Auth',
  'Automation',
  'BackgroundTasks',
  'Browser',
  'Calendar',
  'Canvas',
  'Cloud',
  'Code',
  'ComputerUse',
  'Connectors',
  'Cowork',
  'CustomInstructions',
  'Database',
  'Document',
  'Documents',
  'DynamicCanvas',
  'Editor',
  'ErrorHandling',
  'Execution',
  'ExecutionSidecar',
  'FileUpload',
  'Filesystem',
  'FloatingChat',
  'Git',
  'Governance',
  'Images',
  'Marketplace',
  'Media',
  'Memory',
  'MemoryPanel',
  'Messaging',
  'MCP',
  'Mobile',
  'Outcomes',
  'Overlay',
  'Planning',
  'Pricing',
  'Productivity',
  'QuickQuery',
  'Reminders',
  'Research',
  'ROIDashboard',
  'Scheduler',
  'Schedules',
  'ScreenCapture',
  'Settings',
  'SkillMarketplace',
  'SimpleMode',
  'Subscription',
  'Teams',
  'Terminal',
  'ToolCalling',
  'Tools',
  'UnifiedAgenticChat',
  'Vision',
  'Voice',
  'Workflows',
  'editing',
  // SCALE-PURE-003: `src/components/ui/` was a 39-file forwarding layer left
  // behind by the Phase 5 reorg — every file was `export * from '../../ui/X'`
  // and its own header promised a "Step B (deferred)" deletion with no owner
  // and no date, so it never happened. All 172 importers now name
  // `@/ui/X` (or `./ui/X`) directly and the directory is gone. Listing the
  // domain here keeps the directory empty and makes any re-introduced
  // `@/components/ui` import fail this check.
  'ui',
  'v3',
];

const retiredDesktopFeatureDirs = retiredDesktopComponentDomains.map(
  (domain) => `apps/desktop/src/components/${domain}`,
);

for (const retiredDesktopFeatureShimPath of retiredDesktopFeatureShimPaths) {
  if (exists(retiredDesktopFeatureShimPath)) {
    errors.push(`Retired Desktop feature shim must stay removed: ${retiredDesktopFeatureShimPath}`);
  }
}

for (const retiredDesktopFeatureDir of retiredDesktopFeatureDirs) {
  for (const file of walk(retiredDesktopFeatureDir)) {
    errors.push(`Retired Desktop feature directory must stay empty/removed: ${file}`);
  }
}

const retiredDesktopFeatureImports = retiredDesktopComponentDomains.flatMap((domain) => [
  `./components/${domain}/`,
  `./components/${domain}'`,
  `./components/${domain}"`,
  `../components/${domain}/`,
  `../components/${domain}'`,
  `../components/${domain}"`,
  `@/components/${domain}`,
  `@components/${domain}`,
]);

const desktopFeatureForbiddenImports = [
  './components/Analytics',
  './components/Errors/ErrorToast',
  './components/ErrorBoundary',
  './components/Feedback',
  './components/Layout',
  './components/Layout/UserProfile',
  './components/Notifications',
  './components/OfflineIndicator',
  './components/Onboarding',
  './components/ResourceMonitor',
  './components/StatusBanner',
  './components/Updates',
  '../components/Analytics',
  '../components/Errors/ErrorToast',
  '../components/ErrorBoundary',
  '../components/Feedback',
  '../components/Layout',
  '../components/Layout/UserProfile',
  '../components/Notifications',
  '../components/OfflineIndicator',
  '../components/Onboarding',
  '../components/ResourceMonitor',
  '../components/StatusBanner',
  '../components/Updates',
  '@/components/Analytics',
  '@/components/Errors/ErrorToast',
  '@/components/ErrorBoundary',
  '@/components/Feedback',
  '@/components/Layout',
  '@/components/Layout/UserProfile',
  '@/components/Notifications',
  '@/components/OfflineIndicator',
  '@/components/Onboarding',
  '@/components/ResourceMonitor',
  '@/components/StatusBanner',
  '@/components/Updates',
  '../UnifiedAgenticChat',
  ...retiredDesktopFeatureImports,
];

const userFacingCliDocs = [
  'README.md',
  'apps/cli/README.md',
  'apps/cli/npm/README.md',
  'apps/cli/scripts/demo.sh',
  'docs/surfaces/cli.md',
  'docs/current/agent-and-repo-operability.md',
  'docs/engineering/naming-conventions.md',
  'docs/decisions/CURRENT_DECISIONS.md',
].filter(exists);

const legacyCommandPattern =
  /\bagiworkforce\s+(login|exec|sync|plugin|session|onboarding|mcp|marketplace|ecosystem|app|init|auth-status|features|execpolicy|help|--debug|--chrome|--no-chrome|--no-tui|--resume|-p)\b/g;

for (const file of userFacingCliDocs) {
  const body = readText(file);
  const matches = [...body.matchAll(legacyCommandPattern)];
  for (const match of matches) {
    errors.push(
      `${file} uses legacy CLI command example "${match[0]}"; use "agi ${match[1]}" unless explicitly documenting the compatibility alias.`,
    );
  }
}

const workspaceFilterFiles = [
  'BUILD.md',
  'vercel.json',
  '.github/workflows/ci.yml',
  'infrastructure/sandbox/README.md',
  'apps/web/scripts/build-chat-spa.sh',
  'apps/web/scripts/build-with-chat.sh',
  'scripts/verify-surfaces.sh',
  'scripts/launch-verify.sh',
  'docs/plans/domain-first-reorg.md',
  'docs/surfaces/web.md',
].filter(exists);

for (const file of workspaceFilterFiles) {
  const body = readText(file);
  if (body.includes('--filter web')) {
    errors.push(`${file} uses ambiguous pnpm filter "--filter web"; use "@agiworkforce/web".`);
  }
}

for (const file of walk('apps/mobile')) {
  if (!/\.(ts|tsx)$/.test(file)) continue;
  const body = readText(file);
  for (const marker of mobileFeatureForbiddenImports) {
    if (body.includes(marker)) {
      errors.push(`${file} imports retired Mobile feature path: ${marker}`);
    }
  }
}

for (const file of walk('apps/desktop/src')) {
  if (!/\.(ts|tsx)$/.test(file)) continue;
  const body = readText(file);
  for (const marker of desktopFeatureForbiddenImports) {
    if (body.includes(marker)) {
      errors.push(`${file} imports retired Desktop feature shim: ${marker}`);
    }
  }
}

// SCALE-PURE-003 (Extension arm). These five modules were `export * from` the
// real implementation under `src/features/**`, each carrying an `@deprecated`
// note and no owner or removal date, so callers kept resolving through the old
// path indefinitely. The implementations never moved back; only the forwarders
// are gone, and every caller now imports the feature path directly.
for (const retiredExtensionShimPath of retiredExtensionShimPaths) {
  if (exists(retiredExtensionShimPath)) {
    errors.push(`Retired Extension shim must stay removed: ${retiredExtensionShimPath}`);
  }
}

for (const file of walk('apps/extension')) {
  if (!/\.(ts|tsx)$/.test(file)) continue;
  const body = readText(file);
  for (const marker of extensionForbiddenImports) {
    if (body.includes(marker)) {
      errors.push(`${file} imports retired Extension shim: ${marker}`);
    }
  }
}

if (exists('docs/surfaces/desktop.md')) {
  const desktopSurfaceDoc = readText('docs/surfaces/desktop.md');
  const staleDesktopChatClaims = [
    'from `UnifiedAgenticChat/`',
    '`apps/desktop/src/components/UnifiedAgenticChat/` is partially dead',
    'then delete the legacy `UnifiedAgenticChat/` dir entirely',
  ];

  for (const staleClaim of staleDesktopChatClaims) {
    if (desktopSurfaceDoc.includes(staleClaim)) {
      errors.push(
        `docs/surfaces/desktop.md contains stale Desktop chat migration claim: ${staleClaim}`,
      );
    }
  }
}

if (exists('docs/cli/COMMAND_SURFACE.md')) {
  const commandSurfaceDoc = readText('docs/cli/COMMAND_SURFACE.md');
  if (commandSurfaceDoc.includes('Known explicitly advertised-but-unhandled')) {
    errors.push(
      'docs/cli/COMMAND_SURFACE.md must classify TUI slash-command coverage through direct arms and shared parity fallback, not a stale unhandled list.',
    );
  }
}

requireIncludes('apps/web/README.md', '`features/` - product-domain feature code.');
requireIncludes('apps/web/features/index.ts', 'canonical Web product-domain root');
requireIncludes('docs/plans/domain-first-reorg.md', '`apps/web/features/`');
requireIncludes('docs/plans/domain-first-reorg.md', '`apps/mobile/src/features');
requireIncludes('docs/plans/domain-first-reorg.md', '`apps/desktop/src/features');
requireIncludes('docs/surfaces/desktop.md', 'Retired chat folder');
requireIncludes('docs/surfaces/desktop.md', 'apps/desktop/src/features/chat/');
requireIncludes('docs/cli/COMMAND_SURFACE.md', 'Shared Claude-parity fallback');
requireIncludes(
  'docs/cli/COMMAND_SURFACE.md',
  'registered_builtin_commands_have_tui_runtime_coverage',
);
requireIncludes(
  'apps/mobile/src/features/schedules/README.md',
  'apps/mobile/src/features/schedules',
);
requireIncludes('apps/mobile/src/features/schedules/index.ts', 'public API barrel');
requireIncludes('apps/mobile/components/README.md', 'retained only for shared UI primitives');
requireIncludes('apps/mobile/src/features/voice/README.md', 'Cloud STT/TTS calls');
requireIncludes('docs/engineering/naming-conventions.md', 'Primary CLI command: `agi`.');
requireIncludes(
  'docs/engineering/naming-conventions.md',
  'Compatibility CLI alias: `agiworkforce`.',
);
requireIncludes(
  'docs/engineering/naming-conventions.md',
  'Use `PLAN.md` for active strategic plan and phase structure.',
);
requireIncludes('apps/cli/Cargo.toml', 'default-run = "agi"');
requireIncludes('apps/cli/Cargo.toml', 'name = "agi"\npath = "src/main.rs"');
requireIncludes('apps/cli/Cargo.toml', 'name = "agiworkforce"\npath = "src/bin/agiworkforce.rs"');
requireIncludes('apps/cli/npm/package.json', '"agi": "bin/agi.js"');
requireIncludes('apps/cli/npm/package.json', '"agiworkforce": "bin/agiworkforce.js"');
requireIncludes('vercel.json', 'bash apps/web/scripts/build-with-chat.sh');
requireIncludes(
  'apps/web/scripts/build-with-chat.sh',
  'pnpm --filter @agiworkforce/web build:next-only',
);
requireIncludes('.github/workflows/ci.yml', 'pnpm exec turbo run build --affected');
requireIncludes('.github/workflows/ci.yml', '--filter=@agiworkforce/web');
requireIncludes('.github/workflows/release-cli.yml', "- 'v-cli-*'");
requireIncludes('.github/workflows/release-cli.yml', 'agiworkforce-*.${{ matrix.archive }}');
requireIncludes('.github/workflows/release-cli.yml', 'platform: linux-arm64');
requireIncludes('.github/workflows/release-cli.yml', 'Replace("win32-", "windows-")');
requireIncludes('scripts/install.sh', 'agiworkforce-{platform}.{ext}');
requireIncludes('scripts/update-homebrew-tap.sh', 'agiworkforce-$platform.tar.gz');
requireIncludes('scripts/update-homebrew-tap.sh', 'SHA_LINUX_ARM64');

if (errors.length > 0) {
  console.error('Structure convention check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Structure convention check passed.');
