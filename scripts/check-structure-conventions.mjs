#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

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

const forbiddenWebSrcFeatureFiles = walk('apps/web/src/features');
for (const file of forbiddenWebSrcFeatureFiles) {
  errors.push(`Web product feature code must live in apps/web/features, not ${file}`);
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
  ...walk('docs/launch'),
  ...walk('docs/design'),
  ...walk('docs/research'),
  'apps/mobile/README.md',
  'packages/data-layer/README.md',
  'supabase/README.md',
  ...walk('packages/data-layer/src'),
  ...walk('packages/unified-chat/src'),
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
  const body = readText(file);
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
];

const retiredDesktopFeatureShimPaths = [
  'apps/desktop/src/components/Analytics/index.ts',
  'apps/desktop/src/components/Errors/ErrorToast.tsx',
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

const retiredDesktopFeatureDirs = [
  'apps/desktop/src/components/Artifacts',
  'apps/desktop/src/components/Browser',
  'apps/desktop/src/components/Canvas',
  'apps/desktop/src/components/ComputerUse',
  'apps/desktop/src/components/Connectors',
  'apps/desktop/src/components/Execution',
  'apps/desktop/src/components/ExecutionSidecar',
  'apps/desktop/src/components/Marketplace',
  'apps/desktop/src/components/Memory',
  'apps/desktop/src/components/MemoryPanel',
  'apps/desktop/src/components/Messaging',
  'apps/desktop/src/components/MCP',
  'apps/desktop/src/components/Mobile',
  'apps/desktop/src/components/Planning',
  'apps/desktop/src/components/Pricing',
  'apps/desktop/src/components/QuickQuery',
  'apps/desktop/src/components/Reminders',
  'apps/desktop/src/components/Settings',
  'apps/desktop/src/components/Research',
  'apps/desktop/src/components/SkillMarketplace',
  'apps/desktop/src/components/SimpleMode',
  'apps/desktop/src/components/Subscription',
  'apps/desktop/src/components/Teams',
  'apps/desktop/src/components/Terminal',
  'apps/desktop/src/components/ToolCalling',
  'apps/desktop/src/components/Tools',
  'apps/desktop/src/components/UnifiedAgenticChat',
  'apps/desktop/src/components/Vision',
  'apps/desktop/src/components/Voice',
  'apps/desktop/src/components/Workflows',
];

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

const desktopFeatureForbiddenImports = [
  './components/Artifacts',
  './components/Browser',
  './components/Canvas',
  './components/ComputerUse',
  './components/Connectors',
  './components/Analytics',
  './components/Errors/ErrorToast',
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
  '@/components/Feedback',
  '@/components/Layout',
  '@/components/Layout/UserProfile',
  '@/components/Notifications',
  '@/components/OfflineIndicator',
  '@/components/Onboarding',
  '@/components/ResourceMonitor',
  '@/components/StatusBanner',
  '@/components/Updates',
  './components/Execution',
  './components/ExecutionSidecar',
  './components/Marketplace/',
  './components/Memory',
  './components/MemoryPanel',
  './components/Messaging',
  './components/MCP',
  './components/Mobile',
  './components/Planning',
  './components/Pricing',
  './components/QuickQuery',
  './components/Reminders',
  './components/Settings',
  './components/Research',
  './components/SkillMarketplace',
  './components/SimpleMode',
  './components/Subscription',
  './components/Teams',
  './components/Terminal',
  './components/ToolCalling',
  './components/Tools',
  './components/UnifiedAgenticChat',
  './components/Vision',
  './components/Voice',
  './components/Workflows',
  '../components/Artifacts',
  '../components/Browser',
  '../components/Canvas',
  '../components/ComputerUse',
  '../components/Connectors',
  '../components/Execution',
  '../components/ExecutionSidecar',
  '../components/Marketplace',
  '../components/Memory',
  '../components/MemoryPanel',
  '../components/Messaging',
  '../components/MCP',
  '../components/Mobile',
  '../components/Planning',
  '../components/Pricing',
  '../components/QuickQuery',
  '../components/Reminders',
  '../components/Settings',
  '../components/Research',
  '../components/SkillMarketplace',
  '../components/SimpleMode',
  '../components/Subscription',
  '../components/Teams',
  '../components/Terminal',
  '../components/ToolCalling',
  '../components/Tools',
  '../components/UnifiedAgenticChat',
  '../UnifiedAgenticChat',
  '../components/Vision',
  '../components/Voice',
  '../components/Workflows',
  '@/components/Artifacts',
  '@/components/Browser',
  '@/components/Canvas',
  '@/components/ComputerUse',
  '@/components/Connectors',
  '@/components/Execution',
  '@/components/ExecutionSidecar',
  '@/components/Marketplace',
  '@/components/Memory',
  '@/components/MemoryPanel',
  '@/components/Messaging',
  '@/components/MCP',
  '@/components/Mobile',
  '@/components/Planning',
  '@/components/Pricing',
  '@/components/QuickQuery',
  '@/components/Reminders',
  '@/components/Settings',
  '@/components/Research',
  '@/components/SkillMarketplace',
  '@/components/SimpleMode',
  '@/components/Subscription',
  '@/components/Teams',
  '@/components/Terminal',
  '@/components/ToolCalling',
  '@/components/Tools',
  '@/components/UnifiedAgenticChat',
  '@components/Artifacts',
  '@components/Browser',
  '@components/Canvas',
  '@components/ComputerUse',
  '@components/Connectors',
  '@components/Execution',
  '@components/ExecutionSidecar',
  '@components/Marketplace',
  '@components/Memory',
  '@components/MemoryPanel',
  '@components/Research',
  '@components/SkillMarketplace',
  '@components/ToolCalling',
  '@components/UnifiedAgenticChat',
  '@/components/Vision',
  '@/components/Voice',
  '@/components/Workflows',
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
  'apps/sandbox/README.md',
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

requireIncludes('apps/web/README.md', '`features/` - product-domain feature code.');
requireIncludes('apps/web/src/README.md', 'Product-domain code belongs in');
requireIncludes('apps/web/features/index.ts', 'canonical Web product-domain root');
requireIncludes('docs/plans/domain-first-reorg.md', '`apps/web/features/`');
requireIncludes('docs/plans/domain-first-reorg.md', '`apps/mobile/src/features');
requireIncludes('docs/plans/domain-first-reorg.md', '`apps/desktop/src/features');
requireIncludes(
  'apps/mobile/src/features/schedules/README.md',
  'apps/mobile/src/features/schedules',
);
requireIncludes('apps/mobile/src/features/schedules/index.ts', 'public API barrel');
requireIncludes('apps/mobile/components/README.md', 'retained only for shared UI primitives');
requireIncludes('apps/mobile/src/features/voice/README.md', 'Cloud STT/TTS calls');
requireIncludes('apps/mobile/src/features/messaging/README.md', 'store.ts');
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
requireIncludes('vercel.json', 'pnpm --filter @agiworkforce/web build');
requireIncludes('.github/workflows/ci.yml', 'pnpm --filter @agiworkforce/web build');
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
